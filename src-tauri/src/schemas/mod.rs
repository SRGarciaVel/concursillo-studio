use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum GameMode {
    Millonario,
    Rosco,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct QuestionMeta {
    pub rosco_letter: Option<String>,
    pub rosco_starts_with: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../packages/shared-types/src/")]
pub struct Question {
    pub id: String,
    pub mode: GameMode,
    pub category: String,
    pub difficulty: Difficulty,
    pub question: String,
    pub answers: Vec<String>,
    pub correct: usize,
    pub meta: Option<QuestionMeta>,
}
