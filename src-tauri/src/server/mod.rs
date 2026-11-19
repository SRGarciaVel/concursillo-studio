pub mod stage;
pub mod timer;

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderValue, Method},
    response::IntoResponse,
    routing::get,
    Router,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};
use tower_http::{cors::CorsLayer, services::ServeDir};
use ts_rs::TS;

use crate::{
    files::validate_questions,
    comodines::{Comodin, Hito},
    presets::Preset,
    twitch::{credentials, normalize_channel, TwitchInfo, TwitchManager, TwitchStatus},
    game::{rosco::RoscoOutcome, GamePhase, GameState},
    schemas::Question,
};

/// Puerto del servidor Axum. Vite usa 4321, así que no podemos compartirlo.
pub const SERVER_PORT: u16 = 4322;
/// Orígenes permitidos por CORS: las vistas en Vite (desarrollo) y las
/// ventanas de Tauri en producción. (El WebSocket y el audio no dependen de CORS.)
pub const ALLOWED_ORIGINS: [&str; 5] = [
    "http://localhost:4321",
    "http://localhost:4323",
    "http://localhost:4324",
    "http://tauri.localhost",
    "https://tauri.localhost",
];

/// Comandos que los clientes (panel de control) envían por WebSocket.
/// Formato: `{"action": "submit_answer", "payload": 2}`.
#[derive(Debug, Clone, Deserialize, TS)]
#[serde(tag = "action", content = "payload", rename_all = "snake_case")]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum ClientCommand {
    /// Nueva partida con un set completo (guardado en el `GameState`).
    InitGame(Vec<Question>),
    /// Carga desde el set la pregunta de la ronda actual (fase `Idle`).
    LoadNextQuestion,
    /// Carga una pregunta suelta (pruebas / uso manual).
    LoadQuestion(Question),
    SubmitAnswer(usize),
    /// Marca la respuesta del concursante sin revelarla (fase `Selecting`).
    SelectAnswer(usize),
    /// Revela la respuesta marcada: acierto o fallo, con su sonido.
    RevealAnswer,
    NextRound,
    /// Reinicia la partida conservando el set cargado.
    ResetGame,
    /// Congela el reloj de la pregunta actual.
    PauseTimer,
    /// Reanuda el reloj.
    ResumeTimer,
    /// Cambia el tema visual (id de `packages/themes`).
    ChangeTheme(String),
    /// Activa/desactiva el fondo transparente del stage (para OBS).
    SetTransparentBackground(bool),
    /// Nueva partida de Rosco (27 preguntas, una por letra A–Z + Ñ).
    /// `time_limit`: segundos totales (por defecto 150).
    /// `min_correct`: aciertos para ganar (por defecto, las 27).
    InitRosco {
        questions: Vec<Question>,
        #[serde(default)]
        #[ts(optional)]
        time_limit: Option<u32>,
        #[serde(default)]
        #[ts(optional)]
        min_correct: Option<usize>,
    },
    /// El presentador marca si el concursante acertó la letra actual.
    RoscoAnswer { is_correct: bool },
    /// Pasapalabra.
    RoscoPass,
    /// Activa un comodín (congela el reloj de la pregunta y arranca el suyo).
    UseComodin { comodin: Comodin },
    /// Cierra el comodín activo: `keep` lo gasta; si no, vuelve a estar disponible.
    ResolveComodin { keep: bool },
    /// Plantarse. La frase debe ser "me cago" (sin importar mayúsculas/espacios).
    Retire { phrase: String },
    /// Usa un hito: `recover` (pregunta 8; `comodin` opcional elige cuál)
    /// o `change_question` (pregunta 11).
    UseHito {
        hito: Hito,
        #[serde(default)]
        #[ts(optional)]
        comodin: Option<Comodin>,
    },
    /// Conecta al chat de un canal. Sin token: conexión anónima de solo
    /// lectura (basta para contar votos). Con token hace falta `username`.
    ConnectTwitch {
        channel: String,
        #[serde(default)]
        #[ts(optional)]
        token: Option<String>,
        #[serde(default)]
        #[ts(optional)]
        username: Option<String>,
    },
    DisconnectTwitch,
    /// Inicia una partida con un preset completo (modo, preguntas, tiempo,
    /// tema) y, si tiene canal, conecta a Twitch.
    StartPreset { preset: Preset },
    /// Soundboard del presentador: reenvía un sonido al stage. No cambia el
    /// estado de la partida (solo hace de puente Control → Stage).
    PlaySound { sound: Sound },
    /// Solo en builds de desarrollo: inyecta un mensaje como si llegara del
    /// chat, para ensayar el comodín sin Twitch. En release no existe.
    #[cfg(debug_assertions)]
    SimulateChatMessage { user: String, text: String },
}

/// Efectos de sonido que el stage debe reproducir. El nombre es también el
/// nombre del archivo en `data/sounds/` (`play_tension.mp3`, ...).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum Sound {
    PlayTension,
    PlayCorrect,
    PlayWrong,
    PlayWin,
    /// Pasapalabra (opcional: si no hay archivo, el stage lo ignora).
    PlayPass,
    /// Soundboard: redoble de tambor.
    PlayDrumroll,
    /// Soundboard: aplausos.
    PlayApplause,
}

impl Sound {
    pub const ALL: [Sound; 7] = [
        Sound::PlayTension,
        Sound::PlayCorrect,
        Sound::PlayWrong,
        Sound::PlayWin,
        Sound::PlayPass,
        Sound::PlayDrumroll,
        Sound::PlayApplause,
    ];

    /// Nombre del archivo sin extensión (igual que en JSON): `play_tension`, ...
    pub fn file_stem(self) -> &'static str {
        match self {
            Sound::PlayTension => "play_tension",
            Sound::PlayCorrect => "play_correct",
            Sound::PlayWrong => "play_wrong",
            Sound::PlayWin => "play_win",
            Sound::PlayPass => "play_pass",
            Sound::PlayDrumroll => "play_drumroll",
            Sound::PlayApplause => "play_applause",
        }
    }

    pub fn from_stem(stem: &str) -> Option<Sound> {
        Sound::ALL.into_iter().find(|s| s.file_stem() == stem)
    }
}

/// Mensajes que el servidor envía a los clientes.
/// `{"type": "state", "payload": {...}}`, `{"type": "error", "payload": "..."}`
/// o `{"type": "audio", "payload": {"sound": "play_tension"}}`.
#[derive(Debug, Clone, Serialize, TS)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum ServerMessage {
    State(GameState),
    Error(String),
    Audio { sound: Sound },
}

impl ServerMessage {
    fn to_json(&self) -> String {
        serde_json::to_string(self).expect("ServerMessage siempre es serializable")
    }
}

/// Sonido que corresponde a una respuesta, según la fase resultante.
fn answer_sound(phase: GamePhase) -> Sound {
    match phase {
        GamePhase::Won => Sound::PlayWin,
        GamePhase::GameOver => Sound::PlayWrong,
        _ => Sound::PlayCorrect,
    }
}

fn rosco_sound(outcome: RoscoOutcome) -> Sound {
    match outcome {
        RoscoOutcome::Correct => Sound::PlayCorrect,
        RoscoOutcome::Wrong => Sound::PlayWrong,
        RoscoOutcome::Passed => Sound::PlayPass,
        RoscoOutcome::Finished { won: true } => Sound::PlayWin,
        RoscoOutcome::Finished { won: false } => Sound::PlayWrong,
    }
}

#[derive(Clone)]
pub struct AppState {
    pub game: Arc<RwLock<GameState>>,
    /// Mensajes serializados (`ServerMessage`) emitidos a todos los clientes.
    pub tx: broadcast::Sender<String>,
    /// Tarea de conexión al chat de Twitch (una como máximo).
    pub twitch: Arc<TwitchManager>,
}

impl AppState {
    pub fn new(game: GameState) -> Self {
        let (tx, _) = broadcast::channel(64);
        Self {
            game: Arc::new(RwLock::new(game)),
            tx,
            twitch: Arc::new(TwitchManager::default()),
        }
    }

    async fn state_message(&self) -> String {
        ServerMessage::State(self.game.read().await.clone()).to_json()
    }

    /// Emite el estado y, si hay, un sonido. Se llama con el lock de escritura
    /// tomado para que el orden de los mensajes sea el mismo que el de los cambios.
    /// Antes de emitir recalcula los campos derivados (`can_retire`).
    pub(crate) fn broadcast(&self, game: &mut GameState, sound: Option<Sound>) {
        game.refresh_flags();
        // Err solo significa que no hay clientes conectados.
        let _ = self.tx.send(ServerMessage::State(game.clone()).to_json());
        if let Some(sound) = sound {
            let _ = self.tx.send(ServerMessage::Audio { sound }.to_json());
        }
    }

    /// Marca la conexión como en curso y lanza la tarea de Twitch (no espera a la red).
    fn connect_twitch(&self, game: &mut GameState, channel: String, creds: twitch_irc::login::StaticLoginCredentials) {
        game.twitch = TwitchInfo {
            status: TwitchStatus::Connecting,
            channel: Some(channel.clone()),
            authenticated: creds.credentials.token.is_some(),
            error: None,
        };
        self.twitch.start(self.clone(), channel, creds);
    }

    /// Aplica un comando al estado y emite el resultado a todos los clientes.
    /// Si el comando se rechaza, no se emite nada y se devuelve el motivo
    /// (que el handler envía solo al cliente que lo mandó).
    pub async fn apply(&self, cmd: ClientCommand) -> Result<(), String> {
        let mut game = self.game.write().await;
        let mut sound = None;
        match cmd {
            ClientCommand::InitGame(questions) => {
                validate_questions(&questions)?;
                game.init_with_questions(questions);
            }
            ClientCommand::LoadNextQuestion => {
                game.load_next_question()?;
                sound = Some(Sound::PlayTension);
            }
            ClientCommand::LoadQuestion(q) => {
                if game.rosco.is_some() {
                    return Err("En modo Rosco no se cargan preguntas sueltas".into());
                }
                validate_questions(std::slice::from_ref(&q))?;
                game.load_question(q);
                sound = Some(Sound::PlayTension);
            }
            ClientCommand::SubmitAnswer(i) => {
                if let Some(c) = game.active_comodin {
                    return Err(format!("Cierra el comodín {c:?} antes de responder"));
                }
                let before = game.phase;
                game.submit_answer(i);
                if game.phase != before {
                    sound = Some(answer_sound(game.phase));
                }
            }
            ClientCommand::SelectAnswer(i) => game.select_answer(i)?,
            ClientCommand::RevealAnswer => {
                game.reveal_answer()?;
                sound = Some(answer_sound(game.phase));
            }
            ClientCommand::NextRound => {
                game.next_round();
            }
            ClientCommand::ResetGame => game.reset(),
            ClientCommand::PauseTimer => game.set_timer_paused(true),
            ClientCommand::ResumeTimer => game.set_timer_paused(false),
            ClientCommand::ChangeTheme(theme) => game.set_theme(&theme)?,
            ClientCommand::SetTransparentBackground(on) => game.transparent_background = on,
            ClientCommand::InitRosco { questions, time_limit, min_correct } => {
                game.init_rosco(questions, time_limit, min_correct)?;
            }
            ClientCommand::RoscoAnswer { is_correct } => {
                sound = Some(rosco_sound(game.rosco_answer(is_correct)?));
            }
            ClientCommand::RoscoPass => {
                sound = Some(rosco_sound(game.rosco_pass()?));
            }
            ClientCommand::UseComodin { comodin } => game.use_comodin(comodin)?,
            ClientCommand::ResolveComodin { keep } => {
                game.resolve_comodin(keep)?;
            }
            ClientCommand::Retire { phrase } => game.retire(&phrase)?,
            ClientCommand::ConnectTwitch { channel, token, username } => {
                let channel = normalize_channel(&channel)?;
                let creds = credentials(username.as_deref(), token.as_deref())?;
                self.connect_twitch(&mut game, channel, creds);
            }
            ClientCommand::PlaySound { sound: s } => {
                if s == Sound::PlayTension {
                    // La tensión suena en bucle ligada a la pregunta: no se lanza a mano.
                    return Err("La tensión no se puede lanzar desde el soundboard".into());
                }
                sound = Some(s);
            }
            ClientCommand::StartPreset { preset } => {
                let preset = game.start_preset(&preset)?;
                // Canal del preset: conexión anónima, salvo que ya estemos en ese canal.
                if let Some(channel) = preset.twitch_channel {
                    let already = game.twitch.channel.as_deref() == Some(channel.as_str())
                        && matches!(game.twitch.status, TwitchStatus::Connecting | TwitchStatus::Connected);
                    if !already {
                        self.connect_twitch(&mut game, channel, credentials(None, None)?);
                    }
                }
            }
            ClientCommand::DisconnectTwitch => {
                self.twitch.stop();
                game.twitch = TwitchInfo::default();
            }
            #[cfg(debug_assertions)]
            ClientCommand::SimulateChatMessage { user, text } => {
                if !game.chat_voting_open() {
                    return Err("La votación del chat no está abierta".into());
                }
                game.record_chat_vote(&format!("sim:{user}"), &text);
            }
            ClientCommand::UseHito { hito, comodin } => {
                game.use_hito(hito, comodin)?;
                if hito == Hito::ChangeQuestion {
                    sound = Some(Sound::PlayTension); // pregunta nueva
                }
            }
        }
        self.broadcast(&mut game, sound);
        Ok(())
    }
}

pub fn router(state: AppState, sounds_dir: PathBuf, stage_assets: Option<stage::AssetLookup>) -> Router {
    let origins: Vec<HeaderValue> = ALLOWED_ORIGINS.iter().map(|o| o.parse().unwrap()).collect();
    let cors = CorsLayer::new().allow_origin(origins).allow_methods([Method::GET, Method::POST]);

    Router::new()
        .route("/ws", get(ws_handler))
        // Efectos de sonido: http://127.0.0.1:4322/sounds/play_tension.mp3
        .nest_service("/sounds", ServeDir::new(sounds_dir))
        // Vista para OBS: http://127.0.0.1:4322/stage/
        .merge(stage::routes(stage_assets))
        .layer(cors)
        .with_state(state)
}

/// Levanta el servidor HTTP/WS y el reloj de juego.
pub async fn serve(state: AppState, sounds_dir: PathBuf, stage_assets: Option<stage::AssetLookup>) -> std::io::Result<()> {
    let addr = SocketAddr::from(([127, 0, 0, 1], SERVER_PORT));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    crate::logger::info("server", format!("escuchando en ws://{addr}/ws · stage: http://{addr}/stage/"));
    tokio::spawn(timer::run(state.clone()));
    axum::serve(listener, router(state, sounds_dir, stage_assets)).await
}

async fn ws_handler(ws: WebSocketUpgrade, State(state): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    // Suscribirse ANTES de leer el estado inicial para no perder cambios intermedios.
    let mut rx = state.tx.subscribe();
    crate::logger::info("ws", format!("cliente conectado ({} en total)", state.tx.receiver_count()));
    let (mut sender, mut receiver) = socket.split();

    if sender
        .send(Message::Text(state.state_message().await))
        .await
        .is_err()
    {
        return;
    }

    // Respuestas dirigidas solo a este cliente (p. ej. errores de parseo).
    let (direct_tx, mut direct_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Tarea de envío: broadcast global + mensajes directos.
    let send_state = state.clone();
    let mut send_task = tokio::spawn(async move {
        loop {
            let text = tokio::select! {
                res = rx.recv() => match res {
                    Ok(text) => text,
                    // Cliente lento: se saltó mensajes, mandamos el estado actual.
                    Err(broadcast::error::RecvError::Lagged(_)) => send_state.state_message().await,
                    Err(broadcast::error::RecvError::Closed) => break,
                },
                Some(text) = direct_rx.recv() => text,
            };
            if sender.send(Message::Text(text)).await.is_err() {
                break;
            }
        }
    });

    // Tarea de recepción: comandos del cliente.
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = receiver.next().await {
            match msg {
                Message::Text(text) => {
                    let result = match serde_json::from_str::<ClientCommand>(&text) {
                        Ok(cmd) => {
                            let result = state.apply(cmd).await;
                            if let Err(e) = &result {
                                // Solo el nombre de la acción: nunca el payload (tokens, preguntas).
                                crate::logger::warn("ws", format!("comando «{}» rechazado: {e}", action_name(&text)));
                            }
                            result
                        }
                        Err(e) => {
                            // El detalle de serde es para el log; al streamer, un mensaje claro.
                            crate::logger::warn("ws", format!("comando «{}» no reconocido: {}", action_name(&text), truncate(&e.to_string(), 160)));
                            Err(UNKNOWN_COMMAND.to_string())
                        }
                    };
                    if let Err(e) = result {
                        let _ = direct_tx.send(ServerMessage::Error(e).to_json());
                    }
                }
                Message::Close(_) => break,
                _ => {}
            }
        }
    });

    // Si cualquiera termina, cerramos la otra.
    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }
    crate::logger::info("ws", "cliente desconectado");
}

/// Mensaje para el streamer cuando llega un comando que el motor no entiende
/// (normalmente, Control y motor de versiones distintas).
const UNKNOWN_COMMAND: &str = "El motor no reconoce esta orden. Si acabas de actualizar, cierra y vuelve a abrir Concursillo Studio.";

fn truncate(text: &str, max: usize) -> String {
    match text.char_indices().nth(max) {
        Some((i, _)) => format!("{}…", &text[..i]),
        None => text.to_string(),
    }
}

/// Nombre de la acción de un comando en crudo, para el log (sin el payload).
fn action_name(raw: &str) -> String {
    serde_json::from_str::<serde_json::Value>(raw)
        .ok()
        .and_then(|v| v.get("action").and_then(|a| a.as_str()).map(|a| a.chars().take(40).collect()))
        .unwrap_or_else(|| "?".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{game::GamePhase, schemas::GameMode};

    #[test]
    fn log_only_shows_action_name() {
        let raw = r#"{"action":"connect_twitch","payload":{"channel":"x","token":"oauth:secreto"}}"#;
        assert_eq!(action_name(raw), "connect_twitch");
        assert_eq!(action_name("no es json"), "?");
    }

    #[test]
    fn parses_commands() {
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"submit_answer","payload":2}"#).unwrap();
        assert!(matches!(c, ClientCommand::SubmitAnswer(2)));
        let c: ClientCommand = serde_json::from_str(r#"{"action":"next_round"}"#).unwrap();
        assert!(matches!(c, ClientCommand::NextRound));
        let c: ClientCommand = serde_json::from_str(r#"{"action":"reset_game"}"#).unwrap();
        assert!(matches!(c, ClientCommand::ResetGame));
    }

    #[tokio::test]
    async fn apply_broadcasts_state() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        let mut rx = app.tx.subscribe();
        app.apply(ClientCommand::ResetGame).await.unwrap();
        let msg = rx.recv().await.unwrap();
        assert!(msg.starts_with(r#"{"type":"state""#));
        assert_eq!(app.game.read().await.phase, GamePhase::Idle);
    }

    #[tokio::test]
    async fn rejected_command_does_not_broadcast() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        let mut rx = app.tx.subscribe();
        assert!(app.apply(ClientCommand::LoadNextQuestion).await.is_err());
        assert!(app.apply(ClientCommand::InitGame(vec![])).await.is_err());
        assert!(rx.try_recv().is_err());
    }

    #[tokio::test]
    async fn emits_audio_events_after_state() {
        let q = |correct| Question {
            id: "x".into(),
            mode: GameMode::Millonario,
            category: "c".into(),
            difficulty: crate::schemas::Difficulty::Easy,
            question: "q".into(),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct,
            meta: None,
        };
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        app.apply(ClientCommand::InitGame(vec![q(0), q(1), q(2)])).await.unwrap();
        let mut rx = app.tx.subscribe();
        let mut sounds = || -> Vec<String> {
            std::iter::from_fn(|| rx.try_recv().ok())
                .filter(|m| m.contains(r#""type":"audio""#))
                .collect()
        };
        let audio = |s: &str| format!(r#"{{"type":"audio","payload":{{"sound":"{s}"}}}}"#);

        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        assert_eq!(sounds(), vec![audio("play_tension")]);
        app.apply(ClientCommand::SubmitAnswer(0)).await.unwrap();
        assert_eq!(sounds(), vec![audio("play_correct")]);
        app.apply(ClientCommand::SubmitAnswer(0)).await.unwrap();
        assert!(sounds().is_empty(), "respuesta ignorada fuera de fase: sin sonido");
        app.apply(ClientCommand::NextRound).await.unwrap();
        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        // Marcar + revelar: marcar no suena ni revela; revelar suena como responder.
        assert!(app.apply(ClientCommand::RevealAnswer).await.unwrap_err().contains("Primero marca"));
        sounds();
        app.apply(ClientCommand::SelectAnswer(1)).await.unwrap();
        assert!(sounds().is_empty());
        assert_eq!(app.game.read().await.is_correct, None);
        app.apply(ClientCommand::RevealAnswer).await.unwrap();
        assert_eq!(sounds(), vec![audio("play_correct")]);
        app.apply(ClientCommand::NextRound).await.unwrap();
        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        app.apply(ClientCommand::SubmitAnswer(2)).await.unwrap();
        assert_eq!(sounds().last().unwrap(), &audio("play_win"));

        app.apply(ClientCommand::ResetGame).await.unwrap();
        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        app.apply(ClientCommand::SubmitAnswer(3)).await.unwrap();
        assert_eq!(sounds().last().unwrap(), &audio("play_wrong"));

        app.apply(ClientCommand::ChangeTheme("neon".into())).await.unwrap();
        assert_eq!(app.game.read().await.theme, "neon");
        assert!(app.apply(ClientCommand::ChangeTheme("Bad Theme".into())).await.is_err());

        app.apply(ClientCommand::SetTransparentBackground(true)).await.unwrap();
        assert!(app.game.read().await.transparent_background);
        // Es configuración de emisión: sobrevive a reiniciar la partida.
        app.apply(ClientCommand::ResetGame).await.unwrap();
        assert!(app.game.read().await.transparent_background);
    }

    #[tokio::test]
    async fn rosco_commands_emit_sounds() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        let questions = crate::game::rosco::tests::rosco_questions();
        app.apply(ClientCommand::InitRosco { questions, time_limit: None, min_correct: Some(2) })
            .await
            .unwrap();
        assert!(app.apply(ClientCommand::RoscoPass).await.is_err(), "antes de empezar");
        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        assert!(app.apply(ClientCommand::SubmitAnswer(0)).await.is_ok(), "ignorado sin error");
        assert!(app.apply(ClientCommand::LoadQuestion(crate::game::rosco::tests::rosco_questions()[0].clone())).await.is_err());

        let mut rx = app.tx.subscribe();
        let mut last_sound = || {
            std::iter::from_fn(|| rx.try_recv().ok())
                .filter(|m| m.contains(r#""type":"audio""#))
                .last()
                .unwrap_or_default()
        };
        app.apply(ClientCommand::RoscoAnswer { is_correct: true }).await.unwrap();
        assert!(last_sound().contains("play_correct"));
        app.apply(ClientCommand::RoscoPass).await.unwrap();
        assert!(last_sound().contains("play_pass"));
        app.apply(ClientCommand::RoscoAnswer { is_correct: false }).await.unwrap();
        assert!(last_sound().contains("play_wrong"));
        let r = app.game.read().await.rosco.clone().unwrap();
        assert_eq!((r.total_correct, r.total_wrong, r.total_passed, r.current_index), (1, 1, 1, 3));
    }

    #[tokio::test]
    async fn comodin_commands_and_flags_over_the_wire() {
        let q = |n: usize| Question {
            id: format!("q{n}"),
            mode: GameMode::Millonario,
            category: "c".into(),
            difficulty: crate::schemas::Difficulty::Easy,
            question: format!("Pregunta {n}"),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct: 0,
            meta: None,
        };
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        app.apply(ClientCommand::InitGame((0..15).map(q).collect())).await.unwrap();
        app.apply(ClientCommand::LoadNextQuestion).await.unwrap();
        let mut rx = app.tx.subscribe();
        app.apply(ClientCommand::UseComodin { comodin: Comodin::Chat }).await.unwrap();
        let msg = rx.try_recv().unwrap();
        assert!(msg.contains(r#""active_comodin":"Chat""#), "{msg}");
        assert!(msg.contains(r#""comodin_time_remaining":30"#));
        assert!(msg.contains(r#""comodines":{"Chat":"Active","Llamada":"Available","Sacrificio":"Available","Ruleta":"Available"}"#));
        assert!(msg.contains(r#""can_retire":false"#), "no con comodín activo");
        assert!(app.apply(ClientCommand::SubmitAnswer(0)).await.unwrap_err().contains("Cierra el comodín"));

        app.apply(ClientCommand::ResolveComodin { keep: true }).await.unwrap();
        assert!(app.game.read().await.can_retire);
        assert!(app.apply(ClientCommand::Retire { phrase: "adiós".into() }).await.is_err());
        app.apply(ClientCommand::Retire { phrase: "Me Cago".into() }).await.unwrap();
        assert_eq!(app.game.read().await.phase, GamePhase::Retired);
    }

    #[tokio::test]
    async fn start_preset_over_the_wire() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        let preset = Preset {
            id: "r".into(),
            name: "Rosco test".into(),
            mode: GameMode::Rosco,
            questions: crate::game::rosco::tests::rosco_questions(),
            theme: "neon".into(),
            time_limit: 120,
            min_correct: Some(10),
            twitch_channel: None,
        };
        let json = serde_json::to_string(&serde_json::json!({ "action": "start_preset", "payload": { "preset": preset } })).unwrap();
        let cmd: ClientCommand = serde_json::from_str(&json).unwrap();
        app.apply(cmd).await.unwrap();
        let g = app.game.read().await;
        assert_eq!((g.mode, g.time_limit, g.theme.as_str()), (GameMode::Rosco, 120, "neon"));
        assert_eq!(g.twitch.status, TwitchStatus::Disconnected, "sin canal no conecta");
    }

    #[tokio::test]
    async fn play_sound_only_relays_audio() {
        let app = AppState::new(GameState::new(GameMode::Millonario, 15));
        let before = serde_json::to_string(&*app.game.read().await).unwrap();
        let mut rx = app.tx.subscribe();
        let cmd: ClientCommand =
            serde_json::from_str(r#"{"action":"play_sound","payload":{"sound":"play_applause"}}"#).unwrap();
        app.apply(cmd).await.unwrap();
        let msgs: Vec<String> = std::iter::from_fn(|| rx.try_recv().ok()).collect();
        assert_eq!(msgs.last().unwrap(), r#"{"type":"audio","payload":{"sound":"play_applause"}}"#);
        assert_eq!(serde_json::to_string(&*app.game.read().await).unwrap(), before, "no toca el estado");
        assert!(app.apply(ClientCommand::PlaySound { sound: Sound::PlayTension }).await.is_err());
    }

    #[test]
    fn parses_comodin_commands() {
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"use_comodin","payload":{"comodin":"Llamada"}}"#).unwrap();
        assert!(matches!(c, ClientCommand::UseComodin { comodin: Comodin::Llamada }));
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"resolve_comodin","payload":{"keep":false}}"#).unwrap();
        assert!(matches!(c, ClientCommand::ResolveComodin { keep: false }));
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"retire","payload":{"phrase":"me cago"}}"#).unwrap();
        assert!(matches!(c, ClientCommand::Retire { .. }));
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"use_hito","payload":{"hito":"recover"}}"#).unwrap();
        assert!(matches!(c, ClientCommand::UseHito { hito: Hito::Recover, comodin: None }));
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"use_hito","payload":{"hito":"change_question"}}"#).unwrap();
        assert!(matches!(c, ClientCommand::UseHito { hito: Hito::ChangeQuestion, .. }));
    }

    #[test]
    fn parses_rosco_commands() {
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"rosco_answer","payload":{"is_correct":true}}"#).unwrap();
        assert!(matches!(c, ClientCommand::RoscoAnswer { is_correct: true }));
        let c: ClientCommand = serde_json::from_str(r#"{"action":"rosco_pass"}"#).unwrap();
        assert!(matches!(c, ClientCommand::RoscoPass));
        let c: ClientCommand =
            serde_json::from_str(r#"{"action":"init_rosco","payload":{"questions":[]}}"#).unwrap();
        assert!(matches!(c, ClientCommand::InitRosco { time_limit: None, min_correct: None, .. }));
    }

    #[test]
    fn parses_init_game() {
        let json = r#"{"action":"init_game","payload":[{"id":"1","mode":"Millonario","category":"c",
            "difficulty":"Easy","question":"q","answers":["a","b","c","d"],"correct":1,"meta":null}]}"#;
        let c: ClientCommand = serde_json::from_str(json).unwrap();
        assert!(matches!(c, ClientCommand::InitGame(v) if v.len() == 1));
    }
}
