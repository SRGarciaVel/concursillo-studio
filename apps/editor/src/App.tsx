import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ROSCO_ALPHABET,
  detectSetMode,
  errorMessage,
  listQuestionSets,
  loadQuestionSet,
  roscoHint,
  roscoLetterOf,
  roscoSetProblems,
  saveQuestionSet,
} from "@concursillo/ui";
import type { Difficulty, GameMode, Question } from "@concursillo/shared-types";
import { BulkImport } from "./BulkImport";
import { PresetsTab } from "./PresetsTab";
import { SoundsTab } from "./SoundsTab";

const LETTERS = ["A", "B", "C", "D"] as const;
const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const DIFFICULTY_LABEL: Record<Difficulty, string> = { Easy: "Fácil", Medium: "Media", Hard: "Difícil" };
const MODE_LABEL: Record<GameMode, string> = { Millonario: "Millonario", Rosco: "Rosco" };

interface Draft {
  category: string;
  difficulty: Difficulty;
  question: string;
  answers: [string, string, string, string];
  correct: number;
  // Solo Rosco
  roscoLetter: string;
  startsWith: boolean;
  /** Rosco: con 4 alternativas (true) o respuesta libre (false). */
  withOptions: boolean;
  freeAnswer: string;
}

const EMPTY_DRAFT: Draft = {
  category: "",
  difficulty: "Easy",
  question: "",
  answers: ["", "", "", ""],
  correct: 0,
  roscoLetter: "",
  startsWith: true,
  withOptions: false,
  freeAnswer: "",
};

type Notice = { kind: "ok" | "error"; text: string } | null;

const letterIndex = (q: Question) => ROSCO_ALPHABET.indexOf((roscoLetterOf(q) ?? "") as never);

type Tab = "questions" | "presets" | "sounds";
const TABS: { id: Tab; label: string }[] = [
  { id: "questions", label: "Preguntas" },
  { id: "presets", label: "Presets" },
  { id: "sounds", label: "Sonidos" },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("questions");
  return (
    <main className="editor">
      <header className="editor-header">
        <h1>Concursillo · Editor</h1>
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "tab active" : "tab"} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      {/* Las pestañas siguen montadas para no perder lo que se está editando. */}
      <div hidden={tab !== "questions"}><QuestionsTab /></div>
      <div hidden={tab !== "presets"}><PresetsTab /></div>
      <div hidden={tab !== "sounds"}><SoundsTab /></div>
    </main>
  );
}

function QuestionsTab() {
  const [mode, setMode] = useState<GameMode>("Millonario");
  const [fileName, setFileName] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedSet, setSelectedSet] = useState("");
  const [notice, setNotice] = useState<Notice>(null);

  const isRosco = mode === "Rosco";
  const usedLetters = useMemo(() => new Set(questions.map(roscoLetterOf)), [questions]);
  const firstFreeLetter = (used: Set<string | null>) => ROSCO_ALPHABET.find((l) => !used.has(l)) ?? "";
  const roscoProblems = isRosco ? roscoSetProblems(questions) : [];
  // En el rosco el orden lo dan las letras.
  const shown = isRosco ? [...questions].sort((a, b) => letterIndex(a) - letterIndex(b)) : questions;

  const refreshSets = async () => {
    try {
      const list = await listQuestionSets();
      setSets(list);
      setSelectedSet((s) => (list.includes(s) ? s : (list[0] ?? "")));
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  useEffect(() => {
    void refreshSets();
  }, []);

  // Al entrar en modo Rosco, proponer la primera letra libre.
  useEffect(() => {
    if (isRosco && (!draft.roscoLetter || usedLetters.has(draft.roscoLetter))) {
      setDraft((d) => ({ ...d, roscoLetter: firstFreeLetter(usedLetters) }));
    }
  }, [isRosco, usedLetters, draft.roscoLetter]);

  const baseValid = draft.category.trim() !== "" && draft.question.trim() !== "";
  const optionsValid = draft.answers.every((a) => a.trim() !== "");
  const draftValid = isRosco
    ? baseValid &&
      draft.roscoLetter !== "" &&
      !usedLetters.has(draft.roscoLetter) &&
      (draft.withOptions ? optionsValid : draft.freeAnswer.trim() !== "")
    : baseValid && optionsValid;

  const addQuestion = (e: FormEvent) => {
    e.preventDefault();
    if (!draftValid) return;
    const rosco = isRosco && !draft.withOptions;
    const q: Question = {
      id: crypto.randomUUID(),
      mode,
      category: draft.category.trim(),
      difficulty: draft.difficulty,
      question: draft.question.trim(),
      // Respuesta libre: una única respuesta, que es la correcta.
      answers: rosco ? [draft.freeAnswer.trim()] : draft.answers.map((a) => a.trim()),
      correct: rosco ? 0 : draft.correct,
      meta: isRosco ? { rosco_letter: draft.roscoLetter, rosco_starts_with: draft.startsWith } : null,
    };
    const next = [...questions, q];
    setQuestions(next);
    // Mantener categoría, dificultad y tipo de respuesta para añadir varias seguidas.
    setDraft({
      ...EMPTY_DRAFT,
      category: draft.category,
      difficulty: draft.difficulty,
      withOptions: draft.withOptions,
      roscoLetter: isRosco ? firstFreeLetter(new Set(next.map(roscoLetterOf))) : "",
    });
  };

  const removeQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const moveQuestion = (index: number, delta: number) =>
    setQuestions((qs) => {
      const target = index + delta;
      if (target < 0 || target >= qs.length) return qs;
      const next = [...qs];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    try {
      await saveQuestionSet(fileName, shown);
      setNotice({ kind: "ok", text: `Guardado ${fileName.replace(/\.json$/, "")}.json (${questions.length} preguntas, ${MODE_LABEL[mode]})` });
      await refreshSets();
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  const load = async () => {
    if (!selectedSet) return;
    try {
      const loaded = await loadQuestionSet(selectedSet);
      const loadedMode = detectSetMode(loaded);
      setMode(loadedMode);
      setQuestions(loaded);
      setFileName(selectedSet);
      setNotice({ kind: "ok", text: `Cargado ${selectedSet}.json (${loaded.length} preguntas, ${MODE_LABEL[loadedMode]})` });
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  const answerSummary = (q: Question) => {
    const answer = q.answers[q.correct];
    if (q.mode !== "Rosco") return `✔ ${LETTERS[q.correct] ?? q.correct}: ${answer}`;
    const kind = q.answers.length > 1 ? ` (alternativa ${LETTERS[q.correct]})` : "";
    return `✔ ${answer}${kind}`;
  };

  return (
    <div className="tab-body">
      {notice && <p className={`notice notice-${notice.kind}`}>{notice.text}</p>}

      <section className="panel row">
        <label>
          Modo
          <select
            name="mode"
            value={mode}
            disabled={questions.length > 0}
            onChange={(e) => setMode(e.target.value as GameMode)}
          >
            <option value="Millonario">Millonario</option>
            <option value="Rosco">Rosco</option>
          </select>
        </label>
        <label className="grow">
          Nombre del archivo
          <input
            name="fileName"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder={isRosco ? "mi_rosco" : "mi_primera_partida"}
          />
        </label>
        <button onClick={save} disabled={!fileName.trim() || questions.length === 0 || roscoProblems.length > 0}>
          Guardar Set en JSON
        </button>
        {questions.length > 0 && (
          <p className="hint full">El modo se fija con la primera pregunta; vacía el set para cambiarlo.</p>
        )}
      </section>

      <section className="panel row">
        <label className="grow">
          Sets guardados
          <select name="savedSet" value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
            {sets.length === 0 && <option value="">(ninguno)</option>}
            {sets.map((s) => (
              <option key={s} value={s}>{s}.json</option>
            ))}
          </select>
        </label>
        <button onClick={load} disabled={!selectedSet}>Cargar Set</button>
        <button className="secondary" onClick={refreshSets}>↻</button>
      </section>

      {isRosco && (
        <section className="panel">
          <h2>Letras del rosco ({usedLetters.size - (usedLetters.has(null) ? 1 : 0)}/27)</h2>
          <div className="letter-chips">
            {ROSCO_ALPHABET.map((l) => (
              <span key={l} className={`chip ${usedLetters.has(l) ? "done" : ""}`}>{l}</span>
            ))}
          </div>
          {roscoProblems.length > 0 && questions.length > 0 && (
            <p className="hint">Para guardar: {roscoProblems.join(" · ")}</p>
          )}
        </section>
      )}

      <BulkImport
        mode={mode}
        onImport={(imported) => {
          setQuestions((qs) => [...qs, ...imported]);
          setNotice({ kind: "ok", text: `Importadas ${imported.length} preguntas (${MODE_LABEL[mode]}). Revísalas y guarda el set.` });
        }}
      />

      <div className="columns">
        <form className="panel form" onSubmit={addQuestion}>
          <h2>Nueva pregunta · {MODE_LABEL[mode]}</h2>
          <div className="row">
            <label className="grow">
              Categoría
              <input
                name="category"
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </label>
            <label>
              Dificultad
              <select
                name="difficulty"
                value={draft.difficulty}
                onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Difficulty })}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
                ))}
              </select>
            </label>
          </div>

          {isRosco && (
            <div className="row">
              <label>
                Letra
                <select
                  name="roscoLetter"
                  value={draft.roscoLetter}
                  onChange={(e) => setDraft({ ...draft, roscoLetter: e.target.value })}
                >
                  {ROSCO_ALPHABET.map((l) => (
                    <option key={l} value={l} disabled={usedLetters.has(l)}>
                      {l}{usedLetters.has(l) ? " ✔" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="startsWith"
                  checked={draft.startsWith}
                  onChange={(e) => setDraft({ ...draft, startsWith: e.target.checked })}
                />
                {draft.roscoLetter ? roscoHint(draft.roscoLetter, draft.startsWith) : "Empieza por la letra"}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  name="withOptions"
                  checked={draft.withOptions}
                  onChange={(e) => setDraft({ ...draft, withOptions: e.target.checked })}
                />
                Con 4 alternativas
              </label>
            </div>
          )}

          <label>
            {isRosco ? "Definición" : "Pregunta"}
            <textarea
              name="question"
              rows={2}
              value={draft.question}
              onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            />
          </label>

          {isRosco && !draft.withOptions ? (
            <label>
              Respuesta
              <input
                name="freeAnswer"
                value={draft.freeAnswer}
                onChange={(e) => setDraft({ ...draft, freeAnswer: e.target.value })}
              />
            </label>
          ) : (
            <>
              {LETTERS.map((letter, i) => (
                <div key={letter} className={`answer-row ${draft.correct === i ? "is-correct" : ""}`}>
                  <input
                    type="radio"
                    name="correct"
                    aria-label={`Marcar ${letter} como correcta`}
                    checked={draft.correct === i}
                    onChange={() => setDraft({ ...draft, correct: i })}
                  />
                  <span className="letter">{letter}</span>
                  <input
                    name={`answer${letter}`}
                    value={draft.answers[i]}
                    placeholder={`Respuesta ${letter}`}
                    onChange={(e) => {
                      const answers = [...draft.answers] as Draft["answers"];
                      answers[i] = e.target.value;
                      setDraft({ ...draft, answers });
                    }}
                  />
                </div>
              ))}
              <p className="hint">Marca con el círculo la respuesta correcta.</p>
            </>
          )}
          <button type="submit" disabled={!draftValid}>Añadir al Set</button>
        </form>

        <section className="panel">
          <h2>Set actual ({questions.length}{isRosco ? "/27" : ""})</h2>
          {questions.length === 0 ? (
            <p className="hint">Todavía no hay preguntas.</p>
          ) : (
            <ol className={`question-list${isRosco ? " rosco" : ""}`}>
              {shown.map((q, i) => {
                const letter = roscoLetterOf(q);
                return (
                  <li key={q.id}>
                    <div className="q-text">
                      {isRosco && <span className="q-letter">{letter ?? "?"}</span>}
                      {q.question}
                    </div>
                    <div className="q-meta">
                      {isRosco && letter && `${roscoHint(letter, q.meta?.rosco_starts_with ?? true)} · `}
                      {answerSummary(q)} · {q.category} · {DIFFICULTY_LABEL[q.difficulty]}
                    </div>
                    <div className="q-actions">
                      {!isRosco && (
                        <>
                          <button className="secondary" onClick={() => moveQuestion(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                          <button className="secondary" onClick={() => moveQuestion(i, 1)} disabled={i === questions.length - 1} aria-label="Bajar">↓</button>
                        </>
                      )}
                      <button className="danger" onClick={() => removeQuestion(q.id)} aria-label="Eliminar">✕</button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
