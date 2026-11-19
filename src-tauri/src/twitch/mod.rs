//! Integración con el chat de Twitch para el comodín del chat.
//!
//! Arquitectura (sin bloquear Axum):
//! - `ConnectTwitch` solo marca el estado como `Connecting` y lanza UNA tarea
//!   tokio (`run`) que es dueña del cliente IRC. El handler del WebSocket
//!   vuelve enseguida; Axum nunca espera a la red de Twitch.
//! - La tarea recibe los mensajes por un canal (`incoming.recv().await`), y
//!   solo toma el lock del `GameState` un instante cuando un mensaje parece un
//!   voto. Los votos se emiten agrupados como mucho cada `VOTE_FLUSH`.
//! - `DisconnectTwitch` (o reconectar) aborta la tarea: al soltar el cliente,
//!   twitch-irc cierra la conexión.
//! - El token nunca entra en el `GameState` (que se envía al stage de OBS):
//!   vive solo dentro de la tarea.

use std::{collections::HashMap, sync::Mutex, time::Duration};

use serde::Serialize;
use tokio::{task::AbortHandle, time::MissedTickBehavior};
use ts_rs::TS;
use twitch_irc::{
    login::StaticLoginCredentials,
    message::{PrivmsgMessage, ServerMessage},
    ClientConfig, SecureTCPTransport, TwitchIRCClient,
};

use crate::{
    comodines::Comodin,
    game::{GamePhase, GameState},
    server::AppState,
};

/// Cada cuánto se emiten como máximo los votos (evita inundar a los clientes).
pub const VOTE_FLUSH: Duration = Duration::from_millis(200);
/// Si en este tiempo no llega el ROOMSTATE del canal, se avisa del error.
pub const JOIN_TIMEOUT: Duration = Duration::from_secs(12);
/// Mensajes más largos no son votos (ahorra trabajo con el spam).
const MAX_VOTE_LEN: usize = 24;

// ───────────────────────────── Tipos compartidos ─────────────────────────────

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct ChatVotes {
    pub a: u32,
    pub b: u32,
    pub c: u32,
    pub d: u32,
}

impl ChatVotes {
    fn slot(&mut self, option: usize) -> &mut u32 {
        match option {
            0 => &mut self.a,
            1 => &mut self.b,
            2 => &mut self.c,
            _ => &mut self.d,
        }
    }

    pub fn total(&self) -> u32 {
        self.a + self.b + self.c + self.d
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum TwitchStatus {
    #[default]
    Disconnected,
    Connecting,
    Connected,
    Error,
}

/// Lo que los clientes saben de la conexión. Sin token, a propósito.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct TwitchInfo {
    pub status: TwitchStatus,
    pub channel: Option<String>,
    /// `true` si se conectó con usuario + token; `false` si es anónima (solo lectura).
    pub authenticated: bool,
    pub error: Option<String>,
}

// ───────────────────────────── Parser de votos ─────────────────────────────

/// Palabras que pueden ir delante de la letra: "opción C", "la b", "voto A".
const VOTE_PREFIXES: [&str; 6] = ["opcion", "opción", "respuesta", "la", "voto", "voy"];

/// Interpreta un mensaje del chat como voto. Devuelve el índice (0 = A) o `None`.
///
/// Acepta: `A`, `b`, `c!`, `D.`, `Opción C`, `la b`, `voto a`, `respuesta D`.
/// Rechaza: frases normales ("a ver"), letras fuera de rango, mensajes largos
/// y emotes de Twitch que parecen letras: `D:` (cara de susto) y `B)` (gafas).
pub fn parse_vote(text: &str, options: usize) -> Option<usize> {
    let text = text.trim();
    if text.is_empty() || text.len() > MAX_VOTE_LEN {
        return None;
    }
    let lower = text.to_lowercase();
    let words: Vec<&str> = lower.split_whitespace().collect();
    let token = match words.as_slice() {
        [letter] => *letter,
        [prefix, letter] if VOTE_PREFIXES.contains(prefix) => *letter,
        _ => return None,
    };
    // Solo se toleran "!" y "." al final; ":" o ")" convertirían emotes en votos.
    let token = token.trim_end_matches(['!', '.']);
    let mut chars = token.chars();
    let (Some(c), None) = (chars.next(), chars.next()) else {
        return None;
    };
    let index = match c {
        'a' => 0,
        'b' => 1,
        'c' => 2,
        'd' => 3,
        _ => return None,
    };
    (index < options.min(4)).then_some(index)
}

impl GameState {
    /// ¿Se están aceptando votos ahora mismo?
    pub fn chat_voting_open(&self) -> bool {
        self.active_comodin == Some(Comodin::Chat)
            && matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting)
            && self.chat_votes.is_some()
            && self.comodin_time_remaining != Some(0)
    }

    /// Registra el voto de un espectador. Un voto por persona: si vuelve a
    /// votar, su voto se mueve (no se suma), así repetir no hace spam.
    /// Devuelve `true` si el recuento ha cambiado.
    pub fn record_chat_vote(&mut self, voter_id: &str, text: &str) -> bool {
        if !self.chat_voting_open() {
            return false;
        }
        let options = self.current_question.as_ref().map_or(0, |q| q.answers.len());
        let Some(choice) = parse_vote(text, options) else {
            return false;
        };
        let previous = self.chat_voters.insert(voter_id.to_string(), choice);
        if previous == Some(choice) {
            return false;
        }
        let votes = self.chat_votes.as_mut().expect("chat_voting_open");
        if let Some(prev) = previous {
            *votes.slot(prev) -= 1;
        }
        *votes.slot(choice) += 1;
        true
    }
}

// ───────────────────────────── Conexión ─────────────────────────────

/// Canal de Twitch normalizado: minúsculas, sin `#`, 3–25 de `[a-z0-9_]`.
pub fn normalize_channel(raw: &str) -> Result<String, String> {
    let channel = raw.trim().trim_start_matches('#').to_lowercase();
    let valid = (3..=25).contains(&channel.len())
        && channel.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if valid {
        Ok(channel)
    } else {
        Err(format!("Canal de Twitch inválido «{raw}»"))
    }
}

/// Credenciales: anónimas (solo lectura, suficiente para contar votos) o
/// usuario + token. Twitch exige que el usuario sea el dueño del token.
pub fn credentials(username: Option<&str>, token: Option<&str>) -> Result<StaticLoginCredentials, String> {
    fn clean(s: Option<&str>) -> Option<&str> {
        s.map(str::trim).filter(|s| !s.is_empty())
    }
    match (clean(username), clean(token)) {
        (_, None) => Ok(StaticLoginCredentials::anonymous()),
        (None, Some(_)) => Err("Con token hace falta también el usuario de Twitch dueño del token".into()),
        (Some(user), Some(token)) => {
            let token = token.strip_prefix("oauth:").unwrap_or(token);
            Ok(StaticLoginCredentials::new(user.to_lowercase(), Some(token.to_string())))
        }
    }
}

/// Dueño de la tarea de conexión (una como máximo).
#[derive(Default)]
pub struct TwitchManager {
    task: Mutex<Option<AbortHandle>>,
}

impl TwitchManager {
    /// Para la conexión actual, si la hay.
    pub fn stop(&self) {
        if let Some(handle) = self.task.lock().unwrap().take() {
            handle.abort();
        }
    }

    /// Lanza la tarea de conexión (sustituyendo la anterior). No bloquea.
    pub fn start(&self, app: AppState, channel: String, creds: StaticLoginCredentials) {
        self.stop();
        let handle = tokio::spawn(run(app, channel, creds)).abort_handle();
        *self.task.lock().unwrap() = Some(handle);
    }
}

/// Cambia el estado de la conexión y lo emite.
async fn set_status(app: &AppState, status: TwitchStatus, error: Option<String>) {
    let mut game = app.game.write().await;
    let channel = game.twitch.channel.clone().unwrap_or_default();
    match (&status, &error) {
        (_, Some(e)) => crate::logger::error("twitch", format!("#{channel}: {e}")),
        (TwitchStatus::Connected, None) => crate::logger::info("twitch", format!("conectado a #{channel}")),
        (s, None) => crate::logger::info("twitch", format!("#{channel}: {s:?}")),
    }
    game.twitch.status = status;
    game.twitch.error = error;
    app.broadcast(&mut game, None);
}

fn is_auth_failure(text: &str) -> bool {
    let t = text.to_lowercase();
    t.contains("authentication failed") || t.contains("improperly formatted auth") || t.contains("invalid nick")
}

/// Tarea de conexión: vive mientras dure la conexión.
async fn run(app: AppState, channel: String, creds: StaticLoginCredentials) {
    let config = ClientConfig::new_simple(creds);
    let (mut incoming, client) = TwitchIRCClient::<SecureTCPTransport, StaticLoginCredentials>::new(config);
    if let Err(e) = client.join(channel.clone()) {
        set_status(&app, TwitchStatus::Error, Some(format!("No se pudo unir a #{channel}: {e}"))).await;
        return;
    }

    let mut flush = tokio::time::interval(VOTE_FLUSH);
    flush.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let join_deadline = tokio::time::sleep(JOIN_TIMEOUT);
    tokio::pin!(join_deadline);
    let (mut joined, mut timeout_reported, mut dirty) = (false, false, false);

    loop {
        tokio::select! {
            msg = incoming.recv() => {
                let Some(msg) = msg else {
                    set_status(&app, TwitchStatus::Error, Some("Se cerró la conexión con Twitch".into())).await;
                    break;
                };
                match msg {
                    // Twitch manda ROOMSTATE al entrar en un canal que existe.
                    ServerMessage::RoomState(_) if !joined => {
                        joined = true;
                        set_status(&app, TwitchStatus::Connected, None).await;
                    }
                    ServerMessage::Notice(n) if is_auth_failure(&n.message_text) => {
                        set_status(&app, TwitchStatus::Error, Some(format!("Twitch rechazó el login: {}", n.message_text))).await;
                        break;
                    }
                    ServerMessage::Privmsg(m) => dirty |= handle_privmsg(&app, &m).await,
                    _ => {}
                }
            }
            // Votos agrupados: como mucho un broadcast cada VOTE_FLUSH.
            _ = flush.tick(), if dirty => {
                dirty = false;
                let mut game = app.game.write().await;
                app.broadcast(&mut game, None);
            }
            _ = &mut join_deadline, if !joined && !timeout_reported => {
                timeout_reported = true;
                set_status(&app, TwitchStatus::Error, Some(format!(
                    "Sin respuesta de #{channel}: ¿existe el canal? (se sigue intentando)"
                ))).await;
            }
        }
    }
    drop(client);
}

/// Un mensaje del chat. El lock de escritura solo se toma si parece un voto.
async fn handle_privmsg(app: &AppState, m: &PrivmsgMessage) -> bool {
    if parse_vote(&m.message_text, 4).is_none() {
        return false;
    }
    app.game.write().await.record_chat_vote(&m.sender.id, &m.message_text)
}

/// Votos agrupados por `voter → opción` (para tests y depuración).
pub fn tally(voters: &HashMap<String, usize>) -> ChatVotes {
    let mut v = ChatVotes::default();
    for &choice in voters.values() {
        *v.slot(choice) += 1;
    }
    v
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schemas::{Difficulty, GameMode, Question};
    use twitch_irc::message::IRCMessage;

    #[test]
    fn parses_valid_votes() {
        let cases = [
            ("A", 0), ("a", 0), ("  b  ", 1), ("C!", 2), ("d.", 3), ("c!!", 2),
            ("Opción C", 2), ("opcion d", 3), ("la b", 1), ("LA B", 1),
            ("voto a", 0), ("respuesta D", 3), ("voy c", 2),
        ];
        for (text, expected) in cases {
            assert_eq!(parse_vote(text, 4), Some(expected), "{text:?}");
        }
    }

    #[test]
    fn rejects_non_votes_and_emotes() {
        for text in [
            "", "   ", "e", "ab", "a ver", "dale", "la respuesta es b", "opción", "c c",
            "D:", "B)", ":D", "a?", "b,", "1", "AAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "opción C opción C opción C opción C",
        ] {
            assert_eq!(parse_vote(text, 4), None, "{text:?}");
        }
    }

    #[test]
    fn respects_number_of_options() {
        assert_eq!(parse_vote("C", 2), None);
        assert_eq!(parse_vote("B", 2), Some(1));
        assert_eq!(parse_vote("A", 0), None);
    }

    #[test]
    fn validates_channel_and_credentials() {
        assert_eq!(normalize_channel(" #MiCanal_99 ").unwrap(), "micanal_99");
        assert!(normalize_channel("ab").is_err());
        assert!(normalize_channel("canal con espacios").is_err());
        assert!(normalize_channel("canal-guion").is_err());

        assert_eq!(credentials(None, None).unwrap().credentials.login, "justinfan12345");
        assert_eq!(credentials(Some("x"), Some("  ")).unwrap().credentials.login, "justinfan12345", "token vacío = anónimo");
        assert!(credentials(None, Some("abc")).is_err());
        let c = credentials(Some("MiUser"), Some("oauth:abc123")).unwrap().credentials;
        assert_eq!((c.login.as_str(), c.token.as_deref()), ("miuser", Some("abc123")));
    }

    fn live_question_with_chat() -> GameState {
        let q = Question {
            id: "q".into(),
            mode: GameMode::Millonario,
            category: "c".into(),
            difficulty: Difficulty::Easy,
            question: "¿?".into(),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct: 0,
            meta: None,
        };
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.init_with_questions(vec![q]);
        s.load_next_question().unwrap();
        s
    }

    #[test]
    fn one_vote_per_viewer_and_vote_changes_move() {
        let mut s = live_question_with_chat();
        assert!(!s.record_chat_vote("u1", "A"), "sin comodín del chat no se cuenta");
        s.use_comodin(Comodin::Chat).unwrap();

        assert!(s.record_chat_vote("u1", "A"));
        assert!(!s.record_chat_vote("u1", "A"), "repetir no suma");
        assert!(!s.record_chat_vote("u1", "a!"), "ni con otra forma");
        assert!(s.record_chat_vote("u2", "opción C"));
        assert!(s.record_chat_vote("u3", "c"));
        assert!(!s.record_chat_vote("u4", "D:"), "emote, no voto");
        assert!(!s.record_chat_vote("u5", "hola a todos"));
        assert_eq!(s.chat_votes, Some(ChatVotes { a: 1, b: 0, c: 2, d: 0 }));

        // u1 cambia de idea: su voto se mueve de A a B.
        assert!(s.record_chat_vote("u1", "B"));
        assert_eq!(s.chat_votes, Some(ChatVotes { a: 0, b: 1, c: 2, d: 0 }));
        assert_eq!(s.chat_votes.unwrap(), tally(&s.chat_voters));
        assert_eq!(s.chat_votes.unwrap().total(), 3);
    }

    #[test]
    fn voting_closes_on_time_up_and_resets_on_close() {
        let mut s = live_question_with_chat();
        s.use_comodin(Comodin::Chat).unwrap();
        s.record_chat_vote("u1", "A");
        s.tick(30_000);
        assert_eq!(s.comodin_time_remaining, Some(0));
        assert!(!s.record_chat_vote("u2", "B"), "fuera de tiempo");
        assert_eq!(s.chat_votes.unwrap().total(), 1, "el recuento se queda visible");

        s.resolve_comodin(true).unwrap();
        assert_eq!(s.chat_votes, None);
        assert!(s.chat_voters.is_empty());
    }

    #[test]
    fn other_comodines_do_not_collect_votes() {
        let mut s = live_question_with_chat();
        s.use_comodin(Comodin::Llamada).unwrap();
        assert_eq!(s.chat_votes, None);
        assert!(!s.record_chat_vote("u1", "A"));
    }

    #[test]
    fn twitch_info_survives_new_game_and_reset() {
        let mut s = live_question_with_chat();
        s.twitch = TwitchInfo { status: TwitchStatus::Connected, channel: Some("canal".into()), authenticated: false, error: None };
        s.reset();
        assert_eq!(s.twitch.status, TwitchStatus::Connected);
        s.init_rosco(crate::game::rosco::tests::rosco_questions(), None, None).unwrap();
        assert_eq!(s.twitch.channel.as_deref(), Some("canal"));
    }

    /// Mensajes IRC reales (como los manda Twitch) pasan por el parser de twitch-irc.
    #[tokio::test]
    async fn raw_irc_privmsgs_are_counted() {
        let app = AppState::new(live_question_with_chat());
        app.game.write().await.use_comodin(Comodin::Chat).unwrap();
        // Mismo formato (y etiquetas) que manda Twitch de verdad.
        let privmsg = |n: usize, login: &str, user_id: u32, text: &str| {
            format!(
                "@badge-info=;badges=;color=#1E90FF;display-name={login};emotes=;first-msg=0;flags=;\
                 id=00000000-0000-0000-0000-00000000000{n};mod=0;room-id=12345;subscriber=0;\
                 tmi-sent-ts=170000000000{n};turbo=0;user-id={user_id};user-type= \
                 :{login}!{login}@{login}.tmi.twitch.tv PRIVMSG #canal :{text}"
            )
        };
        let raw = [
            privmsg(1, "ana", 101, "B"),
            privmsg(2, "ana", 101, "B"),
            privmsg(3, "leo", 202, "opción d"),
            privmsg(4, "eva", 303, "D:"),
            privmsg(5, "eva", 303, "la b"),
        ];
        let mut changed = 0;
        for line in &raw {
            let msg = ServerMessage::try_from(IRCMessage::parse(line).unwrap()).unwrap();
            let ServerMessage::Privmsg(m) = msg else { panic!("no es PRIVMSG: {line}") };
            changed += handle_privmsg(&app, &m).await as usize;
        }
        assert_eq!(changed, 3);
        assert_eq!(app.game.read().await.chat_votes, Some(ChatVotes { a: 0, b: 2, c: 0, d: 1 }));
    }

    #[test]
    fn token_never_reaches_clients() {
        let s = live_question_with_chat();
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains(r#""twitch":{"status":"Disconnected","channel":null,"authenticated":false,"error":null}"#));
        assert!(!json.contains("token"));
    }
}
