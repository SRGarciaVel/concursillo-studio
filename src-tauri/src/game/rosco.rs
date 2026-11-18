//! Motor del Rosco (Pasapalabra): 27 letras (A–Z + Ñ) en círculo.
//!
//! El rosco solo sabe de letras y estados; las fases, el reloj y los sonidos
//! los gestiona `GameState` / el servidor, igual que en Millonario.

use serde::Serialize;
use ts_rs::TS;

use crate::schemas::{GameMode, Question};

/// Orden del rosco: alfabeto español con la Ñ tras la N.
pub const ROSCO_ALPHABET: [char; 27] = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'Ñ', 'O', 'P', 'Q',
    'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

/// Tiempo total del rosco por defecto (segundos). En el rosco el reloj es global.
pub const DEFAULT_ROSCO_TIME: u32 = 150;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum LetterStatus {
    Pending,
    Passed,
    Correct,
    Wrong,
}

impl LetterStatus {
    /// Pendiente de jugar (nunca contestada, o pasada).
    pub fn is_open(self) -> bool {
        matches!(self, LetterStatus::Pending | LetterStatus::Passed)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct RoscoLetter {
    pub letter: char,
    /// La pregunta completa vive solo en Rust: al stage no se le mandan las
    /// respuestas de las 27 letras. La de la letra en juego va en
    /// `GameState.current_question`.
    #[serde(skip)]
    #[ts(skip)]
    pub question: Question,
    /// `true`: la respuesta empieza por la letra; `false`: la contiene.
    pub starts_with: bool,
    pub status: LetterStatus,
}

#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct RoscoState {
    pub letters: Vec<RoscoLetter>,
    pub current_index: usize,
    pub total_correct: usize,
    pub total_wrong: usize,
    /// Letras que ahora mismo están en estado `Passed` (pendientes de 2.ª vuelta).
    pub total_passed: usize,
    /// Aciertos necesarios para ganar al resolver todas las letras.
    pub min_correct: usize,
}

/// Qué ha pasado tras una acción del presentador.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoscoOutcome {
    Correct,
    Wrong,
    Passed,
    /// Todas las letras resueltas. `true` si se alcanzó `min_correct`.
    Finished { won: bool },
}

/// Letra normalizada de una pregunta (`meta.rosco_letter`), si es válida.
fn letter_of(q: &Question) -> Option<char> {
    let raw = q.meta.as_ref()?.rosco_letter.as_deref()?.trim();
    let mut chars = raw.chars();
    let c = chars.next()?;
    if chars.next().is_some() {
        return None;
    }
    let upper = c.to_uppercase().next()?;
    ROSCO_ALPHABET.contains(&upper).then_some(upper)
}

/// Un set de rosco: 27 preguntas de modo Rosco, una por letra, sin repetir.
pub fn validate_rosco_questions(questions: &[Question]) -> Result<(), String> {
    if questions.len() != ROSCO_ALPHABET.len() {
        return Err(format!(
            "Un rosco necesita {} preguntas (A–Z + Ñ), hay {}",
            ROSCO_ALPHABET.len(),
            questions.len()
        ));
    }
    let mut seen = Vec::with_capacity(ROSCO_ALPHABET.len());
    for (i, q) in questions.iter().enumerate() {
        if q.mode != GameMode::Rosco {
            return Err(format!("Pregunta {} («{}») no es de modo Rosco", i + 1, q.question));
        }
        let letter = letter_of(q).ok_or_else(|| {
            format!("Pregunta {} («{}»): falta la letra del rosco o no es válida", i + 1, q.question)
        })?;
        if seen.contains(&letter) {
            return Err(format!("La letra {letter} está repetida"));
        }
        seen.push(letter);
    }
    // 27 letras distintas y todas del alfabeto => están todas.
    Ok(())
}

impl RoscoState {
    pub fn new(questions: Vec<Question>, min_correct: Option<usize>) -> Result<Self, String> {
        validate_rosco_questions(&questions)?;
        let mut letters: Vec<RoscoLetter> = questions
            .into_iter()
            .map(|q| RoscoLetter {
                letter: letter_of(&q).expect("validado"),
                starts_with: q.meta.as_ref().and_then(|m| m.rosco_starts_with).unwrap_or(true),
                question: q,
                status: LetterStatus::Pending,
            })
            .collect();
        let pos = |c: char| ROSCO_ALPHABET.iter().position(|&a| a == c).unwrap();
        letters.sort_by_key(|l| pos(l.letter));

        let total = letters.len();
        let min_correct = min_correct.unwrap_or(total);
        if min_correct == 0 || min_correct > total {
            return Err(format!("min_correct debe estar entre 1 y {total}"));
        }
        Ok(Self {
            letters,
            current_index: 0,
            total_correct: 0,
            total_wrong: 0,
            total_passed: 0,
            min_correct,
        })
    }

    pub fn current(&self) -> &RoscoLetter {
        &self.letters[self.current_index]
    }

    pub fn is_finished(&self) -> bool {
        self.letters.iter().all(|l| !l.status.is_open())
    }

    pub fn won(&self) -> bool {
        self.total_correct >= self.min_correct
    }

    /// El presentador marca la letra actual como acertada o fallada.
    pub fn answer(&mut self, is_correct: bool) -> RoscoOutcome {
        let status = if is_correct { LetterStatus::Correct } else { LetterStatus::Wrong };
        self.set_current_status(status);
        if is_correct {
            self.total_correct += 1;
        } else {
            self.total_wrong += 1;
        }
        self.advance_or_finish(if is_correct { RoscoOutcome::Correct } else { RoscoOutcome::Wrong })
    }

    /// "Pasapalabra": la letra queda `Passed` y se pasa a la siguiente abierta.
    pub fn pass(&mut self) -> RoscoOutcome {
        self.set_current_status(LetterStatus::Passed);
        self.advance_or_finish(RoscoOutcome::Passed)
    }

    /// Vuelve a dejar todas las letras pendientes.
    pub fn reset(&mut self) {
        for l in &mut self.letters {
            l.status = LetterStatus::Pending;
        }
        self.current_index = 0;
        self.total_correct = 0;
        self.total_wrong = 0;
        self.total_passed = 0;
    }

    fn set_current_status(&mut self, status: LetterStatus) {
        let letter = &mut self.letters[self.current_index];
        if letter.status == LetterStatus::Passed {
            self.total_passed -= 1;
        }
        if status == LetterStatus::Passed {
            self.total_passed += 1;
        }
        letter.status = status;
    }

    fn advance_or_finish(&mut self, outcome: RoscoOutcome) -> RoscoOutcome {
        if self.is_finished() {
            return RoscoOutcome::Finished { won: self.won() };
        }
        // Siguiente letra abierta (circular), saltando las ya resueltas. Si la
        // única abierta es la actual (p. ej. se pasa la última), se queda en ella.
        let len = self.letters.len();
        self.current_index = (1..=len)
            .map(|step| (self.current_index + step) % len)
            .find(|&i| self.letters[i].status.is_open())
            .expect("hay al menos una letra abierta");
        outcome
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::schemas::{Difficulty, QuestionMeta};

    /// 27 preguntas válidas, desordenadas a propósito.
    pub fn rosco_questions() -> Vec<Question> {
        let mut qs: Vec<Question> = ROSCO_ALPHABET
            .iter()
            .map(|&c| Question {
                id: format!("r-{c}"),
                mode: GameMode::Rosco,
                category: "Test".into(),
                difficulty: Difficulty::Easy,
                question: format!("Pregunta {c}"),
                answers: vec![format!("{c}respuesta")],
                correct: 0,
                meta: Some(QuestionMeta {
                    rosco_letter: Some(c.to_lowercase().to_string()),
                    rosco_starts_with: Some(c != 'X'),
                }),
            })
            .collect();
        qs.reverse();
        qs
    }

    fn statuses(r: &RoscoState) -> String {
        r.letters
            .iter()
            .map(|l| match l.status {
                LetterStatus::Pending => '.',
                LetterStatus::Passed => 'p',
                LetterStatus::Correct => 'c',
                LetterStatus::Wrong => 'w',
            })
            .collect()
    }

    #[test]
    fn builds_in_alphabet_order() {
        let r = RoscoState::new(rosco_questions(), None).unwrap();
        let order: String = r.letters.iter().map(|l| l.letter).collect();
        assert_eq!(order, "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ");
        assert_eq!(r.min_correct, 27);
        assert_eq!(r.letters[24].letter, 'X', "la Ñ desplaza una posición");
        assert!(!r.letters[24].starts_with, "X: contiene");
    }

    #[test]
    fn validation_rejects_bad_sets() {
        let mut qs = rosco_questions();
        qs.pop();
        assert!(validate_rosco_questions(&qs).unwrap_err().contains("27"));

        let mut qs = rosco_questions();
        qs[0].meta.as_mut().unwrap().rosco_letter = Some("A".into());
        qs[1].meta.as_mut().unwrap().rosco_letter = Some("A".into());
        assert!(validate_rosco_questions(&qs).unwrap_err().contains("repetida"));

        let mut qs = rosco_questions();
        qs[3].meta = None;
        assert!(validate_rosco_questions(&qs).is_err());

        let mut qs = rosco_questions();
        qs[3].meta.as_mut().unwrap().rosco_letter = Some("AB".into());
        assert!(validate_rosco_questions(&qs).is_err());

        let mut qs = rosco_questions();
        qs[3].mode = GameMode::Millonario;
        assert!(validate_rosco_questions(&qs).is_err());

        assert!(RoscoState::new(rosco_questions(), Some(0)).is_err());
        assert!(RoscoState::new(rosco_questions(), Some(28)).is_err());
    }

    #[test]
    fn answer_and_pass_advance() {
        let mut r = RoscoState::new(rosco_questions(), None).unwrap();
        assert_eq!(r.answer(true), RoscoOutcome::Correct);
        assert_eq!(r.pass(), RoscoOutcome::Passed);
        assert_eq!(r.answer(false), RoscoOutcome::Wrong);
        assert_eq!(r.current().letter, 'D');
        assert_eq!(&statuses(&r)[..4], "cpw.");
        assert_eq!((r.total_correct, r.total_wrong, r.total_passed), (1, 1, 1));
    }

    #[test]
    fn skips_resolved_letters_on_second_round() {
        let mut r = RoscoState::new(rosco_questions(), None).unwrap();
        // 1.ª vuelta: A acierto, B pasa, C fallo, D pasa, resto acierto.
        r.answer(true);
        r.pass();
        r.answer(false);
        r.pass();
        for _ in 4..27 {
            r.answer(true);
        }
        // Vuelve a B saltando A (correcta); luego salta C (fallada) hasta D.
        assert_eq!(r.current().letter, 'B');
        assert_eq!(r.answer(true), RoscoOutcome::Correct);
        assert_eq!(r.current().letter, 'D');
        assert_eq!(r.total_passed, 1);
    }

    #[test]
    fn passing_the_last_open_letter_stays_on_it() {
        let mut r = RoscoState::new(rosco_questions(), None).unwrap();
        for _ in 0..26 {
            r.answer(true);
        }
        assert_eq!(r.current().letter, 'Z');
        assert_eq!(r.pass(), RoscoOutcome::Passed);
        assert_eq!(r.current().letter, 'Z');
        assert_eq!(r.pass(), RoscoOutcome::Passed);
        assert_eq!(r.total_passed, 1);
    }

    #[test]
    fn finishes_and_evaluates_threshold() {
        let mut r = RoscoState::new(rosco_questions(), Some(25)).unwrap();
        r.answer(false);
        r.answer(false);
        for _ in 0..24 {
            assert!(!matches!(r.answer(true), RoscoOutcome::Finished { .. }));
        }
        assert_eq!(r.answer(true), RoscoOutcome::Finished { won: true });
        assert!(r.is_finished());

        let mut r = RoscoState::new(rosco_questions(), None).unwrap();
        r.answer(false);
        let mut last = RoscoOutcome::Correct;
        for _ in 0..26 {
            last = r.answer(true);
        }
        assert_eq!(last, RoscoOutcome::Finished { won: false }, "por defecto hay que acertar las 27");
    }

    #[test]
    fn serializes_without_answers() {
        let r = RoscoState::new(rosco_questions(), None).unwrap();
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains("respuesta"));
        assert!(json.contains(r#""letter":"Ñ""#));
    }
}
