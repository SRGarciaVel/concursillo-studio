//! Persistencia de sets de preguntas en `data/questions/*.json`.

use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{
    game::rosco::validate_rosco_questions,
    schemas::{GameMode, Question},
};

/// Carpeta donde viven los sets. Se registra como estado gestionado de Tauri.
pub struct QuestionsDir(pub PathBuf);

/// Carpeta raíz de datos (`questions/`, `sounds/`, ...).
/// En desarrollo: `<repo>/data`. En release: el `app_data_dir` de Tauri.
pub fn data_dir(app_data_dir: Option<PathBuf>) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../data")
    } else {
        app_data_dir.unwrap_or_else(|| PathBuf::from("data"))
    }
}

/// Ruta segura `<dir>/<name>.json`. Acepta `mi_set` o `mi_set.json`;
/// solo letras, números, `_` y `-` (evita path traversal).
pub(crate) fn json_path(dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let name = file_name.trim();
    let name = name.strip_suffix(".json").unwrap_or(name);
    if name.is_empty() {
        return Err("El nombre del archivo está vacío".into());
    }
    if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
        return Err(format!("Nombre inválido «{name}»: usa solo letras, números, _ y -"));
    }
    Ok(dir.join(format!("{name}.json")))
}

/// Nombres (sin `.json`) de los JSON de una carpeta, ordenados. Crea la carpeta si falta.
pub(crate) fn list_json_stems(dir: &Path) -> Result<Vec<String>, String> {
    fs::create_dir_all(dir).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
    let mut names: Vec<String> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            (path.extension()? == "json")
                .then(|| path.file_stem()?.to_str().map(str::to_owned))
                .flatten()
        })
        .collect();
    names.sort();
    Ok(names)
}

/// Copia los datos de ejemplo incluidos en el instalador (`resources/data`)
/// a la carpeta de datos del usuario. Nunca sobrescribe: solo añade lo que falta,
/// así los sets/presets/sonidos que edite el streamer no se pisan al actualizar.
pub fn seed_data(from: &Path, to: &Path) -> std::io::Result<usize> {
    let mut copied = 0;
    if !from.is_dir() {
        return Ok(0);
    }
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            fs::create_dir_all(&target)?;
            copied += seed_data(&entry.path(), &target)?;
        } else if !target.exists() {
            fs::create_dir_all(to)?;
            fs::copy(entry.path(), &target)?;
            copied += 1;
        }
    }
    Ok(copied)
}

impl QuestionsDir {
    pub fn resolve(data_dir: &Path) -> Self {
        Self(data_dir.join("questions"))
    }

    fn path_for(&self, file_name: &str) -> Result<PathBuf, String> {
        json_path(&self.0, file_name)
    }

    pub fn save(&self, file_name: &str, questions: &[Question]) -> Result<(), String> {
        validate_questions(questions)?;
        let path = self.path_for(file_name)?;
        fs::create_dir_all(&self.0).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
        let json = serde_json::to_string_pretty(questions).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("No se pudo escribir {}: {e}", path.display()))
    }

    pub fn load(&self, file_name: &str) -> Result<Vec<Question>, String> {
        let path = self.path_for(file_name)?;
        let json = fs::read_to_string(&path)
            .map_err(|e| format!("No se pudo leer {}: {e}", path.display()))?;
        serde_json::from_str(&json).map_err(|e| format!("JSON inválido en {}: {e}", path.display()))
    }

    /// Nombres (sin `.json`) de los sets existentes, ordenados.
    pub fn list(&self) -> Result<Vec<String>, String> {
        list_json_stems(&self.0)
    }
}

/// Reglas mínimas que debe cumplir un set para poder jugarse.
pub fn validate_questions(questions: &[Question]) -> Result<(), String> {
    if questions.is_empty() {
        return Err("El set no tiene preguntas".into());
    }
    // Un set es de un solo modo; si contiene preguntas de Rosco, es un rosco.
    if questions.iter().any(|q| q.mode == GameMode::Rosco) {
        validate_rosco_questions(questions)?;
    }
    for (i, q) in questions.iter().enumerate() {
        if q.correct >= q.answers.len() {
            return Err(format!(
                "Pregunta {} («{}»): la respuesta correcta ({}) está fuera de rango",
                i + 1,
                q.question,
                q.correct
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_questions_set(
    dir: tauri::State<'_, QuestionsDir>,
    file_name: String,
    questions: Vec<Question>,
) -> Result<(), String> {
    dir.save(&file_name, &questions)
}

#[tauri::command]
pub fn load_questions_set(
    dir: tauri::State<'_, QuestionsDir>,
    file_name: String,
) -> Result<Vec<Question>, String> {
    dir.load(&file_name)
}

#[tauri::command]
pub fn list_questions_sets(dir: tauri::State<'_, QuestionsDir>) -> Result<Vec<String>, String> {
    dir.list()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::schemas::Difficulty;

    fn tmp_dir(name: &str) -> QuestionsDir {
        let dir = std::env::temp_dir().join(format!("concursillo-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        QuestionsDir(dir)
    }

    fn q(text: &str, correct: usize) -> Question {
        Question {
            id: text.into(),
            mode: GameMode::Millonario,
            category: "Test".into(),
            difficulty: Difficulty::Easy,
            question: text.into(),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct,
            meta: None,
        }
    }

    #[test]
    fn save_list_load_roundtrip() {
        let dir = tmp_dir("roundtrip");
        let set = vec![q("uno", 0), q("dos", 3)];
        dir.save("mi_set", &set).unwrap();
        assert_eq!(dir.list().unwrap(), vec!["mi_set"]);
        assert_eq!(dir.load("mi_set.json").unwrap(), set);
        let _ = fs::remove_dir_all(&dir.0);
    }

    #[test]
    fn seed_copies_missing_files_without_overwriting() {
        let base = std::env::temp_dir().join(format!("concursillo-seed-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (from, to) = (base.join("from"), base.join("to"));
        fs::create_dir_all(from.join("questions")).unwrap();
        fs::write(from.join("questions/a.json"), "nuevo").unwrap();
        fs::write(from.join("questions/b.json"), "nuevo").unwrap();
        fs::create_dir_all(to.join("questions")).unwrap();
        fs::write(to.join("questions/a.json"), "del usuario").unwrap();

        assert_eq!(seed_data(&from, &to).unwrap(), 1);
        assert_eq!(fs::read_to_string(to.join("questions/a.json")).unwrap(), "del usuario");
        assert_eq!(fs::read_to_string(to.join("questions/b.json")).unwrap(), "nuevo");
        assert_eq!(seed_data(&from, &to).unwrap(), 0, "idempotente");
        assert_eq!(seed_data(&base.join("no-existe"), &to).unwrap(), 0);
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rejects_bad_names_and_sets() {
        let dir = tmp_dir("bad");
        assert!(dir.save("../fuera", &[q("x", 0)]).is_err());
        assert!(dir.save("con espacio", &[q("x", 0)]).is_err());
        assert!(dir.save("vacio", &[]).is_err());
        assert!(dir.save("rango", &[q("x", 9)]).is_err());
    }
}
