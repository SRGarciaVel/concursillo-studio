import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleCheck, Plus, Save, SquarePen, X } from "lucide-react";
import { Badge, Button, Card, Field, Input, Select, Switch, Textarea, cn, ROSCO_ALPHABET, roscoHint, roscoLetterOf } from "@concursillo/ui";
import type { Difficulty, GameMode, Question } from "@concursillo/shared-types";

const LETTERS = ["A", "B", "C", "D"] as const;
const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { Easy: "Fácil", Medium: "Media", Hard: "Difícil" };

interface Draft {
  category: string;
  difficulty: Difficulty;
  question: string;
  answers: [string, string, string, string];
  correct: number;
  roscoLetter: string;
  startsWith: boolean;
  /** Rosco: con alternativas (true) o respuesta libre (false). */
  withOptions: boolean;
  freeAnswer: string;
}

const EMPTY: Draft = {
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

/** Pregunta guardada → borrador del formulario (para editarla). */
function toDraft(q: Question): Draft {
  const answers = [...q.answers, "", "", "", ""].slice(0, 4) as Draft["answers"];
  const free = q.mode === "Rosco" && q.answers.length === 1;
  return {
    category: q.category,
    difficulty: q.difficulty,
    question: q.question,
    answers: free ? ["", "", "", ""] : answers,
    correct: free ? 0 : q.correct,
    roscoLetter: roscoLetterOf(q) ?? "",
    startsWith: q.meta?.rosco_starts_with ?? true,
    withOptions: q.mode === "Rosco" && !free,
    freeAnswer: free ? q.answers[0] : "",
  };
}

interface Props {
  mode: GameMode;
  /** Pregunta que se está editando, o `null` para crear una nueva. */
  editing: Question | null;
  usedLetters: Set<string | null>;
  onSubmit: (q: Question) => void;
  onCancelEdit: () => void;
}

/** Formulario de pregunta: crea una nueva o edita la seleccionada en la lista. */
export function QuestionForm({ mode, editing, usedLetters, onSubmit, onCancelEdit }: Props) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const isRosco = mode === "Rosco";
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  // Letras ocupadas, sin contar la de la pregunta que se edita.
  const taken = useMemo(() => {
    const own = editing ? roscoLetterOf(editing) : null;
    return new Set([...usedLetters].filter((l) => l && l !== own));
  }, [usedLetters, editing]);
  const firstFree = ROSCO_ALPHABET.find((l) => !taken.has(l)) ?? "";

  // Cargar la pregunta seleccionada (o vaciar al terminar de editar).
  useEffect(() => {
    if (editing) setDraft(toDraft(editing));
    else setDraft((d) => ({ ...EMPTY, category: d.category, difficulty: d.difficulty, withOptions: d.withOptions, roscoLetter: "" }));
  }, [editing]);

  // Rosco: proponer la primera letra libre.
  useEffect(() => {
    if (isRosco && (!draft.roscoLetter || taken.has(draft.roscoLetter))) set("roscoLetter", firstFree);
  }, [isRosco, taken, draft.roscoLetter, firstFree]);

  const filled = draft.answers.filter((a) => a.trim() !== "").length;
  const optionsValid = draft.answers[draft.correct]?.trim() !== "" && filled >= 2;
  const baseValid = draft.category.trim() !== "" && draft.question.trim() !== "";
  const valid = isRosco
    ? baseValid && !!draft.roscoLetter && !taken.has(draft.roscoLetter) && (draft.withOptions ? optionsValid : draft.freeAnswer.trim() !== "")
    : baseValid && optionsValid;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const free = isRosco && !draft.withOptions;
    // Se quitan las opciones vacías (2–4 respuestas) y se recalcula el índice de la correcta.
    const kept = draft.answers.map((a, i) => ({ a: a.trim(), i })).filter((x) => x.a !== "");
    const q: Question = {
      id: editing?.id ?? crypto.randomUUID(),
      mode,
      category: draft.category.trim(),
      difficulty: draft.difficulty,
      question: draft.question.trim(),
      answers: free ? [draft.freeAnswer.trim()] : kept.map((x) => x.a),
      correct: free ? 0 : kept.findIndex((x) => x.i === draft.correct),
      meta: isRosco ? { rosco_letter: draft.roscoLetter, rosco_starts_with: draft.startsWith } : null,
    };
    onSubmit(q);
    if (!editing) {
      // Mantener categoría, dificultad y tipo de respuesta para añadir varias seguidas.
      setDraft((d) => ({ ...EMPTY, category: d.category, difficulty: d.difficulty, withOptions: d.withOptions }));
    }
  };

  return (
    <Card
      title={editing ? "Editar pregunta" : "Nueva pregunta"}
      icon={editing ? SquarePen : Plus}
      tone={editing ? "accent" : "default"}
      actions={editing ? <Badge variant="accent">Editando</Badge> : <Badge>{mode}</Badge>}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
          <Field label="Categoría">
            <Input name="category" value={draft.category} placeholder="Geografía" onChange={(e) => set("category", e.target.value)} />
          </Field>
          <Field label="Dificultad">
            <Select name="difficulty" value={draft.difficulty} onChange={(e) => set("difficulty", e.target.value as Difficulty)}>
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>
              ))}
            </Select>
          </Field>
        </div>

        {isRosco && (
          <div className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-zinc-950/40 p-3">
            <Field label="Letra" className="w-24">
              <Select name="roscoLetter" value={draft.roscoLetter} onChange={(e) => set("roscoLetter", e.target.value)}>
                {ROSCO_ALPHABET.map((l) => (
                  <option key={l} value={l} disabled={taken.has(l)}>
                    {l}
                    {taken.has(l) ? " ✔" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex flex-col gap-2 pb-1">
              <Switch
                name="startsWith"
                checked={draft.startsWith}
                onChange={(v) => set("startsWith", v)}
                label={draft.roscoLetter ? roscoHint(draft.roscoLetter, draft.startsWith) : "Empieza por la letra"}
              />
              <Switch name="withOptions" checked={draft.withOptions} onChange={(v) => set("withOptions", v)} label="Con alternativas" />
            </div>
          </div>
        )}

        <Field label={isRosco ? "Definición" : "Pregunta"}>
          <Textarea name="question" rows={2} value={draft.question} onChange={(e) => set("question", e.target.value)} />
        </Field>

        {isRosco && !draft.withOptions ? (
          <Field label="Respuesta">
            <Input name="freeAnswer" value={draft.freeAnswer} onChange={(e) => set("freeAnswer", e.target.value)} />
          </Field>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-medium tracking-wide text-zinc-400">
              Respuestas <span className="text-zinc-600">· marca la correcta · mínimo 2</span>
            </legend>
            {LETTERS.map((letter, i) => {
              const isCorrect = draft.correct === i;
              return (
                <div
                  key={letter}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-1 pl-2 transition-colors",
                    isCorrect ? "border-emerald-500/50 bg-emerald-500/10" : "border-transparent",
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Marcar ${letter} como correcta`}
                    aria-pressed={isCorrect}
                    onClick={() => set("correct", i)}
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg text-sm font-bold transition-all",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 active:scale-90",
                      isCorrect ? "bg-emerald-500 text-white shadow shadow-emerald-600/40" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700",
                    )}
                  >
                    {isCorrect ? <CircleCheck className="size-4" /> : letter}
                  </button>
                  <Input
                    name={`answer${letter}`}
                    value={draft.answers[i]}
                    placeholder={`Respuesta ${letter}${i >= 2 ? " (opcional)" : ""}`}
                    onChange={(e) => {
                      const answers = [...draft.answers] as Draft["answers"];
                      answers[i] = e.target.value;
                      set("answers", answers);
                    }}
                  />
                </div>
              );
            })}
          </fieldset>
        )}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" size="lg" icon={editing ? Save : Plus} disabled={!valid} className="flex-1">
            {editing ? "Guardar cambios" : "Añadir al set"}
          </Button>
          {editing && (
            <Button variant="secondary" size="lg" icon={X} onClick={onCancelEdit}>
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
