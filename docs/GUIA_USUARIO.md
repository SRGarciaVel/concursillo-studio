# Guía de usuario · Concursillo Studio

Esta guía es para el streamer: instalar la app, preparar las preguntas, montar la escena en OBS y jugar en directo.

**Índice**

1. [Instalación](#1-instalación)
2. [Las tres ventanas](#2-las-tres-ventanas)
3. [Crear preguntas](#3-crear-preguntas)
4. [Crear un preset y lanzarlo](#4-crear-un-preset-y-lanzarlo)
5. [Configurar OBS](#5-configurar-obs)
6. [Conectar Twitch (comodín del chat)](#6-conectar-twitch-comodín-del-chat)
7. [Sonidos personalizados](#7-sonidos-personalizados)
8. [Durante la partida](#8-durante-la-partida)
9. [Dónde se guardan tus datos](#9-dónde-se-guardan-tus-datos)
10. [Problemas frecuentes](#10-problemas-frecuentes)

---

## 1. Instalación

Hay dos instaladores; usa **uno** de los dos:

| Archivo | Cuándo usarlo |
|---|---|
| `Concursillo Studio_x.y.z_x64-setup.exe` | Recomendado. Instalador normal para tu usuario. |
| `Concursillo Studio_x.y.z_x64_en-US.msi` | Si prefieres los paquetes MSI (por ejemplo, para instalar en varios equipos). |

### Aviso de Windows SmartScreen

El instalador todavía **no está firmado digitalmente**, así que Windows puede mostrar *"Windows protegió su PC"*. Es normal en apps sin certificado de firma:

1. Pulsa **Más información**.
2. Comprueba que el nombre del archivo es el que descargaste.
3. Pulsa **Ejecutar de todas formas**.

> Descarga el instalador solo desde el repositorio oficial del proyecto. La firma digital está en el [roadmap](ROADMAP.md).

La app necesita **WebView2**, que ya viene con Windows 10 y 11. Si faltara, el instalador lo descarga.

La primera vez que se abre, la app copia unos **datos de ejemplo** (sets de preguntas, un preset de demo y los sonidos) a tu carpeta de usuario. Nunca sobrescribe lo que ya tengas.

---

## 2. Las tres ventanas

| Ventana | Para qué sirve | Dónde está |
|---|---|---|
| **Control** | Tu panel de presentador: iniciar partidas, marcar respuestas, comodines, Twitch. | Ventana principal de la app. |
| **Editor** | Crear preguntas, presets y cambiar sonidos. | Segunda ventana. Si la cierras, vuelve a abrirla con **✏️ Editor** en el Control. |
| **Stage** | Lo que ve tu audiencia (preguntas, reloj, rosco, comodines). | No es una ventana: la muestra **OBS** desde `http://127.0.0.1:4322/stage/`. |

> Cerrar el **Control** cierra la app entera. Cerrar el **Editor** no afecta a nada.

---

## 3. Crear preguntas

Las preguntas se agrupan en **sets** (un archivo `.json` por set). Un set es de un solo modo: **Millonario** o **Rosco**.

### 3.1 Con el formulario

En el **Editor → pestaña Preguntas**:

1. Elige el **Modo** (se bloquea en cuanto añades la primera pregunta; vacía el set para cambiarlo).
2. Rellena categoría, dificultad, la pregunta y las respuestas.
   - **Millonario:** 4 respuestas; marca la correcta con el círculo.
   - **Rosco:** elige la **letra** (las ya usadas aparecen bloqueadas), si la respuesta **empieza por** o **contiene** la letra, y una respuesta libre (o 4 alternativas si marcas *Con 4 alternativas*).
3. Pulsa **Añadir al Set**. Se mantienen la categoría y la dificultad para ir rápido.
4. Escribe un **Nombre del archivo** (solo letras, números, `_` y `-`) y pulsa **Guardar Set en JSON**.

Reglas que conviene saber:

- **Millonario:** se juegan como máximo **15 preguntas**. Si el set tiene más, las sobrantes quedan **de reserva** para el hito *Cambiar pregunta* (ver [§8](#8-durante-la-partida)). Recomendación: 15 + 2 de reserva.
- **Rosco:** hacen falta exactamente **27 letras** (A–Z más la Ñ), sin repetir. Los círculos de arriba te muestran cuáles faltan, y no podrás guardar hasta completarlas.

### 3.2 Importación masiva (copiar y pegar)

En la misma pestaña, abre **Importar masivo**. Pega una pregunta por línea y pulsa **Procesar e Importar**.

- Pulsa **Insertar plantilla** para ver el formato con ejemplos, o **Descargar plantilla .txt** para editarla en tu editor favorito.
- Separador: `|` (recomendado), **tabulador** (sirve para pegar directamente desde Excel o Google Sheets) o `;`.
- Las líneas que empiezan por `#` son comentarios y se ignoran.

**Formato Millonario**

```text
Pregunta | Respuesta correcta | Opción 2 | Opción 3 | Opción 4 | Categoría | Dificultad
¿Cuál es la capital de Francia? | París | Londres | Roma | Berlín | Geografía | Fácil
```

- La correcta va **siempre en la 2.ª columna**: al importar se coloca en una posición **al azar** (si no, siempre sería la A).
- Puedes poner de 1 a 3 opciones incorrectas. Categoría y dificultad son opcionales.
- Dificultad: `Fácil`, `Media` o `Difícil` (también `Easy`/`Medium`/`Hard`).

**Formato Rosco**

```text
Letra | Definición | Respuesta | Categoría | Dificultad | empieza/contiene
A | Capital de Grecia | Atenas | Geografía | Fácil
Ñ | Elevación natural del terreno | Montaña | Geografía | Fácil | contiene
```

- La última columna es opcional (por defecto, *empieza*).
- Se comprueba que la respuesta empiece por la letra o la contenga (sin tener en cuenta tildes).

**Si hay errores**, no se importa nada y verás la lista de líneas a corregir, por ejemplo:

```text
Línea 2: faltan columnas: «Pregunta | Correcta | Opción 2 …»
Línea 7: dificultad «imposible» no reconocida (usa Fácil, Media o Difícil)
```

Tras importar, revisa la lista y **guarda el set**.

---

## 4. Crear un preset y lanzarlo

Un **preset** es la configuración completa de una partida en un clic: set de preguntas + tema + tiempo (+ canal de Twitch).

### Crear el preset

En el **Editor → pestaña Presets**:

1. Ponle un **Nombre** (el nombre de archivo se genera solo).
2. Elige el **Set de preguntas**. El modo se detecta automáticamente.
3. Elige el **Tema** (Default, Clásico, Neón).
4. Ajusta el **tiempo**:
   - Millonario: **segundos por pregunta** (5–300).
   - Rosco: **tiempo total** del rosco (30–900) y **aciertos para ganar** (por defecto, las 27).
5. (Opcional) **Canal de Twitch**: se conectará solo al iniciar el preset.
6. Pulsa **Guardar Preset**.

> El preset guarda una **copia** de las preguntas: si luego cambias el set, vuelve a guardar el preset para actualizarlo (botón **Editar** en la lista).

### Lanzarlo

En el **Control → Preset**: elige el preset, comprueba el resumen (modo, nº de preguntas, tema, tiempo) y pulsa **▶ Iniciar**. La partida queda preparada en espera; el reloj no corre hasta que cargues la primera pregunta (o pulses *Empezar rosco*).

---

## 5. Configurar OBS

La app tiene que estar **abierta** mientras emites: el Stage se sirve desde ella.

1. En tu escena, en **Fuentes**, pulsa **+** → **Navegador** (*Browser*).
2. Ponle un nombre, por ejemplo *Concursillo Stage*, y pulsa **Aceptar**.
3. Configura las propiedades:

| Propiedad | Valor |
|---|---|
| **URL** | `http://127.0.0.1:4322/stage/` |
| **Ancho** | `1920` |
| **Alto** | `1080` |
| **Controlar audio a través de OBS** | ✅ Recomendado: los efectos salen por el mezclador de OBS y puedes ajustar su volumen. |
| **Apagar la fuente cuando no sea visible** (*Shutdown source when not visible*) | ✅ |
| **Actualizar navegador cuando la escena se active** (*Refresh browser when scene becomes active*) | ✅ |
| **CSS personalizado** | Déjalo como viene (fondo transparente). |

4. Pulsa **Aceptar** y ajusta la fuente para que ocupe toda la pantalla (clic derecho → *Transformar* → *Ajustar a la pantalla*).

Notas:

- Con las dos casillas marcadas, el Stage se reconecta al mostrar la escena y **recibe el estado actual al instante**: puedes cambiar de escena en mitad de una partida sin perder nada.
- El tema **Default** tiene fondo **transparente** (se ve tu escena detrás). **Clásico** y **Neón** pintan su propio fondo.
- No necesitas recargar OBS al cambiar sonidos o temas: el Stage se actualiza solo.
- Puedes comprobar la URL en cualquier navegador del mismo PC antes de configurarla en OBS.

---

## 6. Conectar Twitch (comodín del chat)

Con Twitch conectado, cuando uses el **💬 Comodín del chat** el Stage muestra **4 barras con los votos en directo** y destaca la opción más votada.

### Conectar

En el **Control → Conexión a Twitch**:

| Modo | Qué rellenar | Cuándo usarlo |
|---|---|---|
| **Anónimo** (recomendado) | Solo el **Canal**. | Siempre que solo quieras **contar votos**. Es de solo lectura y no necesita ninguna credencial. |
| **Autenticado** | Canal + **Usuario** + **Token OAuth** de esa misma cuenta. | Solo si en el futuro se añaden funciones que escriban en el chat. Hoy no aporta nada al comodín. |

- Pulsa **Conectar**. El estado pasa a *Conectando…* y luego a **Conectado · #tu_canal**.
- Si el canal no existe, a los ~12 s verás un error. Pulsa **Desconectar** y revisa el nombre.
- Si usas token: debe ser de la **misma cuenta** que el usuario, con permiso de lectura de chat (`chat:read`). Puede empezar o no por `oauth:`.
- **El token no se guarda** en ningún archivo, no se envía al Stage de OBS y no aparece en el registro del Control. Al reiniciar la app tendrás que volver a introducirlo (o usar el modo anónimo).
- Un preset con canal de Twitch se conecta **en modo anónimo** automáticamente al iniciarlo.

### Cómo votan tus espectadores

Mientras el comodín del chat está activo, cuentan como voto mensajes como:

`A` · `b` · `C!` · `opción C` · `la b` · `voto a` · `respuesta D`

- **Un voto por persona**: si alguien vota dos veces cuenta una; si cambia de opinión, su voto se mueve.
- No cuentan las frases normales ("a ver…"), ni los emotes `D:` y `B)` (que parecen letras pero no lo son).
- Los votos se cierran cuando se acaba el tiempo del comodín; el recuento se queda en pantalla hasta que cierres el comodín.

---

## 7. Sonidos personalizados

En el **Editor → pestaña Sonidos** verás los cinco efectos del sistema:

| Sonido | Cuándo suena |
|---|---|
| **Tensión** (`play_tension`) | Al cargar una pregunta (en bucle). |
| **Correcto** (`play_correct`) | Respuesta correcta. |
| **Incorrecto** (`play_wrong`) | Fallo o tiempo agotado. |
| **Victoria** (`play_win`) | Partida ganada. |
| **Pasapalabra** (`play_pass`) | Rosco: el concursante pasa. |

- Pulsa **Subir .mp3 / .wav** y elige tu archivo (máximo **10 MB**). Puedes escucharlo con el reproductor de la fila.
- El cambio es **inmediato**: el Stage de OBS recarga el sonido solo, sin recargar la escena.
- Si el archivo no es un MP3/WAV de verdad (por ejemplo, otro formato renombrado), se rechaza.
- **Restaurar original** vuelve al sonido que trae la app.
- Consejo: la *Tensión* suena en bucle, así que elige un audio que empalme bien consigo mismo.

---

## 8. Durante la partida

### Millonario

1. **Cargar siguiente pregunta**: aparece en el Stage y arranca el reloj (suena la tensión).
2. Marca la respuesta (en esta versión, los botones **Simular correcta / incorrecta** del Control).
3. Si acierta, **Next Round** y vuelta al paso 1. Si falla o se acaba el tiempo, la partida termina.

- **⏸ Pausar reloj / ▶ Reanudar**: congela el tiempo (por ejemplo, mientras el concursante piensa en voz alta).
- **Niveles asegurados**: al llegar a **5** y **10** aciertos. Si falla, se lleva el último nivel asegurado.
- **🏳️ Me cago (Plantarse)**: pide confirmación y el concursante **se lleva todos sus aciertos**. Fallar, en cambio, le baja al nivel asegurado.

**Comodines** (cada uno se usa una vez):

| Comodín | Tiempo | Qué muestra el Stage |
|---|---|---|
| 💬 **Chat** | 30 s | Cuenta atrás y, con Twitch conectado, barras de votos en directo. |
| 📞 **Llamada** | 45 s | Cuenta atrás para la llamada. |
| 🎯 **Sacrificio** | 30 s | "Un espectador responde". |
| 🎲 **Ruleta** | — | Animación de ruleta; la cierras tú. |

- Mientras hay un comodín activo, el reloj de la pregunta se **congela**.
- Cierra el comodín con **Cerrar y usar** (queda gastado) o **Cancelar** (vuelve a estar disponible).
- Si se agota su tiempo, el overlay parpadea *¡TIEMPO!* hasta que lo cierres.

**Hitos** (una vez por partida):

- **Pregunta 8 · Recuperar comodín**: al acertar la 8.ª, puedes devolver un comodín gastado.
- **Pregunta 11 · Cambiar pregunta**: al acertar la 11.ª, puedes cambiar la pregunta en juego por una **de reserva** del set (si el set no tiene reserva, no se puede usar).

### Rosco

1. Tras iniciar el preset, pulsa **▶ Empezar rosco**: arranca el reloj total.
2. Para cada letra: **✅ Acertó**, **❌ Falló** o **⏭️ Pasapalabra**. Ves la respuesta correcta en tu panel.
3. Las letras pasadas vuelven en la siguiente vuelta; las resueltas se saltan solas.
4. Gana si alcanza los **aciertos para ganar** del preset (al resolver todas las letras o al acabarse el tiempo).

### Temas y reinicio

- **Tema del stage**: cámbialo en cualquier momento desde el Control.
- **Reset Game**: vuelve a empezar la misma partida (mismo set, tema y tiempo).

---

## 9. Dónde se guardan tus datos

Todo está en `%APPDATA%\com.concursillo.studio\` (pega esa ruta en el Explorador de archivos):

| Carpeta | Contenido |
|---|---|
| `questions\` | Tus sets de preguntas (`.json`). |
| `presets\` | Tus presets (`.json`). |
| `sounds\` | Los sonidos en uso. |

Para hacer una **copia de seguridad**, copia esa carpeta entera. Para **moverlo a otro PC**, instala la app allí y pega la carpeta en la misma ruta.

---

## 10. Problemas frecuentes

**El Control dice "Desconectado".**
El servidor interno usa el puerto **4322**. Si otro programa lo ocupa, cierra ese programa y reinicia la app.

**OBS muestra una página en blanco o un error.**
Comprueba que la app está abierta y que la URL es exactamente `http://127.0.0.1:4322/stage/` (con la barra final).

**No se oyen los sonidos en OBS.**
Activa *Controlar audio a través de OBS* en la fuente y revisa que su canal no esté silenciado en el mezclador. En un navegador normal los sonidos pueden estar bloqueados hasta que hagas clic en la página: en OBS no pasa.

**El comodín del chat no muestra barras.**
Solo aparecen con Twitch **Conectado**. Revisa el estado en la sección *Conexión a Twitch*.

**Twitch se queda en error con "¿existe el canal?".**
Revisa que el nombre del canal está bien escrito (sin la URL, solo el nombre). Pulsa *Desconectar* y vuelve a conectar.

**No puedo guardar un rosco.**
Hacen falta exactamente 27 letras distintas (A–Z y Ñ). El aviso bajo los círculos te dice cuáles faltan o se repiten.

**No puedo usar "Cambiar pregunta".**
El set necesita preguntas de reserva: más de 15 preguntas en Millonario.
