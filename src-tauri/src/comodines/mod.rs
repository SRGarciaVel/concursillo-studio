//! Comodines, plantarse ("me cago") e hitos del modo Millonario.
//!
//! Los tipos viven aquí y las reglas se implementan como un bloque
//! `impl GameState` aparte, para no mezclarlas con el motor base.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::game::{GamePhase, GameState};
use crate::schemas::GameMode;

/// Aciertos a partir de los cuales el premio queda asegurado.
pub const SAFETY_LEVELS: [usize; 2] = [5, 10];
/// Aciertos que desbloquean el hito "recuperar comodín" (pregunta 8).
pub const HITO_RECOVER_AT: usize = 8;
/// Aciertos que desbloquean el hito "cambiar pregunta" (pregunta 11).
pub const HITO_CHANGE_AT: usize = 11;
/// Frase para plantarse, normalizada (minúsculas, sin espacios).
const RETIRE_PHRASE: &str = "mecago";

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum Comodin {
    Chat,
    Llamada,
    Sacrificio,
    Ruleta,
}

impl Comodin {
    pub const ALL: [Comodin; 4] = [Comodin::Chat, Comodin::Llamada, Comodin::Sacrificio, Comodin::Ruleta];

    /// Segundos de cuenta atrás del comodín. La ruleta no tiene: la cierra el presentador.
    pub fn duration(self) -> Option<u32> {
        match self {
            Comodin::Chat => Some(30),
            Comodin::Llamada => Some(45),
            Comodin::Sacrificio => Some(30),
            Comodin::Ruleta => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum ComodinStatus {
    Available,
    Active,
    Used,
}

/// Estado de un hito: bloqueado hasta alcanzarlo, disponible una vez, y gastado.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum HitoStatus {
    Locked,
    Available,
    Used,
}

/// Hitos que puede usar el concursante (`"recover"` / `"change_question"`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum Hito {
    /// Hito de la pregunta 8: un comodín usado vuelve a estar disponible.
    Recover,
    /// Hito de la pregunta 11: se cambia la pregunta en juego por una de reserva.
    ChangeQuestion,
}

/// Estado de los 4 comodines. Es un struct (no un `HashMap`) para que el tipo
/// TS sea exacto (`{ Chat: ComodinStatus, ... }`) y siempre estén los 4.
/// En JSON: `{"Chat":"Available","Llamada":"Used",...}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct ComodinesState {
    #[serde(rename = "Chat")]
    #[ts(rename = "Chat")]
    pub chat: ComodinStatus,
    #[serde(rename = "Llamada")]
    #[ts(rename = "Llamada")]
    pub llamada: ComodinStatus,
    #[serde(rename = "Sacrificio")]
    #[ts(rename = "Sacrificio")]
    pub sacrificio: ComodinStatus,
    #[serde(rename = "Ruleta")]
    #[ts(rename = "Ruleta")]
    pub ruleta: ComodinStatus,
}

impl Default for ComodinesState {
    fn default() -> Self {
        Self {
            chat: ComodinStatus::Available,
            llamada: ComodinStatus::Available,
            sacrificio: ComodinStatus::Available,
            ruleta: ComodinStatus::Available,
        }
    }
}

impl ComodinesState {
    pub fn get(&self, c: Comodin) -> ComodinStatus {
        match c {
            Comodin::Chat => self.chat,
            Comodin::Llamada => self.llamada,
            Comodin::Sacrificio => self.sacrificio,
            Comodin::Ruleta => self.ruleta,
        }
    }

    pub fn set(&mut self, c: Comodin, status: ComodinStatus) {
        *match c {
            Comodin::Chat => &mut self.chat,
            Comodin::Llamada => &mut self.llamada,
            Comodin::Sacrificio => &mut self.sacrificio,
            Comodin::Ruleta => &mut self.ruleta,
        } = status;
    }
}

impl std::ops::Index<Comodin> for ComodinesState {
    type Output = ComodinStatus;
    fn index(&self, c: Comodin) -> &ComodinStatus {
        match c {
            Comodin::Chat => &self.chat,
            Comodin::Llamada => &self.llamada,
            Comodin::Sacrificio => &self.sacrificio,
            Comodin::Ruleta => &self.ruleta,
        }
    }
}

/// "me cago", sin importar mayúsculas ni espacios ("ME  CAGO", " mecago ").
pub fn is_retire_phrase(phrase: &str) -> bool {
    let normalized: String = phrase.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect();
    normalized == RETIRE_PHRASE
}

/// Nivel asegurado para un número de aciertos (el mayor de `SAFETY_LEVELS` alcanzado).
pub fn safety_net_for(correct_answers: usize) -> usize {
    SAFETY_LEVELS.iter().copied().filter(|&l| correct_answers >= l).max().unwrap_or(0)
}

impl GameState {
    fn question_live(&self) -> bool {
        matches!(self.phase, GamePhase::ReadingQuestion | GamePhase::Selecting)
    }

    fn require_millonario(&self, what: &str) -> Result<(), String> {
        if self.mode != GameMode::Millonario || self.rosco.is_some() {
            return Err(format!("{what} solo existe en modo Millonario"));
        }
        Ok(())
    }

    /// Activa un comodín: congela el reloj de la pregunta y arranca el suyo.
    pub fn use_comodin(&mut self, comodin: Comodin) -> Result<(), String> {
        self.require_millonario("Los comodines")?;
        if !self.question_live() {
            return Err("Solo se puede usar un comodín con una pregunta en juego".into());
        }
        if let Some(active) = self.active_comodin {
            return Err(format!("Ya hay un comodín activo ({active:?})"));
        }
        let status = self.comodines.get(comodin);
        if status != ComodinStatus::Available {
            return Err(format!("El comodín {comodin:?} no está disponible ({status:?})"));
        }
        self.comodines.set(comodin, ComodinStatus::Active);
        self.active_comodin = Some(comodin);
        if comodin == Comodin::Chat {
            // Votación nueva: el recuento empieza de cero.
            self.chat_votes = Some(Default::default());
            self.chat_voters.clear();
        }
        self.comodin_time_limit = comodin.duration();
        self.comodin_time_remaining = comodin.duration();
        self.tick_accum_ms = 0;
        Ok(())
    }

    /// Cierra el comodín activo. `keep`: se gasta (Used); si no, vuelve a Available.
    /// El reloj de la pregunta continúa donde se quedó.
    pub fn resolve_comodin(&mut self, keep: bool) -> Result<Comodin, String> {
        let comodin = self.active_comodin.take().ok_or("No hay ningún comodín activo")?;
        let status = if keep { ComodinStatus::Used } else { ComodinStatus::Available };
        self.comodines.set(comodin, status);
        // Al cerrar el comodín se deja de contar (y se olvidan los votos).
        self.chat_votes = None;
        self.chat_voters.clear();
        self.comodin_time_limit = None;
        self.comodin_time_remaining = None;
        self.tick_accum_ms = 0;
        Ok(comodin)
    }

    /// Plantarse con la frase "me cago": se lleva TODOS los aciertos acumulados
    /// (nivel actual de la escalera). Fallar, en cambio, baja al `safety_net`.
    pub fn retire(&mut self, phrase: &str) -> Result<(), String> {
        self.require_millonario("Plantarse")?;
        if !is_retire_phrase(phrase) {
            return Err("Frase incorrecta: para plantarse hay que decir «me cago»".into());
        }
        if !self.can_retire {
            return Err(format!("Ahora no se puede plantar (fase: {:?})", self.phase));
        }
        self.phase = GamePhase::Retired;
        self.prize_level = Some(self.correct_answers);
        Ok(())
    }

    /// Usa un hito ya alcanzado. Para `Recover`, `comodin` elige cuál recuperar
    /// (si no se indica, el primero gastado en orden Chat, Llamada, Sacrificio, Ruleta).
    pub fn use_hito(&mut self, hito: Hito, comodin: Option<Comodin>) -> Result<(), String> {
        self.require_millonario("Los hitos")?;
        match hito {
            Hito::Recover => {
                if self.hito_8 != HitoStatus::Available {
                    return Err(format!("El hito de la pregunta {HITO_RECOVER_AT} no está disponible ({:?})", self.hito_8));
                }
                let target = match comodin {
                    Some(c) => c,
                    None => *Comodin::ALL
                        .iter()
                        .find(|&&c| self.comodines.get(c) == ComodinStatus::Used)
                        .ok_or("No hay ningún comodín gastado que recuperar")?,
                };
                if self.comodines.get(target) != ComodinStatus::Used {
                    return Err(format!("El comodín {target:?} no está gastado"));
                }
                self.comodines.set(target, ComodinStatus::Available);
                self.hito_8 = HitoStatus::Used;
            }
            Hito::ChangeQuestion => {
                if self.hito_11 != HitoStatus::Available {
                    return Err(format!("El hito de la pregunta {HITO_CHANGE_AT} no está disponible ({:?})", self.hito_11));
                }
                if !self.question_live() || self.active_comodin.is_some() {
                    return Err("Solo se puede cambiar una pregunta en juego y sin comodín activo".into());
                }
                // Reserva: preguntas del set por encima de las que se juegan.
                let replacement = self
                    .questions
                    .get(self.total_questions)
                    .cloned()
                    .ok_or("No hay preguntas de reserva en el set (añade más de las que se juegan)")?;
                self.load_question(replacement);
                self.hito_11 = HitoStatus::Used;
            }
        }
        Ok(())
    }

    /// Recalcula los campos derivados (`can_retire`). Se llama antes de emitir.
    pub fn refresh_flags(&mut self) {
        let in_game = matches!(
            self.phase,
            GamePhase::Idle | GamePhase::ReadingQuestion | GamePhase::Selecting | GamePhase::Answering
        );
        let has_game = !self.questions.is_empty() || self.current_question.is_some();
        self.can_retire = self.mode == GameMode::Millonario
            && self.rosco.is_none()
            && in_game
            && has_game
            && self.active_comodin.is_none();
    }

    /// Contabiliza un acierto en Millonario: nivel asegurado e hitos.
    pub(crate) fn register_correct_answer(&mut self) {
        self.correct_answers += 1;
        self.safety_net = safety_net_for(self.correct_answers);
        if self.correct_answers == HITO_RECOVER_AT && self.hito_8 == HitoStatus::Locked {
            self.hito_8 = HitoStatus::Available;
        }
        if self.correct_answers == HITO_CHANGE_AT && self.hito_11 == HitoStatus::Locked {
            self.hito_11 = HitoStatus::Available;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::TickOutcome;
    use crate::schemas::{Difficulty, Question};

    fn q(n: usize) -> Question {
        Question {
            id: format!("q{n}"),
            mode: GameMode::Millonario,
            category: "Test".into(),
            difficulty: Difficulty::Easy,
            question: format!("Pregunta {n}"),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct: n % 4,
            meta: None,
        }
    }

    /// Set de 15 preguntas + `reserve` de reserva.
    fn game(reserve: usize) -> GameState {
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.init_with_questions((0..15 + reserve).map(q).collect());
        s.refresh_flags();
        s
    }

    /// Acierta la pregunta actual y pasa a la siguiente (cargándola).
    fn win_round(s: &mut GameState) {
        let correct = s.current_question.as_ref().unwrap().correct;
        assert!(s.submit_answer(correct));
        assert!(s.next_round());
        s.load_next_question().unwrap();
    }

    #[test]
    fn phrase_is_case_and_space_insensitive() {
        for ok in ["me cago", "ME CAGO", "  Me   Cago ", "mecago", "me\tcago"] {
            assert!(is_retire_phrase(ok), "{ok:?}");
        }
        for bad in ["me rindo", "me cagó", "me cago ya", ""] {
            assert!(!is_retire_phrase(bad), "{bad:?}");
        }
    }

    #[test]
    fn use_and_resolve_comodin() {
        let mut s = game(0);
        assert!(s.use_comodin(Comodin::Chat).is_err(), "sin pregunta en juego");
        s.load_next_question().unwrap();
        s.use_comodin(Comodin::Chat).unwrap();
        assert_eq!(s.comodines[Comodin::Chat], ComodinStatus::Active);
        assert_eq!((s.active_comodin, s.comodin_time_remaining), (Some(Comodin::Chat), Some(30)));
        assert!(s.use_comodin(Comodin::Llamada).is_err(), "solo uno a la vez");
        assert!(!s.submit_answer(0), "no se responde con comodín activo");

        // Cancelar: vuelve a estar disponible.
        assert_eq!(s.resolve_comodin(false).unwrap(), Comodin::Chat);
        assert_eq!(s.comodines[Comodin::Chat], ComodinStatus::Available);
        assert_eq!(s.comodin_time_remaining, None);

        // Usar de verdad: queda gastado y no se puede repetir.
        s.use_comodin(Comodin::Chat).unwrap();
        s.resolve_comodin(true).unwrap();
        assert_eq!(s.comodines[Comodin::Chat], ComodinStatus::Used);
        assert!(s.use_comodin(Comodin::Chat).is_err());
        assert!(s.resolve_comodin(true).is_err(), "nada que cerrar");
    }

    #[test]
    fn comodin_timer_freezes_question_timer_and_expires() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        s.tick(5_000);
        assert_eq!(s.time_remaining, 25);
        s.use_comodin(Comodin::Llamada).unwrap();
        assert_eq!(s.tick(10_000), TickOutcome::SecondElapsed);
        assert_eq!((s.time_remaining, s.comodin_time_remaining), (25, Some(35)), "el de la pregunta no baja");
        assert_eq!(s.tick(35_000), TickOutcome::ComodinTimeUp);
        assert_eq!(s.comodin_time_remaining, Some(0));
        assert_eq!(s.phase, GamePhase::ReadingQuestion, "agotar el comodín no acaba la partida");
        assert_eq!(s.tick(5_000), TickOutcome::Unchanged, "espera a que el presentador lo cierre");
        s.resolve_comodin(true).unwrap();
        s.tick(1_000);
        assert_eq!(s.time_remaining, 24, "el reloj de la pregunta sigue donde estaba");
    }

    #[test]
    fn ruleta_has_no_timer() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        s.use_comodin(Comodin::Ruleta).unwrap();
        assert_eq!(s.comodin_time_remaining, None);
        assert_eq!(s.tick(60_000), TickOutcome::Unchanged);
        assert_eq!(s.time_remaining, 30);
    }

    #[test]
    fn retire_keeps_all_correct_answers() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        for _ in 0..5 {
            win_round(&mut s);
        }
        assert_eq!((s.correct_answers, s.safety_net), (5, 5));
        win_round(&mut s);
        s.refresh_flags();
        assert!(s.can_retire);
        assert!(s.retire("me rindo").is_err());
        assert_eq!(s.phase, GamePhase::ReadingQuestion, "frase mala no cambia nada");
        s.retire("  ME CAGO ").unwrap();
        assert_eq!((s.phase, s.prize_level), (GamePhase::Retired, Some(6)), "6 aciertos, no los 5 asegurados");
        s.refresh_flags();
        assert!(!s.can_retire);
        assert!(s.retire("me cago").is_err(), "no se planta dos veces");
    }

    #[test]
    fn cannot_retire_with_active_comodin_or_after_game_over() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        s.use_comodin(Comodin::Sacrificio).unwrap();
        s.refresh_flags();
        assert!(s.retire("me cago").is_err());
        s.resolve_comodin(true).unwrap();
        let wrong = (s.current_question.as_ref().unwrap().correct + 1) % 4;
        s.submit_answer(wrong);
        s.refresh_flags();
        assert_eq!(s.prize_level, Some(0), "fallo antes de la 5: sin premio asegurado");
        assert!(s.retire("me cago").is_err());
    }

    #[test]
    fn hito_8_recovers_a_used_comodin_once() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        s.use_comodin(Comodin::Chat).unwrap();
        s.resolve_comodin(true).unwrap();
        for _ in 0..7 {
            win_round(&mut s);
        }
        assert_eq!(s.hito_8, HitoStatus::Locked);
        assert!(s.use_hito(Hito::Recover, None).is_err());
        win_round(&mut s); // 8.º acierto
        assert_eq!(s.hito_8, HitoStatus::Available);
        assert!(s.use_hito(Hito::Recover, Some(Comodin::Llamada)).is_err(), "la llamada no está gastada");
        s.use_hito(Hito::Recover, None).unwrap();
        assert_eq!((s.comodines[Comodin::Chat], s.hito_8), (ComodinStatus::Available, HitoStatus::Used));
        assert!(s.use_hito(Hito::Recover, None).is_err(), "solo una vez");
    }

    #[test]
    fn hito_11_changes_question_from_reserve() {
        let mut s = game(2);
        assert_eq!(s.total_questions, 15, "las de reserva no se juegan");
        s.load_next_question().unwrap();
        for _ in 0..11 {
            win_round(&mut s);
        }
        assert_eq!((s.hito_11, s.current_question_index), (HitoStatus::Available, 11));
        s.tick(10_000);
        s.use_hito(Hito::ChangeQuestion, None).unwrap();
        let current = s.current_question.as_ref().unwrap();
        assert_eq!(current.id, "q15", "primera de reserva");
        assert_eq!((s.time_remaining, s.hito_11), (30, HitoStatus::Used), "reloj reiniciado");
        assert!(s.use_hito(Hito::ChangeQuestion, None).is_err());
        // La partida sigue normal: el índice no cambia.
        win_round(&mut s);
        assert_eq!(s.current_question.as_ref().unwrap().id, "q12");
    }

    #[test]
    fn hito_11_without_reserve_fails_cleanly() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        for _ in 0..11 {
            win_round(&mut s);
        }
        let before = s.current_question.clone();
        assert!(s.use_hito(Hito::ChangeQuestion, None).unwrap_err().contains("reserva"));
        assert_eq!(s.current_question, before);
        assert_eq!(s.hito_11, HitoStatus::Available, "no se gasta si falla");
    }

    #[test]
    fn game_over_falls_back_to_safety_net_and_win_pays_all() {
        let mut s = game(0);
        s.load_next_question().unwrap();
        for _ in 0..10 {
            win_round(&mut s);
        }
        let wrong = (s.current_question.as_ref().unwrap().correct + 1) % 4;
        s.submit_answer(wrong);
        assert_eq!((s.phase, s.prize_level), (GamePhase::GameOver, Some(10)));

        let mut s = game(0);
        s.load_next_question().unwrap();
        for _ in 0..14 {
            win_round(&mut s);
        }
        let correct = s.current_question.as_ref().unwrap().correct;
        s.submit_answer(correct);
        assert_eq!((s.phase, s.prize_level), (GamePhase::Won, Some(15)));
    }

    #[test]
    fn rosco_rejects_comodines() {
        let mut s = GameState::new(GameMode::Rosco, 27);
        s.init_rosco(crate::game::rosco::tests::rosco_questions(), None, None).unwrap();
        s.load_next_question().unwrap();
        assert!(s.use_comodin(Comodin::Chat).is_err());
        assert!(s.retire("me cago").is_err());
    }
}
