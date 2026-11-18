# Concursillo Studio 🎙️🎮

Aplicación de escritorio (Tauri + Rust + React) para crear, gestionar y emitir concursos tipo **"El Concursillo"** / **"¿Quién quiere ser millonario?"** y **el Rosco de Pasapalabra**, con integración nativa con **OBS** y **Twitch**.

## Empieza en 30 segundos

1. **Instala** `Concursillo Studio_<versión>_x64-setup.exe`. Si Windows SmartScreen avisa: *Más información* → *Ejecutar de todas formas* (el instalador aún no está firmado).
2. **Abre la app**: se abren el **Control** (tu panel) y el **Editor**. Ya trae un preset de ejemplo.
3. **En OBS**, añade una fuente **Navegador** con la URL `http://127.0.0.1:4322/stage/` a **1920×1080**.
4. **En el Control**, elige el preset *Demo Millonario*, pulsa **▶ Iniciar** y luego **Cargar siguiente pregunta**. Ya estás en directo.

Para preparar tus propias preguntas, conectar el chat de Twitch o cambiar los sonidos, sigue la **[Guía de usuario](docs/GUIA_USUARIO.md)**.

## Documentación

| Documento | Para quién | Contenido |
|---|---|---|
| 📘 **[Guía de usuario](docs/GUIA_USUARIO.md)** | Streamers | Instalación, preguntas (formulario e importación masiva), presets, OBS paso a paso, Twitch, sonidos y problemas frecuentes. |
| 🏗️ **[Arquitectura](docs/ARQUITECTURA.md)** | Colaboradores | Modelo cliente-servidor por WebSocket, estructuras de datos, generación de tipos TS y cómo añadir comodines, temas o comandos. |
| 🗺️ **[Roadmap](docs/ROADMAP.md)** | Todos | Próximas ideas: firma digital, auto-updater, editor visual del rosco, multi-idioma, packs de preguntas, Twitch EventSub… |

## Características

- **Dos modos de juego:** Millonario (15 preguntas, niveles asegurados en 5 y 10, plantarse) y Rosco (27 letras A–Z + Ñ, pasapalabra, reloj global).
- **Comodines:** 💬 Chat, 📞 Llamada, 🎯 Sacrificio y 🎲 Ruleta, con overlays animados, más los hitos de las preguntas 8 (recuperar comodín) y 11 (cambiar pregunta).
- **Twitch:** el comodín del chat cuenta los votos (A/B/C/D) en directo, con un voto por espectador y barras en pantalla.
- **Listo para OBS:** el Stage se sirve desde la app; temas con fondo transparente o propio y sonidos que salen por el mezclador de OBS.
- **Editor:** formulario, **importación masiva** desde TXT/CSV (pegar desde Excel), presets de un clic y **sonidos personalizados** que se aplican al momento.
- **Temas:** Default, Clásico y Neón mediante variables CSS definidas en JSON.

## Desarrollo

Requisitos: Rust estable, Node 20+ y pnpm.

```bash
pnpm install
```

```bash
pnpm dev
```

```bash
cd src-tauri && cargo run
```

Comprobaciones antes de cada cambio:

```bash
cd src-tauri && cargo test
```

```bash
pnpm typecheck
```

Instaladores de producción (`src-tauri/target/release/bundle/`):

```bash
pnpm tauri:build
```

Los detalles están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md#7-flujo-de-desarrollo).

## Licencia

[MIT](LICENSE)
