# Roadmap · Concursillo Studio

Ideas para próximas versiones. No son promesas de fecha: el orden refleja el impacto para el streamer frente al esfuerzo estimado.

**Leyenda de esfuerzo:** 🟢 pequeño (días) · 🟡 medio (1–2 semanas) · 🔴 grande (varias semanas)

---

## Prioridad alta

### Firma digital del ejecutable 🟢

**Problema:** el instalador no está firmado y Windows SmartScreen muestra *"Windows protegió su PC"*, lo que asusta a usuarios nuevos.

**Propuesta:**
- Conseguir un certificado de firma de código (OV o EV; con EV la reputación en SmartScreen es inmediata) o usar un servicio de firma en la nube (por ejemplo, Azure Trusted Signing).
- Configurarlo en `tauri.conf.json → bundle.windows` (`certificateThumbprint`, `digestAlgorithm`, `timestampUrl`) o mediante un `signCommand` en CI.
- Firmar en la pipeline de release, nunca en el equipo de un desarrollador.

### Auto-updater 🟡

**Propuesta:**
- Usar `tauri-plugin-updater` con un `latest.json` publicado en GitHub Releases.
- Las actualizaciones van firmadas con la clave del updater (independiente de la firma de código).
- Comprobar al arrancar y avisar en el Control; **nunca** instalar en mitad de una emisión: solo cuando el streamer lo confirme.
- Los datos del usuario (`%APPDATA%\com.concursillo.studio`) ya sobreviven a las actualizaciones: la siembra de ejemplos nunca sobrescribe.

### Marcar la respuesta concreta desde el Control 🟢

Hoy el Control tiene *Simular correcta / incorrecta*. Añadir botones **A, B, C, D** que envíen la respuesta elegida por el concursante (el motor ya lo admite con `submit_answer`), con una fase de *respuesta seleccionada* antes de revelar, para generar más tensión.

---

## Contenido y experiencia de uso

### Plantillas de preguntas pre-hechas 🟡

- Packs listos para usar: **cultura general**, **videojuegos**, **cine y series**, **música**, **deportes**, **anime**, **ciencia**, **historia**…
- Para cada pack: un set de Millonario (15 + reserva) y un rosco completo de 27 letras.
- Se distribuyen como recursos de la app y se ofrecen en el Editor (*"Crear desde plantilla"*), sin tocar los sets del usuario.
- Formato abierto para que la comunidad pueda contribuir packs por *pull request* (validados por los mismos tests que los sets).

### Editor visual del círculo del Rosco 🟡

- Vista del rosco en el Editor con las 27 letras en círculo, igual que en el Stage.
- Clic en una letra para editar su pregunta; **arrastrar y soltar** para intercambiar preguntas entre letras (comprobando que la respuesta sigue empezando por / conteniendo la letra).
- Indicadores de estado: letras vacías, letras con "contiene", preguntas sin revisar.

### Soporte multi-idioma (i18n) 🟡

- Extraer los textos de las tres vistas a ficheros de traducción (por ejemplo, `i18next` o un sistema propio ligero).
- Idiomas iniciales: español (actual) e inglés; abierto a la comunidad.
- El Stage debe poder ir en un idioma distinto al del Control (el streamer en español y el overlay en inglés, o al revés).
- El **alfabeto del Rosco** pasa a depender del idioma (la Ñ solo en español; abecedarios de otros idiomas). Hoy está fijado en `ROSCO_ALPHABET` (Rust) y su espejo en `packages/ui/src/rosco.ts`.
- Mensajes de error del backend con códigos traducibles en lugar de texto en español.

---

## Twitch y comunidad

### Integración con Twitch EventSub 🔴

Ir más allá del chat IRC:

- **Puntos del canal (channel points):** canjes que activan acciones en el juego (por ejemplo, "Comprar un comodín para el streamer" o "Elegir la categoría de la siguiente pregunta").
- **Suscripciones, bits y raids:** efectos especiales en el Stage o tiempo extra.
- **Encuestas y predicciones nativas de Twitch** como alternativa al comodín del chat por mensajes.

**Requisitos técnicos:**
- Flujo OAuth propio de la app (registrar una aplicación en Twitch, *device code flow* o *authorization code* con PKCE) y almacenamiento seguro del token en el **almacén de credenciales de Windows**, nunca en un JSON.
- Conexión EventSub por WebSocket gestionada igual que la del IRC: una tarea tokio dueña de la conexión, con reconexión automática.
- Una pantalla de "reglas" en el Control para mapear eventos → acciones y poder desactivarlas en directo.

---

## Espectáculo

### Modo ruleta avanzado 🟡

Hoy el comodín de la ruleta es una animación de rueda girando que cierra el presentador. Propuesta:

- La ruleta **decide algo de verdad**: el backend sortea un resultado (por ejemplo, 50:50, tiempo extra, pregunta de reserva o "sin efecto") y el Stage anima la rueda **hasta caer en ese sector**.
- Física de giro con aceleración y frenado, sonido de "tic" por sector y destello del premio.
- Sectores configurables desde el preset.
- Efectos visuales: partículas o confeti (canvas o WebGL ligero), respetando `prefers-reduced-motion`.

### Otras ideas sueltas

- **Escalera de premios** visible en el Stage (como el clásico panel lateral), configurable por preset.
- **Modo multijugador** del Rosco (dos concursantes con relojes alternos, como en el programa).
- **Historial de partidas** y estadísticas (preguntas más falladas, tiempo medio de respuesta).
- **Exportar sets** a TXT/CSV (el inverso del importador masivo).
- **Atajos de teclado y Stream Deck** para el Control (acertar, fallar, pausar sin usar el ratón).
- **Más temas** y un editor de temas con vista previa en vivo.

---

## Deuda técnica conocida

- `packages/shared-types/src/index.ts` se mantiene a mano: automatizar su generación tras `cargo test`.
- `/stage/` en release devuelve `index.html` (200) para assets inexistentes (comportamiento del resolver de Tauri). Inofensivo para OBS, pero conviene devolver 404 cuando la ruta pedida tiene extensión.
- La ventana del Editor en desarrollo apunta a Vite (`localhost:4324`); unificar con un `beforeDevCommand` que arranque todos los servidores.
- Tests end-to-end automatizados (hoy se validan a mano por CDP contra WebView2).
