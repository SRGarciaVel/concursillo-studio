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

/** Abre la carpeta de logs (`%APPDATA%\com.concursillo.studio\logs`) en el Explorador. */
export async function openLogsFolder(): Promise<void> {
  ensureTauri();
  return invoke<void>("open_logs_folder");
}

/** URL del Stage que el streamer añade en OBS como "Fuente de navegador". */
export const STAGE_URL = "http://127.0.0.1:4322/stage/";

/**
 * Copia texto al portapapeles. Dentro de la app lo hace Rust (fiable aunque la
 * ventana no tenga el foco); en un navegador normal, la API del navegador y,
 * como último recurso, el truco clásico del textarea.
 */
export async function copyText(text: string): Promise<void> {
  if (isTauri()) {
    await invoke<void>("copy_to_clipboard", { text });
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Sin permiso o sin API: plan B.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("No se pudo copiar al portapapeles");
}
