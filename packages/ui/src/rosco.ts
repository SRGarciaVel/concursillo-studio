import type { GameMode, Question } from "@concursillo/shared-types";

/** Mismo orden que `ROSCO_ALPHABET` en `src-tauri/src/game/rosco.rs`. */
export const ROSCO_ALPHABET = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "Ñ",
  "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
] as const;

export type RoscoLetterChar = (typeof ROSCO_ALPHABET)[number];

export function roscoLetterOf(q: Question): string | null {
  const l = q.meta?.rosco_letter?.trim().toUpperCase();
  return l && (ROSCO_ALPHABET as readonly string[]).includes(l) ? l : null;
}

/** Modo de un set: Rosco si alguna pregunta es de Rosco (el backend exige que sean todas). */
export function detectSetMode(questions: Question[]): GameMode {
  return questions.some((q) => q.mode === "Rosco") ? "Rosco" : "Millonario";
}

/** Errores de un set de rosco (vacío = válido). Replica la validación de Rust para avisar antes. */
export function roscoSetProblems(questions: Question[]): string[] {
  const problems: string[] = [];
  const letters = questions.map(roscoLetterOf);
  const missing = ROSCO_ALPHABET.filter((l) => !letters.includes(l));
  const dupes = [...new Set(letters.filter((l, i) => l && letters.indexOf(l) !== i))];
  if (letters.includes(null)) problems.push("hay preguntas sin letra válida");
  if (dupes.length) problems.push(`letras repetidas: ${dupes.join(", ")}`);
  if (missing.length) problems.push(`faltan ${missing.length}: ${missing.join(" ")}`);
  return problems;
}

/** Texto de la pista del rosco: "Empieza por la A" / "Contiene la X". */
export function roscoHint(letter: string, startsWith: boolean): string {
  return `${startsWith ? "Empieza por" : "Contiene"} la ${letter}`;
}
