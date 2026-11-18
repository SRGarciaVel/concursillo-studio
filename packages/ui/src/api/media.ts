import { invoke, isTauri } from "@tauri-apps/api/core";
import type { GameMode, Question, SoundFileInfo } from "@concursillo/shared-types";

/** IPC del importador masivo (`bulk.rs`), sonidos (`sounds.rs`) y ventanas. */

function ensureTauri() {
  if (!isTauri()) throw new Error("Esta acción requiere abrir la vista dentro de la app de Tauri");
}

export async function parseBulkQuestions(text: string, mode: GameMode): Promise<Question[]> {
  ensureTauri();
  return invoke<Question[]>("parse_bulk_questions", { text, mode });
}

export async function bulkTemplate(mode: GameMode): Promise<string> {
  ensureTauri();
  return invoke<string>("bulk_template", { mode });
}

export async function listSounds(): Promise<SoundFileInfo[]> {
  ensureTauri();
  return invoke<SoundFileInfo[]>("list_sounds");
}

/**
 * Sube un archivo de audio. El cuerpo del IPC son los bytes en crudo
 * (Tauri lo recibe como `InvokeBody::Raw`), y el nombre/extensión van en
 * cabeceras: no se convierte el archivo a un array JSON de números.
 */
export async function saveCustomSound(soundName: string, file: File): Promise<void> {
  ensureTauri();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await file.arrayBuffer());
  return invoke<void>("save_custom_sound", bytes, {
    headers: { "x-sound-name": soundName, "x-extension": extension },
  });
}

export async function resetSound(name: string): Promise<void> {
  ensureTauri();
  return invoke<void>("reset_sound", { name });
}

/** Abre (o enfoca) la ventana del editor. */
export async function openEditor(): Promise<void> {
  ensureTauri();
  return invoke<void>("open_editor");
}
