import { useEffect, useMemo, useState } from "react";
import {
  ROSCO_ALPHABET,
  detectSetMode,
  errorMessage,
  listQuestionSets,
  loadQuestionSet,
  roscoLetterOf,
  roscoSetProblems,
  saveQuestionSet,
} from "@concursillo/ui";
import type { GameMode, Question } from "@concursillo/shared-types";

export type EditorNotice = { kind: "ok" | "error" | "info"; text: string } | null;

export const MODE_LABEL: Record<GameMode, string> = { Millonario: "Millonario", Rosco: "Rosco" };

const letterIndex = (q: Question) => ROSCO_ALPHABET.indexOf((roscoLetterOf(q) ?? "") as never);

/**
 * Estado del set que se está editando, compartido por las pestañas
 * "Preguntas" e "Importar". Solo es estado local del editor: se persiste con
 * los comandos IPC de siempre (`save_questions_set` / `load_questions_set`).
 */
export function useQuestionSet() {
  const [mode, setMode] = useState<GameMode>("Millonario");
  const [fileName, setFileName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [notice, setNotice] = useState<EditorNotice>(null);
  /** Hay cambios sin guardar desde la última carga/guardado. */
  const [dirty, setDirty] = useState(false);

  const isRosco = mode === "Rosco";
  const usedLetters = useMemo(() => new Set(questions.map(roscoLetterOf)), [questions]);
  const roscoProblems = isRosco ? roscoSetProblems(questions) : [];
  // En el rosco el orden lo dan las letras; en Millonario, el del usuario.
  const ordered = useMemo(
    () => (isRosco ? [...questions].sort((a, b) => letterIndex(a) - letterIndex(b)) : questions),
    [isRosco, questions],
  );

  const refreshSets = async () => {
    try {
      setSets(await listQuestionSets());
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  useEffect(() => {
    void refreshSets();
  }, []);

  const change = (updater: (qs: Question[]) => Question[]) => {
    setQuestions(updater);
    setDirty(true);
  };

  return {
    mode,
    setMode,
    isRosco,
    fileName,
    setFileName,
    questions,
    ordered,
    usedLetters,
    roscoProblems,
    sets,
    refreshSets,
    notice,
    setNotice,
    dirty,

    add: (q: Question) => change((qs) => [...qs, q]),
    addMany: (list: Question[]) => change((qs) => [...qs, ...list]),
    update: (q: Question) => change((qs) => qs.map((x) => (x.id === q.id ? q : x))),
    remove: (id: string) => change((qs) => qs.filter((q) => q.id !== id)),
    /** Mueve la pregunta `fromId` a la posición de `toId` (drag-and-drop). */
    reorder: (fromId: string, toId: string) =>
      change((qs) => {
        const from = qs.findIndex((q) => q.id === fromId);
        const to = qs.findIndex((q) => q.id === toId);
        if (from < 0 || to < 0 || from === to) return qs;
        const next = [...qs];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    clear: () => {
      setQuestions([]);
      setFileName("");
      setDirty(false);
    },

    save: async () => {
      try {
        await saveQuestionSet(fileName, ordered);
        setNotice({ kind: "ok", text: `Guardado ${fileName.replace(/\.json$/, "")}.json · ${questions.length} preguntas (${MODE_LABEL[mode]})` });
        setDirty(false);
        await refreshSets();
      } catch (e) {
        setNotice({ kind: "error", text: errorMessage(e) });
      }
    },

    load: async (name: string) => {
      try {
        const loaded = await loadQuestionSet(name);
        const loadedMode = detectSetMode(loaded);
        setMode(loadedMode);
        setQuestions(loaded);
        setFileName(name);
        setDirty(false);
        setNotice({ kind: "ok", text: `Cargado ${name}.json · ${loaded.length} preguntas (${MODE_LABEL[loadedMode]})` });
      } catch (e) {
        setNotice({ kind: "error", text: errorMessage(e) });
      }
    },
  };
}

export type QuestionSetState = ReturnType<typeof useQuestionSet>;
