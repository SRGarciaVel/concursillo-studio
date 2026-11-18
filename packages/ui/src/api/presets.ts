import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Preset, PresetSummary } from "@concursillo/shared-types";

/** Comandos IPC de Tauri para presets (`src-tauri/src/presets.rs`). */

function ensureTauri() {
  if (!isTauri()) {
    throw new Error("Esta acción requiere abrir la vista dentro de la app de Tauri");
  }
}

export async function listPresets(): Promise<PresetSummary[]> {
  ensureTauri();
  return invoke<PresetSummary[]>("list_presets");
}

export async function loadPreset(id: string): Promise<Preset> {
  ensureTauri();
  return invoke<Preset>("load_preset", { id });
}

export async function savePreset(preset: Preset): Promise<void> {
  ensureTauri();
  return invoke<void>("save_preset", { preset });
}

/** "Mi Preset Épico" → "mi_preset_epico" (id/nombre de archivo válido). */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}
