//! Presets maestros: toda la configuración de una partida en un JSON
//! (`data/presets/<id>.json`) que se arranca con un solo comando.
//!
//! El preset es la "fuente de verdad" para iniciar una partida:
//! `GameState::start_preset` valida TODO antes de tocar el estado y luego
//! aplica modo + preguntas + tiempo + tema en una sola operación. Los comandos
//! antiguos (`InitGame`, `InitRosco`) siguen funcionando como atajos.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    files::{json_path, list_json_stems, validate_questions},
    game::{is_valid_theme_id, GameState, MILLONARIO_MAX_QUESTIONS},
    game::rosco::ROSCO_ALPHABET,
    schemas::{GameMode, Question},
    twitch::normalize_channel,
};

/// Límites razonables para el tiempo (segundos).
pub const MILLONARIO_TIME_RANGE: (u32, u32) = (5, 300);
pub const ROSCO_TIME_RANGE: (u32, u32) = (30, 900);
const MAX_NAME_LEN: usize = 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct Preset {
    /// Identificador y nombre del archivo: `[a-zA-Z0-9_-]`.
    pub id: String,
    pub name: String,
    pub mode: GameMode,
    /// Copia de las preguntas: el preset no depende de que el set siga existiendo.
    pub questions: Vec<Question>,
    pub theme: String,
    /// Millonario: segundos por pregunta. Rosco: segundos totales.
    pub time_limit: u32,
    /// Solo Rosco: aciertos para ganar (por defecto, todas las letras).
    #[serde(default)]
    pub min_correct: Option<usize>,
    /// Canal al que conectarse (anónimo) al iniciar. El token nunca se guarda.
    #[serde(default)]
    pub twitch_channel: Option<String>,
}

/// Lo que necesita el desplegable (sin cargar todas las preguntas en el cliente).
#[derive(Debug, Clone, PartialEq, Serialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct PresetSummary {
    pub id: String,
    pub name: String,
    pub mode: GameMode,
    pub question_count: usize,
    pub theme: String,
    pub time_limit: u32,
    pub twitch_channel: Option<String>,
}

impl Preset {
    /// Valida y normaliza (recorta textos, canal en minúsculas, `min_correct`
    /// solo en Rosco). Devuelve un preset listo para usarse o el primer error.
    pub fn validated(&self) -> Result<Preset, String> {
        let mut p = self.clone();
        // Reutiliza la regla de nombres de archivo (sin path traversal).
        json_path(Path::new(""), &p.id).map_err(|e| format!("Id de preset: {e}"))?;
        p.id = p.id.trim().trim_end_matches(".json").to_string();
        p.name = p.name.trim().to_string();
        if p.name.is_empty() || p.name.chars().count() > MAX_NAME_LEN {
            return Err(format!("El nombre del preset debe tener entre 1 y {MAX_NAME_LEN} caracteres"));
        }
        if let Some(q) = p.questions.iter().find(|q| q.mode != p.mode) {
            return Err(format!("La pregunta «{}» es de modo {:?}, pero el preset es {:?}", q.question, q.mode, p.mode));
        }
        validate_questions(&p.questions)?; // incluye las reglas del rosco (27 letras)
        let (min, max) = match p.mode {
            GameMode::Millonario => MILLONARIO_TIME_RANGE,
            GameMode::Rosco => ROSCO_TIME_RANGE,
        };
        if !(min..=max).contains(&p.time_limit) {
            return Err(format!("El tiempo debe estar entre {min} y {max} segundos"));
        }
        if !is_valid_theme_id(&p.theme) {
            return Err(format!("Tema inválido «{}»", p.theme));
        }
        match p.mode {
            GameMode::Millonario => p.min_correct = None,
            GameMode::Rosco => {
                if let Some(n) = p.min_correct {
                    if n == 0 || n > ROSCO_ALPHABET.len() {
                        return Err(format!("Aciertos para ganar: entre 1 y {}", ROSCO_ALPHABET.len()));
                    }
                }
            }
        }
        p.twitch_channel = match p.twitch_channel.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(raw) => Some(normalize_channel(raw)?),
        };
        Ok(p)
    }

    pub fn summary(&self) -> PresetSummary {
        PresetSummary {
            id: self.id.clone(),
            name: self.name.clone(),
            mode: self.mode,
            question_count: match self.mode {
                GameMode::Millonario => self.questions.len().min(MILLONARIO_MAX_QUESTIONS),
                GameMode::Rosco => self.questions.len(),
            },
            theme: self.theme.clone(),
            time_limit: self.time_limit,
            twitch_channel: self.twitch_channel.clone(),
        }
    }
}

impl GameState {
    /// Punto de entrada único para empezar una partida configurada.
    /// Valida el preset entero antes de tocar nada: si algo falla, la partida
    /// actual sigue intacta. Conserva la conexión a Twitch (la gestiona el servidor).
    pub fn start_preset(&mut self, preset: &Preset) -> Result<Preset, String> {
        let p = preset.validated()?;
        match p.mode {
            GameMode::Millonario => {
                self.question_time = p.time_limit;
                self.init_with_questions(p.questions.clone());
            }
            GameMode::Rosco => self.init_rosco(p.questions.clone(), Some(p.time_limit), p.min_correct)?,
        }
        self.set_theme(&p.theme)?;
        Ok(p)
    }
}

// ───────────────────────────── Persistencia ─────────────────────────────

/// Carpeta de presets (`data/presets`). Estado gestionado de Tauri.
pub struct PresetsDir(pub PathBuf);

impl PresetsDir {
    pub fn resolve(data_dir: &Path) -> Self {
        Self(data_dir.join("presets"))
    }

    pub fn save(&self, preset: &Preset) -> Result<Preset, String> {
        let p = preset.validated()?;
        let path = json_path(&self.0, &p.id)?;
        fs::create_dir_all(&self.0).map_err(|e| format!("No se pudo crear la carpeta: {e}"))?;
        let json = serde_json::to_string_pretty(&p).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| format!("No se pudo escribir {}: {e}", path.display()))?;
        Ok(p)
    }

    pub fn load(&self, id: &str) -> Result<Preset, String> {
        let path = json_path(&self.0, id)?;
        let json = fs::read_to_string(&path).map_err(|e| format!("No se pudo leer {}: {e}", path.display()))?;
        serde_json::from_str(&json).map_err(|e| format!("Preset inválido en {}: {e}", path.display()))
    }

    /// Resúmenes ordenados por nombre. Los archivos rotos se omiten (y se avisa en consola).
    pub fn list(&self) -> Result<Vec<PresetSummary>, String> {
        let mut out: Vec<PresetSummary> = list_json_stems(&self.0)?
            .into_iter()
            .filter_map(|id| match self.load(&id) {
                Ok(p) => Some(p.summary()),
                Err(e) => {
                    crate::logger::warn("presets", format!("se omite {id}.json: {e}"));
                    None
                }
            })
            .collect();
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(out)
    }
}

#[tauri::command]
pub fn save_preset(dir: tauri::State<'_, PresetsDir>, preset: Preset) -> Result<(), String> {
    dir.save(&preset).map(|_| ())
}

#[tauri::command]
pub fn load_preset(dir: tauri::State<'_, PresetsDir>, id: String) -> Result<Preset, String> {
    dir.load(&id)
}

#[tauri::command]
pub fn list_presets(dir: tauri::State<'_, PresetsDir>) -> Result<Vec<PresetSummary>, String> {
    dir.list()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::{GamePhase, DEFAULT_TIME_PER_QUESTION};
    use crate::schemas::Difficulty;

    fn mq(n: usize) -> Question {
        Question {
            id: format!("q{n}"),
            mode: GameMode::Millonario,
            category: "c".into(),
            difficulty: Difficulty::Easy,
            question: format!("Pregunta {n}"),
            answers: vec!["a".into(), "b".into(), "c".into(), "d".into()],
            correct: 0,
            meta: None,
        }
    }

    fn millonario(time: u32) -> Preset {
        Preset {
            id: "demo".into(),
            name: "  Demo  ".into(),
            mode: GameMode::Millonario,
            questions: (0..17).map(mq).collect(),
            theme: "neon".into(),
            time_limit: time,
            min_correct: Some(3),
            twitch_channel: Some(" #MiCanal ".into()),
        }
    }

    fn rosco() -> Preset {
        Preset {
            id: "rosco".into(),
            name: "Rosco".into(),
            mode: GameMode::Rosco,
            questions: crate::game::rosco::tests::rosco_questions(),
            theme: "clasico".into(),
            time_limit: 200,
            min_correct: Some(20),
            twitch_channel: None,
        }
    }

    #[test]
    fn validation_normalizes() {
        let p = millonario(20).validated().unwrap();
        assert_eq!(p.name, "Demo");
        assert_eq!(p.min_correct, None, "min_correct no aplica a Millonario");
        assert_eq!(p.twitch_channel.as_deref(), Some("micanal"));
        let mut q = millonario(20);
        q.twitch_channel = Some("   ".into());
        assert_eq!(q.validated().unwrap().twitch_channel, None);
    }

    #[test]
    fn validation_rejects_bad_presets() {
        let bad: Vec<(&str, Box<dyn Fn(&mut Preset)>)> = vec![
            ("id", Box::new(|p| p.id = "../x".into())),
            ("nombre", Box::new(|p| p.name = " ".into())),
            ("tiempo", Box::new(|p| p.time_limit = 2)),
            ("tiempo", Box::new(|p| p.time_limit = 301)),
            ("tema", Box::new(|p| p.theme = "Neón!".into())),
            ("modo", Box::new(|p| p.questions[3].mode = GameMode::Rosco)),
            ("vacío", Box::new(|p| p.questions.clear())),
            ("canal", Box::new(|p| p.twitch_channel = Some("no vale".into()))),
        ];
        for (what, mutate) in bad {
            let mut p = millonario(20);
            mutate(&mut p);
            assert!(p.validated().is_err(), "debería fallar: {what}");
        }
        let mut r = rosco();
        r.min_correct = Some(28);
        assert!(r.validated().is_err());
        let mut r = rosco();
        r.questions.pop();
        assert!(r.validated().is_err(), "rosco incompleto");
    }

    #[test]
    fn start_millonario_preset_applies_everything() {
        let mut s = GameState::new(GameMode::Rosco, 27);
        s.start_preset(&millonario(15)).unwrap();
        assert_eq!((s.mode, s.phase, s.total_questions, s.theme.as_str()), (GameMode::Millonario, GamePhase::Idle, 15, "neon"));
        assert_eq!((s.time_limit, s.time_remaining), (15, 15), "el reloj en Idle ya muestra el tiempo del preset");
        s.load_next_question().unwrap();
        assert_eq!(s.time_remaining, 15);
        s.submit_answer(0);
        s.next_round();
        s.load_next_question().unwrap();
        assert_eq!(s.time_remaining, 15, "todas las preguntas usan el tiempo del preset");
        s.reset();
        s.load_next_question().unwrap();
        assert_eq!(s.time_remaining, 15, "y sobrevive al reset");

        // Un InitGame normal posterior mantiene la última configuración de tiempo.
        s.init_with_questions(vec![mq(0)]);
        s.load_next_question().unwrap();
        assert_eq!(s.time_remaining, 15);
        assert_ne!(DEFAULT_TIME_PER_QUESTION, 15);
    }

    #[test]
    fn start_rosco_preset_applies_everything() {
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.start_preset(&rosco()).unwrap();
        let r = s.rosco.as_ref().unwrap();
        assert_eq!((s.mode, s.time_limit, r.min_correct, s.theme.as_str()), (GameMode::Rosco, 200, 20, "clasico"));
    }

    #[test]
    fn invalid_preset_leaves_game_untouched() {
        let mut s = GameState::new(GameMode::Millonario, 15);
        s.start_preset(&millonario(20)).unwrap();
        s.load_next_question().unwrap();
        let before = serde_json::to_string(&s).unwrap();
        let mut bad = rosco();
        bad.questions.pop();
        assert!(s.start_preset(&bad).is_err());
        assert_eq!(serde_json::to_string(&s).unwrap(), before);
    }

    #[test]
    fn save_list_load_roundtrip() {
        let dir = std::env::temp_dir().join(format!("concursillo-presets-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let store = PresetsDir(dir.clone());
        store.save(&millonario(20)).unwrap();
        store.save(&rosco()).unwrap();
        fs::write(dir.join("roto.json"), "{no es json").unwrap();
        let list = store.list().unwrap();
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), vec!["Demo", "Rosco"], "el roto se omite");
        assert_eq!(list[0].question_count, 15, "las de reserva no cuentan");
        let loaded = store.load("demo").unwrap();
        assert_eq!(loaded.name, "Demo");
        assert!(fs::read_to_string(dir.join("demo.json")).unwrap().contains(r#""min_correct": null"#));
        // Un preset escrito a mano sin los campos opcionales también se lee.
        let mut raw: serde_json::Value = serde_json::from_str(&fs::read_to_string(dir.join("demo.json")).unwrap()).unwrap();
        raw.as_object_mut().unwrap().retain(|k, _| k != "min_correct" && k != "twitch_channel");
        fs::write(dir.join("minimo.json"), raw.to_string().replace(r#""id":"demo""#, r#""id":"minimo""#)).unwrap();
        assert_eq!(store.load("minimo").unwrap().twitch_channel, None);
        assert!(store.save(&Preset { id: "x/../y".into(), ..millonario(20) }).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
