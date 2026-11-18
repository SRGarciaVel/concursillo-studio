# Contexto para Claude Code

## Arquitectura
- **Backend**: Rust (Axum) en `src-tauri`. Controla el estado del juego, WebSockets y Twitch IRC.
- **Frontend**: React + Vite en `apps/`. Tres vistas: `control`, `stage` (OBS), `editor`.
- **Tipos**: Se generan automáticamente desde Rust a TS usando `ts-rs`.

## Reglas
1. El estado del juego vive SIEMPRE en Rust. El frontend es presentacional.
2. NUNCA introducir Electron. Usar Tauri v2.
3. OBS consume `/stage` vía Browser Source.
4. Los temas usan CSS Variables inyectadas desde JSON.
