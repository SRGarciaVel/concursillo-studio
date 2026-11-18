import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Question } from "@concursillo/shared-types";

/** Comandos IPC de Tauri para los sets de preguntas (`src-tauri/src/files.rs`). */

function ensureTauri() {
  if (!isTauri()) {
    throw new Error("Esta acción requiere abrir la vista dentro de la app de Tauri");
  }
}

export async function listQuestionSets(): Promise<string[]> {
  ensureTauri();
  return invoke<string[]>("list_questions_sets");
}

export async function loadQuestionSet(fileName: string): Promise<Question[]> {
  ensureTauri();
  return invoke<Question[]>("load_questions_set", { fileName });
}

export async function saveQuestionSet(fileName: string, questions: Question[]): Promise<void> {
  ensureTauri();
  return invoke<void>("save_questions_set", { fileName, questions });
}

/** Normaliza un error de `invoke` (que llega como string desde Rust). */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
