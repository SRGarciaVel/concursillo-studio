# Arquitectura · Concursillo Studio

Documento para colaboradores. Explica cómo encajan las piezas, por qué están así y cómo extender la app sin romper nada.

**Índice**

1. [Visión general](#1-visión-general)
2. [Por qué Rust para el motor y React para la UI](#2-por-qué-rust-para-el-motor-y-react-para-la-ui)
3. [Modelo cliente-servidor con WebSocket](#3-modelo-cliente-servidor-con-websocket)
4. [Estructura del repositorio](#4-estructura-del-repositorio)
5. [Estructuras de datos](#5-estructuras-de-datos)
6. [Tipos compartidos Rust → TypeScript](#6-tipos-compartidos-rust--typescript)
7. [Flujo de desarrollo](#7-flujo-de-desarrollo)
8. [Guías de extensión](#8-guías-de-extensión)
9. [Producción y empaquetado](#9-producción-y-empaquetado)
10. [Decisiones de seguridad](#10-decisiones-de-seguridad)

---

## 1. Visión general

```text
┌──────────────────────────── Proceso Tauri (un solo .exe) ────────────────────────────┐
│                                                                                       │
│  Ventana "main" (Control)          Ventana "editor" (Editor)                          │
│  React · WebView2                  React · WebView2                                   │
│     │  ▲                              │                                               │
│     │  │ WebSocket (estado)           │ IPC de Tauri (invoke): ficheros, presets,      │
│     │  │                              │ importación masiva, sonidos, abrir ventanas    │
│     ▼  │                              ▼                                               │
│  ┌────────────────────────── Servidor Axum · 127.0.0.1:4322 ────────────────────────┐ │
│  │  /ws       → comandos ⇄ estado (broadcast a todos los clientes)                   │ │
│  │  /stage/   → vista para OBS (assets embebidos en el .exe)                         │ │
│  │  /sounds/  → efectos de sonido (data/sounds)                                      │ │
│  │                                                                                   │ │
│  │  AppState { game: Arc<RwLock<GameState>>, tx: broadcast, twitch: TwitchManager }  │ │
│  │  Tareas tokio: reloj (100 ms) · conexión IRC de Twitch                            │ │
│  └───────────────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘
          ▲ WebSocket + HTTP                                     ▲ IRC (TLS)
          │                                                      │
     OBS Browser Source (Stage)                           irc.chat.twitch.tv
```

Regla de oro (`CLAUDE.md`): **el estado del juego vive siempre en Rust. El frontend es presentacional.** Las vistas envían *intenciones* (comandos) y pintan el estado que reciben; nunca deciden reglas.

---

## 2. Por qué Rust para el motor y React para la UI

**Rust (backend, `src-tauri/`)**

- **Una sola fuente de verdad.** Control, Stage (en OBS) y Editor son clientes distintos, incluso procesos distintos. Si las reglas vivieran en el frontend, cada cliente podría divergir. En Rust hay un único `GameState` protegido por un `RwLock`.
- **Concurrencia segura.** El reloj, la conexión a Twitch y N clientes WebSocket modifican o leen el estado a la vez. El sistema de tipos de Rust y tokio hacen que las carreras de datos sean errores de compilación, no bugs en directo.
- **Reglas testeables.** El motor (`game/`, `comodines/`, `rosco.rs`, `presets.rs`, …) son funciones puras sobre `GameState`: casi 100 tests unitarios sin UI, incluido el reloj con tiempo simulado (`tokio::time::pause`).
- **Tauri v2, no Electron** (regla del proyecto). Binario pequeño (≈15 MB, instalador ≈3–5 MB), usa el WebView2 del sistema y da acceso nativo (sistema de archivos, ventanas) con un modelo de permisos explícito.

**React + Vite (frontend, `apps/` y `packages/`)**

- Las vistas son **función del estado**: React encaja con "me llega un `GameState`, lo pinto".
- Vite da recarga instantánea en desarrollo y un build estático que Tauri empaqueta.
- El **Stage** es una página web normal: OBS la carga como *Browser Source* sin plugins.
- Temas con **variables CSS** inyectadas desde JSON: cambiar el tema no requiere recompilar.

---

## 3. Modelo cliente-servidor con WebSocket

### Protocolo

Todos los mensajes son JSON con *tagging* adyacente (`serde(tag, content)`).

**Cliente → servidor** (`ClientCommand`, `src-tauri/src/server/mod.rs`):

```json
{ "action": "submit_answer", "payload": 2 }
{ "action": "rosco_answer", "payload": { "is_correct": true } }
{ "action": "start_preset", "payload": { "preset": { … } } }
{ "action": "next_round" }
```

**Servidor → clientes** (`ServerMessage`):

```json
{ "type": "state", "payload": { …GameState… } }
{ "type": "audio", "payload": { "sound": "play_correct" } }
{ "type": "error", "payload": "Cierra el comodín Chat antes de responder" }
```

### Flujo de un comando

```text
Control ──ws──▶ handle_socket ──▶ AppState::apply(cmd)
                                   ├─ toma el lock de escritura del GameState
                                   ├─ aplica la regla (GameState::submit_answer, use_comodin, …)
                                   │     └─ si falla → Err(msg) → solo al cliente que lo envió
                                   └─ broadcast(estado [+ sonido]) CON el lock tomado
                                         └─▶ todos los clientes (Control, Stage, …)
```

Detalles importantes:

- **Orden garantizado.** El broadcast se hace con el lock de escritura tomado, así que el orden de los mensajes es el orden real de los cambios. El sonido siempre llega *después* del estado que lo provoca.
- **Errores dirigidos.** Un comando rechazado no emite nada a los demás; el error va solo a quien lo envió (canal `mpsc` por conexión).
- **Clientes lentos.** Si un cliente se queda atrás en el canal `broadcast` (`Lagged`), se le envía el estado actual completo en lugar de los mensajes perdidos.
- **Al conectar** cada cliente se suscribe *antes* de leer el estado inicial, para no perder cambios intermedios.
- **Reconexión** en el cliente (`useGameSocket`): *backoff* exponencial de 0,5 s a 5 s.

### Tareas en segundo plano

| Tarea | Archivo | Qué hace |
|---|---|---|
| Reloj | `server/timer.rs` | Tick cada 100 ms con el tiempo real transcurrido; el motor acumula milisegundos y descuenta segundos enteros (error máximo ≈100 ms). Solo emite cuando cambia un segundo. |
| Twitch | `twitch/mod.rs` | Una tarea dueña del cliente IRC. Solo bloquea el estado si un mensaje *parece* un voto; agrupa los broadcasts de votos (máx. cada 200 ms). Se aborta al desconectar. |

### IPC de Tauri frente a WebSocket

- **WebSocket**: todo lo que es *estado de partida* (lo necesitan Control y Stage, y el Stage vive en OBS, fuera de Tauri).
- **IPC (`invoke`)**: operaciones locales del Editor/Control que no son estado compartido: leer y escribir sets, presets y sonidos, parsear texto, abrir ventanas. Cuando una de estas operaciones afecta a los clientes (por ejemplo, cambiar un sonido), el comando IPC también hace broadcast por el `AppState` (gestionado por Tauri con `app.manage`).

---

## 4. Estructura del repositorio

```text
apps/
  control/        Panel del presentador (ventana principal)
  editor/         Preguntas, presets, sonidos (segunda ventana)
  stage/          Vista para OBS (servida en /stage/)
packages/
  shared-types/   Tipos TS GENERADOS desde Rust (ts-rs) + index.ts
  ui/             Hook useGameSocket, SoundPlayer, llamadas IPC, utilidades del rosco y comodines
  themes/         Temas JSON (variables CSS) + applyTheme()
src-tauri/
  src/
    lib.rs          Arranque: ventanas, comandos IPC, estado gestionado, servidor
    schemas/        Question, QuestionMeta, GameMode, Difficulty
    game/           GameState, fases, reloj · rosco.rs (motor del Rosco)
    comodines/      Comodines, plantarse, niveles asegurados, hitos
    presets.rs      Preset, validación, start_preset, persistencia
    twitch/         Parser de votos, conexión IRC
    bulk.rs         Importador masivo TXT/CSV
    sounds.rs       Subida y restauración de sonidos
    files.rs        Sets de preguntas, rutas seguras, siembra de datos
    server/         Axum: /ws, /stage, /sounds · timer.rs · stage.rs
  capabilities/   Permisos de Tauri (qué ventanas pueden llamar a qué comandos)
  build.rs        Declara los comandos propios para generar sus permisos
data/
  questions/  presets/  sounds/   Datos de ejemplo (se empaquetan como recursos)
docs/
scripts/          Utilidades de build (limpiar dist/)
```

---

## 5. Estructuras de datos

### `Question` (`schemas/mod.rs`)

```rust
pub struct Question {
    pub id: String,              // UUID (importador) o libre
    pub mode: GameMode,          // Millonario | Rosco
    pub category: String,
    pub difficulty: Difficulty,  // Easy | Medium | Hard
    pub question: String,        // En el Rosco: la definición
    pub answers: Vec<String>,    // Rosco con respuesta libre: un solo elemento
    pub correct: usize,          // índice en `answers`
    pub meta: Option<QuestionMeta>, // Rosco: rosco_letter, rosco_starts_with
}
```

### `GameState` (`game/mod.rs`)

Un único estado para ambos modos. Los campos comunes sirven a los dos y los específicos son opcionales:

| Grupo | Campos | Notas |
|---|---|---|
| Partida | `mode`, `phase`, `current_question_index`, `total_questions`, `current_question`, `selected_answer`, `is_correct`, `streak` | `phase`: `Idle → ReadingQuestion → Answering → … → Won / GameOver / Retired` |
| Reloj | `time_remaining`, `time_limit`, `timer_paused` | Millonario: por pregunta. Rosco: total. |
| Rosco | `rosco: Option<RoscoState>` | Letras, estados (`Pending/Passed/Correct/Wrong`), contadores, `min_correct`. |
| Comodines | `comodines`, `active_comodin`, `comodin_time_remaining/limit` | Con un comodín activo, el reloj de la pregunta se congela. |
| Escalera | `correct_answers`, `safety_net`, `prize_level`, `can_retire`, `hito_8`, `hito_11` | Plantarse paga `correct_answers`; fallar paga `safety_net`. |
| Twitch | `twitch: TwitchInfo`, `chat_votes: Option<ChatVotes>` | `TwitchInfo` **nunca** incluye el token. |
| Configuración | `theme`, `sounds_version` | Sobreviven a Reset y a partidas nuevas (`restart()`). |
| Solo Rust | `questions`, `chat_voters`, `question_time`, `tick_accum_ms` | `#[serde(skip)] #[ts(skip)]`: no viajan a los clientes. |

**Decisiones de diseño:**

- **Lo que no se envía también es diseño.** El mazo completo (`questions`) y las preguntas del rosco no se serializan: el Stage (y cualquiera con acceso a OBS) no recibe las respuestas futuras. La pregunta en juego viaja en `current_question`.
- **`GameState` solo se serializa** (Rust → clientes); nunca se reconstruye desde JSON.
- **Partida frente a configuración.** `restart()` reconstruye la partida conservando tema, conexión a Twitch, tiempo por pregunta y versión de sonidos.
- **Campos derivados** (`can_retire`) se recalculan en `refresh_flags()` justo antes de cada broadcast.

### `Preset` (`presets.rs`)

```rust
pub struct Preset {
    pub id: String,                    // nombre de archivo: [a-zA-Z0-9_-]
    pub name: String,
    pub mode: GameMode,
    pub questions: Vec<Question>,      // copia: el preset no depende del set original
    pub theme: String,
    pub time_limit: u32,               // Millonario: por pregunta (5–300) · Rosco: total (30–900)
    pub min_correct: Option<usize>,    // solo Rosco
    pub twitch_channel: Option<String>,// conexión anónima al iniciar; nunca token
}
```

`GameState::start_preset` es el **punto de entrada único** para iniciar una partida configurada: valida el preset entero *antes* de tocar el estado (un preset inválido deja la partida actual intacta) y aplica modo, preguntas, tiempo y tema en una operación. `InitGame` e `InitRosco` siguen existiendo como atajos.

---

## 6. Tipos compartidos Rust → TypeScript

Los tipos de `packages/shared-types/src/*.ts` **se generan** con [ts-rs](https://github.com/Aleph-Alpha/ts-rs) a partir de los `struct`/`enum` de Rust marcados con:

```rust
#[derive(Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
```

### Regenerarlos

ts-rs genera cada archivo al ejecutar los tests (cada tipo exportado crea un test `export_bindings_*`):

```bash
cd src-tauri && cargo test --lib
```

o, desde la raíz, solo los tests de exportación:

```bash
pnpm gen:types
```

Después:

1. Si has añadido un **tipo nuevo**, añádelo a `packages/shared-types/src/index.ts` (este archivo se mantiene a mano).
2. Ejecuta `pnpm typecheck`: TypeScript te señalará cada sitio del frontend que haya que adaptar.
3. **No edites a mano** los `.ts` generados: se sobrescriben.

Consejos con ts-rs:

- Los campos `Option<T>` salen como `T | null`. Usa `#[ts(optional)]` solo junto con `#[serde(default)]` si el JSON puede omitir el campo.
- Evita `HashMap<Enum, T>` en tipos exportados: genera un índice que TypeScript rechaza. Usa un `struct` con un campo por variante (ver `ComodinesState`).

---

## 7. Flujo de desarrollo

Requisitos: Rust estable, Node 20+, pnpm, y WebView2 (incluido en Windows 10/11).

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
cd src-tauri && cargo run
```

`pnpm dev` arranca los tres Vite: **Control** en `:4321`, **Stage** en `:4323` y **Editor** en `:4324`. `cargo run` abre la app, que carga el Control y el Editor desde Vite y levanta Axum en `:4322`. En desarrollo, `/stage/` redirige a Vite para ver siempre el código actual.

Comprobaciones antes de un *pull request*:

```bash
cd src-tauri && cargo test && cargo check
```

```bash
pnpm typecheck
```

---

## 8. Guías de extensión

### 8.1 Añadir un comodín

Ejemplo: un comodín `Publico` de 20 s.

1. **Rust · `comodines/mod.rs`**
   - Añade la variante a `enum Comodin` y a `Comodin::ALL`.
   - Dale duración en `Comodin::duration()` (`None` si no tiene cuenta atrás).
   - Añade el campo en `ComodinesState` (con `#[serde(rename = "Publico")]` y `#[ts(rename = "Publico")]`), en su `Default`, y en `get`, `set` e `Index`. El compilador te avisará de cada `match` incompleto.
   - Si tiene lógica propia (como el Chat con los votos), engánchala en `use_comodin` / `resolve_comodin`.
2. **Tests:** añade casos en el `mod tests` de `comodines/mod.rs` (usar, cancelar, gastar, tiempo agotado).
3. **Tipos:** `cd src-tauri && cargo test --lib` regenera `Comodin.ts` y `ComodinesState.ts`.
4. **Frontend · `packages/ui/src/comodines.ts`**: añádelo a `COMODINES` y a `COMODIN_INFO` (icono, etiqueta, título y subtítulo del overlay). El panel de control y la barra del Stage lo mostrarán automáticamente.
5. **Overlay especial** (opcional): si necesita algo más que título y cuenta atrás, añade su bloque en `apps/stage/src/Comodines.tsx` (como `Ruleta` o `ChatVoteBars`) y sus estilos en `apps/stage/src/styles.css` usando variables `--stage-*`.
6. `pnpm typecheck` y prueba el flujo en el Control.

### 8.2 Añadir un tema

1. Crea `packages/themes/src/<id>.json`. El `id` debe cumplir `[a-z0-9_-]{1,32}` (lo valida el backend):

```json
{
  "id": "retro",
  "name": "Retro",
  "fontUrl": "https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap",
  "vars": {
    "--stage-bg": "#1b1b3a",
    "--stage-font": "'Press Start 2P', monospace",
    "--stage-text": "#ffffff",
    "--stage-box": "rgba(0, 0, 0, 0.8)",
    "--stage-border": "#ff6ec7",
    "--stage-radius": "0px",
    "--stage-accent": "#fffb00",
    "--stage-selected": "#ff9f1c",
    "--stage-correct": "#2ec4b6",
    "--stage-wrong": "#e71d36",
    "--stage-pending": "#3a3a6a",
    "--stage-passed": "#ffbf00",
    "--stage-timer-track": "rgba(255, 255, 255, 0.15)",
    "--stage-timer": "#ff6ec7",
    "--stage-timer-danger": "#e71d36",
    "--stage-glow": "0 0 12px #ff6ec7"
  }
}
```

2. Regístralo en `THEMES` en `packages/themes/src/index.ts`.
3. Copia las variables de `default.json` como punto de partida: si falta alguna, se usa el valor por defecto de `apps/stage/src/styles.css`.
4. Aparecerá en el selector de tema del Control y del Editor de presets. `applyTheme()` inyecta las variables en `:root` y carga la fuente.

### 8.3 Añadir un comando

**Por WebSocket** (afecta al estado de partida):

1. Variante nueva en `ClientCommand` (`server/mod.rs`).
2. Regla en un método de `GameState` (con tests) que devuelva `Result<_, String>`.
3. Rama en `AppState::apply` (decide también si emite sonido).
4. Regenera tipos y úsalo desde el frontend con `sendCommand`.

**Por IPC de Tauri** (ficheros, ventanas, operaciones locales):

1. Función `#[tauri::command]` y registro en `generate_handler!` (`lib.rs`).
2. Nombre en `build.rs` (`AppManifest::commands`), que genera el permiso `allow-<nombre>`.
3. Permiso en `capabilities/default.json`. **Sin este paso, la llamada falla con *"not allowed"***, porque el Control y el Editor cargan como orígenes remotos en desarrollo.
4. Envoltorio tipado en `packages/ui/src/api/` con `ensureTauri()`.

---

## 9. Producción y empaquetado

```bash
pnpm tauri:build
```

1. `beforeBuildCommand` ejecuta `pnpm build`: limpia `dist/` y compila las tres apps en `dist/app` (Control en la raíz, `editor/` y `stage/` dentro, con `base: "./"`).
2. Tauri embebe `dist/app` en el ejecutable y empaqueta `data/` como recursos.
3. Salida en `src-tauri/target/release/`: el `.exe` y los instaladores en `bundle/msi/` y `bundle/nsis/`.

En **release**:

- Los datos viven en `%APPDATA%\com.concursillo.studio\`. En el primer arranque se copian los ejemplos desde los recursos, **sin sobrescribir nunca**.
- `/stage/` se sirve desde los assets embebidos en el `.exe` (`AssetResolver` de Tauri): no hay ficheros sueltos que instalar.
- El Editor se abre desde `editor/index.html` embebido y se puede cerrar y reabrir desde el Control. Cerrar el Control cierra la app.

---

## 10. Decisiones de seguridad

- **Servidor solo en loopback** (`127.0.0.1:4322`): no es accesible desde la red local.
- **El token de Twitch** vive únicamente en la tarea de conexión: no entra en `GameState`, ni en presets, ni en el log del Control. La conexión anónima basta para leer votos.
- **Capabilities de Tauri:** cada comando propio necesita un permiso explícito, concedido solo a las ventanas `main` y `editor` y a sus orígenes.
- **Rutas de archivo** saneadas en un único sitio (`files::json_path`): solo `[a-zA-Z0-9_-]`, sin *path traversal*. Los nombres de sonido se validan contra el enum `Sound`.
- **Subida de sonidos:** bytes crudos por IPC (`InvokeBody::Raw`), máximo 10 MB, validación por **firma binaria** (no por extensión) y escritura atómica (temporal y luego renombrar).
- **Comandos de depuración** (`SimulateChatMessage`) compilados solo con `debug_assertions`: no existen en release.
