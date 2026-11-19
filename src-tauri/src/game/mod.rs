use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::comodines::{Comodin, ComodinesState, HitoStatus};
use crate::schemas::{GameMode, Question};
use crate::twitch::{ChatVotes, TwitchInfo};

pub mod rosco;
use rosco::{RoscoOutcome, RoscoState, DEFAULT_ROSCO_TIME};

/// Segundos por pregunta por defecto.
pub const DEFAULT_TIME_PER_QUESTION: u32 = 30;
/// Tema visual inicial (id de `packages/themes/*.json`).
pub const DEFAULT_THEME: &str = "default";
/// Preguntas que se juegan como máximo en Millonario. Las que sobren en el
/// set quedan de reserva para el hito "cambiar pregunta".
pub const MILLONARIO_MAX_QUESTIONS: usize = 15;

/// Id de tema válido: `[a-z0-9_-]`, de 1 a 32 caracteres.
pub fn is_valid_theme_id(theme: &str) -> bool {
    !theme.is_empty()
        && theme.len() <= 32
        && theme.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

/// Resultado de avanzar el reloj.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TickOutcome {
    /// No ha cambiado nada visible (reloj parado o no ha pasado un segundo entero).
    Unchanged,
    /// `time_remaining` ha bajado al menos un segundo.
    SecondElapsed,
    /// El tiempo llegó a 0: la partida pasa a `GameOver`.
    TimeUp,
    /// Se agotó el tiempo del comodín activo (sigue activo hasta que se cierre).
    ComodinTimeUp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum GamePhase {
    /// Esperando a que se cargue una pregunta.
    Idle,
    /// La pregunta se está mostrando/leyendo en pantalla.
    ReadingQuestion,
    /// Respuesta del concursante marcada pero aún sin revelar (momento de tensión).
    /// El reloj de la pregunta se congela; se puede cambiar hasta revelar.
    Selecting,
    /// Respuesta enviada y revelada (correcta), a la espera de la siguiente ronda.
    Answering,
    /// Respuesta incorrecta: fin de la partida.
    GameOver,
    /// Se respondieron correctamente todas las preguntas.
    Won,
    /// El concursante se plantó ("me cago") y se lleva todos sus aciertos.
    Retired,
}

/// Estado único para ambos modos. Los campos comunes (fase, reloj, tema,
/// racha) sirven a los dos; `rosco` solo existe en modo Rosco.
/// Solo se serializa (Rust → clientes): nunca se reconstruye desde JSON.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct GameState {
    pub mode: GameMode,
    pub phase: GamePhase,
    pub current_question_index: usize,
    pub total_questions: usize,
    pub current_question: Option<Question>,
    pub selected_answer: Option<usize>,
    pub time_remaining: u32,
    /// Segundos totales de la pregunta actual (para dibujar el progreso).
    pub time_limit: u32,
    /// El presentador ha congelado el reloj.
    pub timer_paused: bool,
    pub is_correct: Option<bool>,
    pub streak: usize,
    /// Id del tema visual activo (ver `packages/themes`).
    pub theme: String,
    /// Fondo 100% transparente en el stage (para superponerlo en OBS).
    /// Es configuración de emisión: sobrevive a Reset y a partidas nuevas.
    pub transparent_background: bool,
    /// Estado del rosco (letras y contadores). `None` en modo Millonario.
    pub rosco: Option<RoscoState>,
    /// Estado de cada comodín (siempre los 4, en orden fijo).
    pub comodines: ComodinesState,
    /// Comodín en curso. Mientras lo hay, el reloj de la pregunta está congelado.
    pub active_comodin: Option<Comodin>,
    /// Cuenta atrás del comodín activo (`None` si no tiene, p. ej. la ruleta).
    pub comodin_time_remaining: Option<u32>,
    pub comodin_time_limit: Option<u32>,
    /// Preguntas acertadas en esta partida (para niveles asegurados e hitos).
    pub correct_answers: usize,
    /// Aciertos asegurados: el mayor nivel de `SAFETY_LEVELS` alcanzado (0, 5, 10).
    pub safety_net: usize,
    /// Si ahora mismo se permite plantarse (derivado; ver `refresh_flags`).
    pub can_retire: bool,
    /// Hito de la pregunta 8: recuperar un comodín.
    pub hito_8: HitoStatus,
    /// Hito de la pregunta 11: cambiar la pregunta.
    pub hito_11: HitoStatus,
    /// Aciertos que cuentan como premio al acabar (`None` mientras se juega).
    pub prize_level: Option<usize>,
    /// Estado de la conexión al chat de Twitch (nunca incluye el token).
    pub twitch: TwitchInfo,
    /// Recuento de votos del chat mientras el comodín del chat está activo.
    pub chat_votes: Option<ChatVotes>,
    /// Voto actual de cada espectador (id de Twitch → opción). Solo en Rust.
    #[serde(skip)]
    #[ts(skip)]
    pub(crate) chat_voters: std::collections::HashMap<String, usize>,
    /// Set de preguntas de la partida. Vive solo en Rust: no se envía a los
    /// clientes (evita filtrar respuestas futuras al stage) ni se exporta a TS.
    #[serde(skip)]
    #[ts(skip)]
    pub questions: Vec<Question>,
    /// Millonario: segundos por pregunta (configurable con un preset).
    /// Es configuración, no partida: sobrevive a Reset y a partidas nuevas.
    #[serde(skip)]
    #[ts(skip)]
    pub(crate) question_time: u32,
    /// Sube cada vez que se cambia un sonido: el stage recarga los audios.
    pub sounds_version: u32,
    /// Milisegundos acumulados desde el último segundo descontado.
    #[serde(skip)]
    #[ts(skip)]
    pub(crate) tick_accum_ms: u64,
}

impl GameState {
    pub fn new(mode: GameMode, total_questions: usize) -> Self {
        Self {
            questions: Vec::new(),
            mode,
            phase: GamePhase::Idle,
            current_question_index: 0,
            total_questions,
            current_question: None,
            selected_answer: None,
            time_remaining: DEFAULT_TIME_PER_QUESTION,
            time_limit: DEFAULT_TIME_PER_QUESTION,
            timer_paused: false,
            is_correct: None,
            streak: 0,
            theme: DEFAULT_THEME.to_string(),
            transparent_background: false,
            rosco: None,
            comodines: ComodinesState::default(),
            active_comodin: None,
            comodin_time_remaining: None,
            comodin_time_limit: None,
            correct_answers: 0,
            safety_net: 0,
            can_retire: false,
            hito_8: HitoStatus::Locked,
            hito_11: HitoStatus::Locked,
            prize_level: None,
            twitch: TwitchInfo::default(),
            chat_votes: None,
            chat_voters: Default::default(),
            question_time: DEFAULT_TIME_PER_QUESTION,
            sounds_version: 0,
            tick_accum_ms: 0,
        }
    }

    /// Nueva partida con un set de preguntas. Se juegan hasta
    /// `MILLONARIO_MAX_QUESTIONS`; el resto queda de reserva. El tema se conserva.
    pub fn init_with_questions(&mut self, questions: Vec<Question>) {
        self.restart(GameMode::Millonario, questions.len().min(MILLONARIO_MAX_QUESTIONS));
        self.questions = questions;
    }

    /// Nueva partida de Rosco. Valida el set (27 letras) antes de tocar nada.
    /// Queda en `Idle`: el reloj arranca con `load_next_question` (empezar).
    pub fn init_rosco(
        &mut self,
        questions: Vec<Question>,
        time_limit: Option<u32>,
        min_correct: Option<usize>,
    ) -> Result<(), String> {
        let rosco = RoscoState::new(questions, min_correct)?;
        let time_limit = time_limit.unwrap_or(DEFAULT_ROSCO_TIME);
        if time_limit == 0 {
            return Err("El tiempo del rosco debe ser mayor que 0".into());
        }
        self.restart(GameMode::Rosco, rosco.letters.len());
        self.time_limit = time_limit;
        self.time_remaining = time_limit;
        self.rosco = Some(rosco);
        Ok(())
    }

    /// Copia la letra en juego a los campos comunes (`current_question`, índice).
    fn sync_rosco_current(&mut self) {
        if let Some(r) = &self.rosco {
            self.current_question_index = r.current_index;
            self.current_question = Some(r.current().question.clone());
        }
    }

    /// Cierra el rosco: `Won` si alcanzó `min_correct`, si no `GameOver`.
    fn finish_rosco(&mut self) {
        let won = self.rosco.as_ref().is_some_and(RoscoState::won);
        self.is_correct = Some(won);
        self.phase = if won { GamePhase::Won } else { GamePhase::GameOver };
        self.tick_accum_ms = 0;
    }

    fn rosco_in_play(&mut self) -> Result<&mut RoscoState, String> {
        if !matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting) {
            return Err(format!("El rosco no está en juego (fase: {:?})", self.phase));
        }
        self.rosco.as_mut().ok_or_else(|| "No hay ningún rosco en juego".to_string())
    }

    /// El presentador marca la letra actual como acertada/fallada.
    pub fn rosco_answer(&mut self, is_correct: bool) -> Result<RoscoOutcome, String> {
        let outcome = self.rosco_in_play()?.answer(is_correct);
        self.streak = if is_correct { self.streak + 1 } else { 0 };
        self.apply_rosco_outcome(outcome);
        Ok(outcome)
    }

    /// Pasapalabra.
    pub fn rosco_pass(&mut self) -> Result<RoscoOutcome, String> {
        let outcome = self.rosco_in_play()?.pass();
        self.apply_rosco_outcome(outcome);
        Ok(outcome)
    }

    fn apply_rosco_outcome(&mut self, outcome: RoscoOutcome) {
        match outcome {
            RoscoOutcome::Finished { .. } => self.finish_rosco(),
            _ => self.sync_rosco_current(),
        }
    }

    /// Partida nueva desde cero, conservando lo que no es de la partida:
    /// el tema, el fondo transparente, la conexión a Twitch, el tiempo por pregunta
    /// y la versión de sonidos.
    fn restart(&mut self, mode: GameMode, total_questions: usize) {
        let theme = std::mem::take(&mut self.theme);
        let twitch = std::mem::take(&mut self.twitch);
        let (question_time, sounds_version) = (self.question_time, self.sounds_version);
        let transparent_background = self.transparent_background;
        *self = Self::new(mode, total_questions);
        self.transparent_background = transparent_background;
        self.theme = theme;
        self.twitch = twitch;
        self.question_time = question_time;
        self.sounds_version = sounds_version;
        // En Millonario el reloj en Idle ya enseña el tiempo configurado.
        self.time_limit = question_time;
        self.time_remaining = question_time;
    }

    /// ¿Corre algún reloj? El del comodín si hay uno activo (el de la pregunta
    /// queda congelado); si no, el de la pregunta. Nunca con pausa.
    pub fn timer_running(&self) -> bool {
        if !matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting) || self.timer_paused {
            return false;
        }
        if self.active_comodin.is_some() {
            return self.comodin_time_remaining.is_some_and(|t| t > 0);
        }
        // Con la respuesta ya marcada (Selecting) el reloj de la pregunta no corre.
        self.phase == GamePhase::ReadingQuestion && self.time_remaining > 0
    }

    /// Avanza el reloj `elapsed_ms` milisegundos reales. Acumula fracciones de
    /// segundo para que el ritmo sea exacto aunque el ticker llame más a menudo.
    pub fn tick(&mut self, elapsed_ms: u64) -> TickOutcome {
        if !self.timer_running() {
            return TickOutcome::Unchanged;
        }
        self.tick_accum_ms += elapsed_ms;
        if self.active_comodin.is_some() {
            return self.tick_comodin();
        }
        let mut changed = false;
        while self.tick_accum_ms >= 1000 && self.time_remaining > 0 {
            self.tick_accum_ms -= 1000;
            self.time_remaining -= 1;
            changed = true;
        }
        if self.time_remaining == 0 {
            if self.rosco.is_some() {
                // En el rosco se acaba la partida y se evalúa lo acertado.
                self.finish_rosco();
                return TickOutcome::TimeUp;
            }
            self.tick_accum_ms = 0;
            self.is_correct = Some(false);
            self.streak = 0;
            self.phase = GamePhase::GameOver;
            self.prize_level = Some(self.safety_net);
            return TickOutcome::TimeUp;
        }
        if changed {
            TickOutcome::SecondElapsed
        } else {
            TickOutcome::Unchanged
        }
    }

    /// Descuenta el reloj del comodín activo (ya con `tick_accum_ms` sumado).
    fn tick_comodin(&mut self) -> TickOutcome {
        let Some(mut left) = self.comodin_time_remaining else {
            return TickOutcome::Unchanged;
        };
        let mut changed = false;
        while self.tick_accum_ms >= 1000 && left > 0 {
            self.tick_accum_ms -= 1000;
            left -= 1;
            changed = true;
        }
        self.comodin_time_remaining = Some(left);
        if left == 0 {
            self.tick_accum_ms = 0;
            TickOutcome::ComodinTimeUp
        } else if changed {
            TickOutcome::SecondElapsed
        } else {
            TickOutcome::Unchanged
        }
    }

    pub fn set_timer_paused(&mut self, paused: bool) {
        self.timer_paused = paused;
    }

    /// Cambia el tema. Solo ids sencillos (`[a-z0-9_-]`, máx. 32).
    pub fn set_theme(&mut self, theme: &str) -> Result<(), String> {
        if !is_valid_theme_id(theme) {
            return Err(format!("Tema inválido «{theme}»"));
        }
        self.theme = theme.to_string();
        Ok(())
    }

    /// Reinicia la partida conservando el set cargado (si lo hay) y el tema.
    pub fn reset(&mut self) {
        if let Some(mut rosco) = self.rosco.take() {
            rosco.reset();
            let time_limit = self.time_limit;
            self.restart(GameMode::Rosco, rosco.letters.len());
            self.time_limit = time_limit;
            self.time_remaining = time_limit;
            self.rosco = Some(rosco);
            return;
        }
        let questions = std::mem::take(&mut self.questions);
        if questions.is_empty() {
            self.restart(self.mode, self.total_questions);
        } else {
            self.init_with_questions(questions);
        }
    }

    /// Carga desde el set la pregunta que toca en la ronda actual.
    /// En el Rosco equivale a "empezar": pone en juego la letra actual y arranca el reloj.
    pub fn load_next_question(&mut self) -> Result<(), String> {
        if self.rosco.is_some() {
            if self.phase != GamePhase::Idle {
                return Err("El rosco ya está en marcha o ha terminado (usa Reset)".into());
            }
            self.sync_rosco_current();
            self.timer_paused = false;
            self.tick_accum_ms = 0;
            self.phase = GamePhase::ReadingQuestion;
            return Ok(());
        }
        if self.questions.is_empty() {
            return Err("No hay ningún set cargado: inicia una partida primero".into());
        }
        if self.phase != GamePhase::Idle {
            return Err(format!(
                "Solo se puede cargar pregunta en fase Idle (fase actual: {:?})",
                self.phase
            ));
        }
        if self.current_question_index >= self.total_questions {
            return Err("No quedan preguntas en el set".into());
        }
        let question = self.questions[self.current_question_index].clone();
        self.load_question(question);
        Ok(())
    }

    /// Carga una pregunta en la ronda actual y resetea el estado de la ronda.
    pub fn load_question(&mut self, question: Question) {
        self.current_question = Some(question);
        self.selected_answer = None;
        self.is_correct = None;
        self.time_limit = self.question_time;
        self.time_remaining = self.time_limit;
        self.timer_paused = false;
        self.tick_accum_ms = 0;
        self.phase = GamePhase::ReadingQuestion;
    }

    /// Marca la respuesta del concursante **sin revelarla** (fase `Selecting`).
    /// El Stage la resalta y el reloj se congela; se puede cambiar hasta `reveal_answer`.
    pub fn select_answer(&mut self, answer_index: usize) -> Result<(), String> {
        if self.rosco.is_some() {
            return Err("En el rosco se usa Acertó / Falló / Pasapalabra".into());
        }
        if let Some(c) = self.active_comodin {
            return Err(format!("Cierra el comodín {c:?} antes de responder"));
        }
        if !matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting) {
            return Err("No hay ninguna pregunta en juego".into());
        }
        let options = self.current_question.as_ref().map_or(0, |q| q.answers.len());
        if answer_index >= options {
            return Err(format!("La opción {} no existe en esta pregunta", answer_index + 1));
        }
        self.selected_answer = Some(answer_index);
        self.phase = GamePhase::Selecting;
        Ok(())
    }

    /// Revela la respuesta marcada con `select_answer`. Devuelve `true` si es correcta.
    pub fn reveal_answer(&mut self) -> Result<bool, String> {
        if let Some(c) = self.active_comodin {
            return Err(format!("Cierra el comodín {c:?} antes de revelar"));
        }
        match (self.phase, self.selected_answer) {
            (GamePhase::Selecting, Some(i)) => Ok(self.submit_answer(i)),
            _ => Err("Primero marca la respuesta del concursante (A, B, C o D)".into()),
        }
    }

    /// Envía una respuesta. Devuelve `true` si es correcta.
    ///
    /// - Correcta: suma racha y pasa a `Answering` (o `Won` si era la última).
    /// - Incorrecta: resetea racha y pasa a `GameOver`.
    ///
    /// Si no hay pregunta activa o la fase no admite respuesta, no cambia nada
    /// y devuelve `false`.
    pub fn submit_answer(&mut self, answer_index: usize) -> bool {
        if self.rosco.is_some() || self.active_comodin.is_some() {
            return false; // Rosco: rosco_answer. Con comodín activo: cerrarlo antes.
        }
        if !matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting) {
            return false;
        }
        let Some(question) = &self.current_question else {
            return false;
        };

        let correct = answer_index == question.correct;
        self.selected_answer = Some(answer_index);
        self.is_correct = Some(correct);

        if correct {
            self.streak += 1;
            self.register_correct_answer();
            if self.current_question_index + 1 >= self.total_questions {
                self.phase = GamePhase::Won;
                self.prize_level = Some(self.correct_answers);
            } else {
                self.phase = GamePhase::Answering;
            }
        } else {
            self.streak = 0;
            self.phase = GamePhase::GameOver;
            self.prize_level = Some(self.safety_net);
        }
        correct
    }

    /// Avanza a la siguiente ronda tras una respuesta correcta.
    /// Devuelve `false` si la fase actual no permite avanzar.
    pub fn next_round(&mut self) -> bool {
        if self.rosco.is_some() || self.phase != GamePhase::Answering {
            return false;
        }
        self.current_question_index += 1;
        self.current_question = None;
        self.selected_answer = None;
        self.is_correct = None;
        self.time_remaining = self.time_limit;
        self.timer_paused = false;
        self.tick_accum_ms = 0;
        self.phase = GamePhase::Idle;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schemas::Difficulty;

    fn q(correct: usize) -> Question {
        Question {
            id: "q1".into(),
            mode: GameMode::Millonario,
            category: "General".into(),
            difficulty: Difficulty::Easy,
            question: "¿2 + 2?".into(),
            answers: vec!["3".into(), "4".into(), "5".into(), "6".into()],
            correct,
            meta: None,
        }
    }

    #[test]
    fn full_flow() {
        let mut s = GameState::new(GameMode::Millonario, 2);
        s.load_question(q(1));
        assert!(s.submit_answer(1));
        assert_eq!(s.phase, GamePhase::Answering);
        assert_eq!(s.streak, 1);
        assert!(s.next_round());
        assert_eq!(s.current_question_index, 1);
        s.load_question(q(1));
        assert!(s.submit_answer(1));
        assert_eq!(s.phase, GamePhase::Won);
    }

    #[test]
    fn plays_through_loaded_set() {
        let mut s = GameState::new(GameMode::Millonario, 15);
        assert!(s.load_next_question().is_err());
        s.init_with_questions(vec![q(0), q(2)]);
        assert_eq!(s.total_questions, 2);
        s.load_next_question().unwrap();
        assert!(s.load_next_question().is_err(), "no se recarga fuera de Idle");
        assert!(s.submit_answer(0));
        assert!(s.next_round());
        s.load_next_question().unwrap();
        assert_eq!(s.current_question.as_ref().unwrap().correct, 2);
        assert!(s.submit_answer(2));
        assert_eq!(s.phase, GamePhase::Won);
        s.reset();
        assert_eq!((s.current_question_index, s.questions.len()), (0, 2));
        assert!(!serde_json::to_string(&s).unwrap().contains("\"questions\""));
    }

    #[test]
    fn timer_counts_down_accumulating_fractions() {
        let mut s = GameState::new(GameMode::Millonario, 5);
        assert_eq!(s.tick(5000), TickOutcome::Unchanged, "sin pregunta no corre");
        s.load_question(q(1));
        assert_eq!(s.tick(600), TickOutcome::Unchanged);
        assert_eq!(s.tick(600), TickOutcome::SecondElapsed);
        assert_eq!(s.time_remaining, DEFAULT_TIME_PER_QUESTION - 1);
        // 200 ms sobrantes + 2.8 s = 3 s exactos.
        assert_eq!(s.tick(2800), TickOutcome::SecondElapsed);
        assert_eq!(s.time_remaining, DEFAULT_TIME_PER_QUESTION - 4);
    }

    #[test]
    fn pause_freezes_and_resume_continues() {
        let mut s = GameState::new(GameMode::Millonario, 5);
        s.load_question(q(1));
        s.set_timer_paused(true);
        assert_eq!(s.tick(10_000), TickOutcome::Unchanged);
        assert_eq!(s.time_remaining, DEFAULT_TIME_PER_QUESTION);
        s.set_timer_paused(false);
        assert_eq!(s.tick(1000), TickOutcome::SecondElapsed);
    }

    #[test]
    fn time_up_ends_game() {
        let mut s = GameState::new(GameMode::Millonario, 5);
        s.load_question(q(1));
        s.submit_answer(1);
        s.next_round();
        s.load_question(q(1));
        assert_eq!(s.streak, 1);
        assert_eq!(s.tick(DEFAULT_TIME_PER_QUESTION as u64 * 1000 + 999), TickOutcome::TimeUp);
        assert_eq!(
            (s.phase, s.time_remaining, s.is_correct, s.streak),
            (GamePhase::GameOver, 0, Some(false), 0)
        );
        assert_eq!(s.tick(1000), TickOutcome::Unchanged, "no sigue tras acabar");
        assert!(!s.submit_answer(1), "no se responde fuera de tiempo");
    }

    #[test]
    fn theme_survives_reset_and_rejects_bad_ids() {
        let mut s = GameState::new(GameMode::Millonario, 5);
        s.set_theme("neon").unwrap();
        assert!(s.set_theme("../x").is_err());
        assert!(s.set_theme("").is_err());
        s.reset();
        assert_eq!(s.theme, "neon");
        s.init_with_questions(vec![q(0)]);
        assert_eq!(s.theme, "neon");
    }

    #[test]
    fn rosco_full_game_through_game_state() {
        use rosco::tests::rosco_questions;
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.set_theme("neon").unwrap();
        s.init_rosco(rosco_questions(), Some(60), Some(26)).unwrap();
        assert_eq!((s.mode, s.phase, s.total_questions, s.time_limit), (GameMode::Rosco, GamePhase::Idle, 27, 60));
        assert_eq!(s.theme, "neon");
        assert!(s.rosco_answer(true).is_err(), "no se juega antes de empezar");

        s.load_next_question().unwrap();
        assert_eq!(s.current_question.as_ref().unwrap().question, "Pregunta A");
        assert!(!s.submit_answer(0), "submit_answer no aplica al rosco");
        assert!(!s.next_round());

        s.rosco_answer(true).unwrap();
        s.rosco_pass().unwrap();
        assert_eq!((s.current_question_index, s.streak), (2, 1));
        assert_eq!(s.current_question.as_ref().unwrap().question, "Pregunta C");
        s.rosco_answer(false).unwrap();
        assert_eq!(s.streak, 0);
        for _ in 3..27 {
            s.rosco_answer(true).unwrap();
        }
        // Queda solo la B (pasada): al acertarla son 26 aciertos => gana.
        assert_eq!(s.current_question.as_ref().unwrap().question, "Pregunta B");
        assert_eq!(s.rosco_answer(true).unwrap(), RoscoOutcome::Finished { won: true });
        assert_eq!((s.phase, s.is_correct), (GamePhase::Won, Some(true)));

        s.reset();
        let r = s.rosco.as_ref().unwrap();
        assert_eq!((s.phase, r.total_correct, s.time_remaining, s.theme.as_str()), (GamePhase::Idle, 0, 60, "neon"));
    }

    #[test]
    fn rosco_time_up_evaluates_score() {
        let mut s = GameState::new(GameMode::Rosco, 27);
        s.init_rosco(rosco::tests::rosco_questions(), Some(10), Some(1)).unwrap();
        s.load_next_question().unwrap();
        s.rosco_answer(true).unwrap();
        assert_eq!(s.tick(10_000), TickOutcome::TimeUp);
        assert_eq!(s.phase, GamePhase::Won, "1 acierto alcanza min_correct = 1");

        s.init_rosco(rosco::tests::rosco_questions(), Some(10), None).unwrap();
        s.load_next_question().unwrap();
        assert_eq!(s.tick(10_000), TickOutcome::TimeUp);
        assert_eq!(s.phase, GamePhase::GameOver);
    }

    #[test]
    fn init_game_after_rosco_returns_to_millonario() {
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.init_rosco(rosco::tests::rosco_questions(), None, None).unwrap();
        s.init_with_questions(vec![q(0)]);
        assert_eq!(s.mode, GameMode::Millonario);
        assert!(s.rosco.is_none());
    }

    #[test]
    fn wrong_answer_ends_game() {
        let mut s = GameState::new(GameMode::Millonario, 5);
        s.load_question(q(1));
        assert!(!s.submit_answer(0));
        assert_eq!(s.phase, GamePhase::GameOver);
        assert_eq!(s.streak, 0);
        assert!(!s.next_round());
    }

    #[test]
    fn select_then_reveal_freezes_clock_and_allows_changing_mind() {
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.init_with_questions(vec![q(1), q(1)]);
        s.load_next_question().unwrap();
        s.select_answer(0).unwrap();
        assert_eq!((s.phase, s.selected_answer, s.is_correct), (GamePhase::Selecting, Some(0), None));
        // Reloj congelado mientras está marcada.
        let before = s.time_remaining;
        assert!(!s.timer_running());
        s.tick(5_000);
        assert_eq!(s.time_remaining, before);
        // Cambia de opinión y luego se revela.
        s.select_answer(1).unwrap();
        assert!(s.select_answer(9).is_err());
        assert_eq!(s.reveal_answer(), Ok(true));
        assert_eq!((s.phase, s.streak), (GamePhase::Answering, 1));
        // Sin respuesta marcada no se puede revelar.
        assert!(s.reveal_answer().is_err());
    }
}
