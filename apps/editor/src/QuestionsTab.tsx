import { useState } from "react";
import { FolderOpen, RefreshCw, Save } from "lucide-react";
import { Badge, Button, Card, Field, IconButton, Input, Notice, Select, cn, ROSCO_ALPHABET } from "@concursillo/ui";
import type { GameMode, Question } from "@concursillo/shared-types";
import { QuestionForm } from "./QuestionForm";
import { QuestionList } from "./QuestionList";
import { MODE_LABEL, type QuestionSetState } from "./useQuestionSet";

/** Pestaña Preguntas: barra del set arriba y dos paneles (lista | formulario). */
export function QuestionsTab({ set }: { set: QuestionSetState }) {
  const [editing, setEditing] = useState<Question | null>(null);
  const [toLoad, setToLoad] = useState("");
  const loadTarget = toLoad || set.sets[0] || "";

  const submit = (q: Question) => {
    if (editing) {
      set.update(q);
      setEditing(null);
      set.setNotice({ kind: "ok", text: "Pregunta actualizada" });
    } else {
      set.add(q);
    }
  };

  const canSave = !!set.fileName.trim() && set.questions.length > 0 && set.roscoProblems.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Barra del set: modo, nombre, guardar y cargar. */}
      <Card bodyClassName="flex flex-wrap items-end gap-3">
        <Field label="Modo" className="w-40" hint={set.questions.length > 0 ? "Fijo: el set ya tiene preguntas" : undefined}>
          <Select name="mode" value={set.mode} disabled={set.questions.length > 0} onChange={(e) => set.setMode(e.target.value as GameMode)}>
            <option value="Millonario">Millonario</option>
            <option value="Rosco">Rosco</option>
          </Select>
        </Field>
        <Field label="Nombre del archivo" className="min-w-48 flex-1">
          <Input
            name="fileName"
            value={set.fileName}
            placeholder={set.isRosco ? "mi_rosco" : "mi_primera_partida"}
            onChange={(e) => set.setFileName(e.target.value)}
          />
        </Field>
        <Button variant="primary" icon={Save} disabled={!canSave} onClick={() => void set.save()}>
          Guardar set
        </Button>
        {set.dirty && <Badge variant="warning" dot>Sin guardar</Badge>}
        <div className="ml-auto flex items-end gap-2">
          <Field label="Sets guardados" className="w-52">
            <Select name="savedSet" value={loadTarget} onChange={(e) => setToLoad(e.target.value)}>
              {set.sets.length === 0 && <option value="">(ninguno)</option>}
              {set.sets.map((s) => (
                <option key={s} value={s}>{s}.json</option>
              ))}
            </Select>
          </Field>
          <Button
            icon={FolderOpen}
            disabled={!loadTarget}
            onClick={() => {
              setEditing(null);
              void set.load(loadTarget);
            }}
          >
            Cargar
          </Button>
          <IconButton label="Recargar lista de sets" icon={RefreshCw} variant="ghost" onClick={() => void set.refreshSets()} />
        </div>
      </Card>

      {set.notice && <Notice kind={set.notice.kind}>{set.notice.text}</Notice>}

      {set.isRosco && (
        <Card bodyClassName="flex flex-wrap items-center gap-3 py-3">
          <span className="text-xs font-medium text-zinc-400">
            Letras ({[...set.usedLetters].filter(Boolean).length}/27)
          </span>
          <div className="flex flex-wrap gap-1">
            {ROSCO_ALPHABET.map((l) => (
              <span
                key={l}
                className={cn(
                  "grid size-6 place-items-center rounded-full text-[11px] font-bold transition-colors",
                  set.usedLetters.has(l) ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-500",
                )}
              >
                {l}
              </span>
            ))}
          </div>
          {set.roscoProblems.length > 0 && set.questions.length > 0 && (
            <span className="text-xs text-amber-300">Para guardar: {set.roscoProblems.join(" · ")}</span>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <QuestionList
          questions={set.ordered}
          isRosco={set.isRosco}
          selectedId={editing?.id ?? null}
          onSelect={setEditing}
          onNew={() => setEditing(null)}
          onRemove={(id) => {
            if (editing?.id === id) setEditing(null);
            set.remove(id);
          }}
          onReorder={set.reorder}
        />
        <div className="lg:sticky lg:top-4">
          <QuestionForm mode={set.mode} editing={editing} usedLetters={set.usedLetters} onSubmit={submit} onCancelEdit={() => setEditing(null)} />
          <p className="mt-2 px-1 text-xs text-zinc-500">
            {MODE_LABEL[set.mode]}
            {set.isRosco ? " · 27 letras (A–Z + Ñ)" : " · se juegan 15; las demás quedan de reserva para el hito de la pregunta 11"}
          </p>
        </div>
      </div>
    </div>
  );
}
