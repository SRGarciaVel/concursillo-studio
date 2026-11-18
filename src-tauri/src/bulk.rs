//! Importador masivo de preguntas desde texto (TXT/CSV pegado en el editor).
//!
//! Una pregunta por línea. Separador: `|` (recomendado), tabulador o `;`
//! (se detecta en cada línea, en ese orden). Las líneas vacías y las que
//! empiezan por `#` se ignoran (comentarios).
//!
//! Millonario:
//!   `Pregunta | Correcta | Opción 2 | Opción 3 | Opción 4 | Categoría | Dificultad`
//!   - La correcta va siempre en la 2.ª columna; al importar se coloca en una
//!     posición aleatoria (si no, siempre sería la A).
//!   - Mínimo 1 opción incorrecta (2 respuestas), máximo 3 (4 respuestas).
//!     Una columna de opción vacía se omite.
//!   - Categoría y dificultad son opcionales (`General`, `Easy`).
//!
//! Rosco:
//!   `Letra | Definición | Respuesta | Categoría | Dificultad | empieza/contiene`
//!   - La última columna es opcional (por defecto `empieza`).
//!   - Se comprueba que la respuesta empiece por / contenga la letra.

use crate::{
    game::rosco::ROSCO_ALPHABET,
    schemas::{Difficulty, GameMode, Question, QuestionMeta},
};

/// Máximo de errores que se listan (el resto se resume).
const MAX_REPORTED_ERRORS: usize = 15;
/// Para no bloquear el editor con un pegado gigante.
pub const MAX_LINES: usize = 2000;

pub const MILLONARIO_TEMPLATE: &str = "\
# Formato Millonario (una pregunta por línea, separada por |):
# Pregunta | Respuesta correcta | Opción 2 | Opción 3 | Opción 4 | Categoría | Dificultad
# La correcta va SIEMPRE en la 2.ª columna: al importar se coloca en una posición al azar.
# Dificultad: Fácil, Media o Difícil (también Easy/Medium/Hard). Categoría y dificultad son opcionales.
¿Cuál es la capital de Francia? | París | Londres | Roma | Berlín | Geografía | Fácil
¿Cuántos lados tiene un hexágono? | 6 | 5 | 7 | 8 | Matemáticas | Fácil
¿Quién escribió «Don Quijote»? | Miguel de Cervantes | Lope de Vega | Quevedo | Góngora | Literatura | Media
";

pub const ROSCO_TEMPLATE: &str = "\
# Formato Rosco (una letra por línea, separada por |):
# Letra | Definición | Respuesta | Categoría | Dificultad | empieza o contiene
# La última columna es opcional (por defecto: empieza).
A | Capital de Grecia | Atenas | Geografía | Fácil
B | Capital de Alemania | Berlín | Geografía | Fácil
Ñ | Elevación natural del terreno, mayor que una colina | Montaña | Geografía | Fácil | contiene
";

/// Parte una línea en columnas con el primer separador que aparezca: `|`, tab, `;`.
fn split_fields(line: &str) -> Vec<String> {
    let sep = ['|', '\t', ';'].into_iter().find(|&c| line.contains(c));
    match sep {
        Some(sep) => line.split(sep).map(|f| f.trim().to_string()).collect(),
        None => vec![line.trim().to_string()],
    }
}

fn parse_difficulty(raw: &str) -> Result<Difficulty, String> {
    match fold(raw).as_str() {
        "" | "easy" | "facil" | "f" => Ok(Difficulty::Easy),
        "medium" | "media" | "medio" | "normal" | "m" => Ok(Difficulty::Medium),
        "hard" | "dificil" | "d" => Ok(Difficulty::Hard),
        _ => Err(format!("dificultad «{raw}» no reconocida (usa Fácil, Media o Difícil)")),
    }
}

/// Minúsculas y sin tildes (la ñ se conserva).
fn fold(s: &str) -> String {
    s.trim()
        .to_lowercase()
        .chars()
        .map(|c| match c {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            other => other,
        })
        .collect()
}

fn category(raw: Option<&String>) -> String {
    match raw.map(|s| s.trim()) {
        Some(c) if !c.is_empty() => c.to_string(),
        _ => "General".to_string(),
    }
}

/// Posición pseudoaleatoria 0..n a partir de un UUID v4 (sin depender de `rand`).
fn random_index(n: usize) -> usize {
    let bytes = uuid::Uuid::new_v4().into_bytes();
    (u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize) % n
}

fn parse_millonario(f: &[String]) -> Result<Question, String> {
    if f.len() < 3 {
        return Err("faltan columnas: «Pregunta | Correcta | Opción 2 …»".into());
    }
    if f.len() > 7 {
        return Err(format!("demasiadas columnas ({}); el máximo es 7", f.len()));
    }
    let question = &f[0];
    let correct = &f[1];
    if question.is_empty() {
        return Err("la pregunta está vacía".into());
    }
    if correct.is_empty() {
        return Err("falta la respuesta correcta".into());
    }
    // Columnas 3–5: opciones incorrectas (las vacías se omiten). Si hay menos
    // de 7 columnas, ¿dónde acaban las opciones? Solo cuentan como opciones las
    // columnas 3–5; categoría y dificultad son siempre la 6.ª y 7.ª.
    let wrong: Vec<&String> = f.iter().skip(2).take(3).filter(|o| !o.is_empty()).collect();
    if wrong.is_empty() {
        return Err("hace falta al menos una opción incorrecta".into());
    }
    let mut answers: Vec<String> = wrong.iter().map(|s| s.to_string()).collect();
    let mut seen = vec![fold(correct)];
    for a in &answers {
        let k = fold(a);
        if seen.contains(&k) {
            return Err(format!("respuesta repetida «{a}»"));
        }
        seen.push(k);
    }
    let pos = random_index(answers.len() + 1);
    answers.insert(pos, correct.clone());
    Ok(Question {
        id: uuid::Uuid::new_v4().to_string(),
        mode: GameMode::Millonario,
        category: category(f.get(5)),
        difficulty: parse_difficulty(f.get(6).map_or("", |s| s))?,
        question: question.clone(),
        answers,
        correct: pos,
        meta: None,
    })
}

fn parse_rosco(f: &[String]) -> Result<Question, String> {
    if f.len() < 3 {
        return Err("faltan columnas: «Letra | Definición | Respuesta …»".into());
    }
    if f.len() > 6 {
        return Err(format!("demasiadas columnas ({}); el máximo es 6", f.len()));
    }
    let letter = f[0].trim().to_uppercase();
    if !ROSCO_ALPHABET.iter().any(|c| c.to_string() == letter) {
        return Err(format!("«{}» no es una letra del rosco (A–Z o Ñ)", f[0]));
    }
    let (definition, answer) = (&f[1], &f[2]);
    if definition.is_empty() {
        return Err("la definición está vacía".into());
    }
    if answer.is_empty() {
        return Err("falta la respuesta".into());
    }
    let starts_with = match f.get(5).map(|s| fold(s)).as_deref() {
        None | Some("") | Some("empieza") | Some("e") | Some("empieza por") => true,
        Some("contiene") | Some("c") => false,
        Some(other) => return Err(format!("«{other}»: la última columna debe ser «empieza» o «contiene»")),
    };
    // Comprobar que la respuesta cuadra con la letra (sin tildes).
    let (l, a) = (fold(&letter), fold(answer));
    if starts_with && !a.starts_with(&l) {
        return Err(format!("«{answer}» no empieza por {letter} (¿querías «contiene»?)"));
    }
    if !starts_with && !a.contains(&l) {
        return Err(format!("«{answer}» no contiene la {letter}"));
    }
    Ok(Question {
        id: uuid::Uuid::new_v4().to_string(),
        mode: GameMode::Rosco,
        category: category(f.get(3)),
        difficulty: parse_difficulty(f.get(4).map_or("", |s| s))?,
        question: definition.clone(),
        answers: vec![answer.clone()],
        correct: 0,
        meta: Some(QuestionMeta { rosco_letter: Some(letter), rosco_starts_with: Some(starts_with) }),
    })
}

/// Parsea el texto completo. Si alguna línea falla, devuelve TODOS los errores
/// (con su número de línea) y ninguna pregunta: o entra todo, o nada.
pub fn parse_bulk(text: &str, mode: GameMode) -> Result<Vec<Question>, String> {
    let text = text.trim_start_matches('\u{feff}');
    let lines: Vec<&str> = text.lines().collect();
    if lines.len() > MAX_LINES {
        return Err(format!("Demasiadas líneas ({}); el máximo es {MAX_LINES}", lines.len()));
    }
    let mut questions = Vec::new();
    let mut errors = Vec::new();
    for (i, raw) in lines.iter().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let fields = split_fields(line);
        let parsed = match mode {
            GameMode::Millonario => parse_millonario(&fields),
            GameMode::Rosco => parse_rosco(&fields),
        };
        match parsed {
            Ok(q) => questions.push(q),
            Err(e) => errors.push(format!("Línea {}: {e}", i + 1)),
        }
    }
    if !errors.is_empty() {
        let total = errors.len();
        errors.truncate(MAX_REPORTED_ERRORS);
        if total > MAX_REPORTED_ERRORS {
            errors.push(format!("… y {} errores más", total - MAX_REPORTED_ERRORS));
        }
        return Err(errors.join("\n"));
    }
    if questions.is_empty() {
        return Err("No hay ninguna pregunta en el texto (las líneas con # son comentarios)".into());
    }
    Ok(questions)
}

#[tauri::command]
pub fn parse_bulk_questions(text: String, mode: GameMode) -> Result<Vec<Question>, String> {
    parse_bulk(&text, mode)
}

#[tauri::command]
pub fn bulk_template(mode: GameMode) -> String {
    match mode {
        GameMode::Millonario => MILLONARIO_TEMPLATE,
        GameMode::Rosco => ROSCO_TEMPLATE,
    }
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn templates_parse_cleanly() {
        assert_eq!(parse_bulk(MILLONARIO_TEMPLATE, GameMode::Millonario).unwrap().len(), 3);
        assert_eq!(parse_bulk(ROSCO_TEMPLATE, GameMode::Rosco).unwrap().len(), 3);
    }

    #[test]
    fn millonario_line_full() {
        let q = &parse_bulk("¿2+2? | 4 | 3 | 5 | 22 | Mates | Difícil", GameMode::Millonario).unwrap()[0];
        assert_eq!(q.question, "¿2+2?");
        assert_eq!(q.answers.len(), 4);
        assert_eq!(q.answers[q.correct], "4", "la correcta sigue siendo la correcta");
        assert_eq!((q.category.as_str(), q.difficulty), ("Mates", Difficulty::Hard));
        assert_eq!(uuid::Uuid::parse_str(&q.id).unwrap().get_version_num(), 4);
    }

    #[test]
    fn millonario_defaults_and_fewer_options() {
        let q = &parse_bulk("¿Sí o no? | Sí | No", GameMode::Millonario).unwrap()[0];
        assert_eq!(q.answers.len(), 2);
        assert_eq!((q.category.as_str(), q.difficulty), ("General", Difficulty::Easy));
        // Opción vacía en medio: se omite, y categoría/dificultad siguen en su sitio.
        let q = &parse_bulk("P | A | B |  | D | Cat | media", GameMode::Millonario).unwrap()[0];
        assert_eq!((q.answers.len(), q.category.as_str(), q.difficulty), (3, "Cat", Difficulty::Medium));
    }

    #[test]
    fn correct_answer_position_is_shuffled() {
        let text = "P | ok | x | y | z\n".repeat(200);
        let qs = parse_bulk(&text, GameMode::Millonario).unwrap();
        let mut seen = [0; 4];
        for q in &qs {
            assert_eq!(q.answers[q.correct], "ok");
            seen[q.correct] += 1;
        }
        assert!(seen.iter().all(|&n| n > 20), "repartida entre A–D: {seen:?}");
        let ids: std::collections::HashSet<_> = qs.iter().map(|q| &q.id).collect();
        assert_eq!(ids.len(), 200, "ids únicos");
    }

    #[test]
    fn alternative_separators_bom_and_comments() {
        let text = "\u{feff}# comentario\n\n¿Tab?\tsí\tno\n¿Punto y coma?;sí;no;quizá\n   \n";
        let qs = parse_bulk(text, GameMode::Millonario).unwrap();
        assert_eq!(qs.len(), 2);
        assert_eq!(qs[1].answers.len(), 3);
    }

    #[test]
    fn reports_every_bad_line_with_its_number() {
        let text = "\
# cabecera
¿Bien? | sí | no
¿Sin opciones? | sí
 | vacía | x
¿Repetida? | Sí | sí
¿Dificultad? | a | b | c | d | Cat | imposible
¿Demasiadas? | a | b | c | d | e | f | g";
        let err = parse_bulk(text, GameMode::Millonario).unwrap_err();
        let lines: Vec<&str> = err.lines().collect();
        assert_eq!(lines.len(), 5, "{err}");
        assert!(lines[0].starts_with("Línea 3: faltan columnas"), "{}", lines[0]);
        assert!(lines[1].starts_with("Línea 4: la pregunta está vacía"));
        assert!(lines[2].starts_with("Línea 5: respuesta repetida"));
        assert!(lines[3].starts_with("Línea 6: dificultad «imposible»"));
        assert!(lines[4].starts_with("Línea 7: demasiadas columnas"));
    }

    #[test]
    fn needs_at_least_one_wrong_option() {
        let err = parse_bulk("¿Vacías? | sí |  |  | ", GameMode::Millonario).unwrap_err();
        assert_eq!(err, "Línea 1: hace falta al menos una opción incorrecta");
    }

    #[test]
    fn error_list_is_capped() {
        let err = parse_bulk(&"solo una columna\n".repeat(40), GameMode::Millonario).unwrap_err();
        assert_eq!(err.lines().count(), MAX_REPORTED_ERRORS + 1);
        assert!(err.ends_with("… y 25 errores más"));
    }

    #[test]
    fn empty_or_only_comments_is_an_error() {
        assert!(parse_bulk("", GameMode::Millonario).is_err());
        assert!(parse_bulk("# nada\n# más", GameMode::Rosco).is_err());
    }

    #[test]
    fn rosco_lines() {
        let qs = parse_bulk(
            "a | Capital de Grecia | Atenas\nÑ | Elevación | Montaña | Geo | Media | contiene\nE | Mamífero grande | Élefante",
            GameMode::Rosco,
        )
        .unwrap();
        let meta = |i: usize| qs[i].meta.clone().unwrap();
        assert_eq!((meta(0).rosco_letter.unwrap(), meta(0).rosco_starts_with), ("A".into(), Some(true)));
        assert_eq!(meta(1).rosco_starts_with, Some(false));
        assert_eq!((qs[1].answers.clone(), qs[1].correct), (vec!["Montaña".to_string()], 0));
        assert_eq!(qs[2].answers[0], "Élefante", "la tilde no impide 'empieza por E'");
    }

    #[test]
    fn rosco_checks_letter_against_answer() {
        let err = parse_bulk("B | Capital de Grecia | Atenas\n1 | x | y\nX | Gas | Oxígeno\nX | Gas | Oxígeno | | | quizá", GameMode::Rosco).unwrap_err();
        let lines: Vec<&str> = err.lines().collect();
        assert!(lines[0].contains("Línea 1") && lines[0].contains("no empieza por B"));
        assert!(lines[1].contains("Línea 2") && lines[1].contains("no es una letra"));
        assert!(lines[2].contains("Línea 3") && lines[2].contains("no empieza por X"), "Oxígeno contiene la X");
        assert!(lines[3].contains("Línea 4") && lines[3].contains("empieza» o «contiene"));
    }
}
