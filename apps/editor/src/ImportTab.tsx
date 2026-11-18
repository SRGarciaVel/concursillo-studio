import { useState } from "react";
import { ClipboardPaste, Download, FileText, Upload } from "lucide-react";
import { Badge, Button, Card, Notice, Textarea, bulkTemplate, errorMessage, parseBulkQuestions } from "@concursillo/ui";
import type { GameMode } from "@concursillo/shared-types";
import { MODE_LABEL, type QuestionSetState } from "./useQuestionSet";

const COLUMNS: Record<GameMode, string[]> = {
  Millonario: ["Pregunta", "Correcta", "Opción 2", "Opción 3", "Opción 4", "Categoría", "Dificultad"],
  Rosco: ["Letra", "Definición", "Respuesta", "Categoría", "Dificultad", "empieza / contiene"],
};

/** Importación masiva: pegar texto (una pregunta por línea) y procesarlo en Rust. */
export function ImportTab({ set, onImported }: { set: QuestionSetState; onImported: () => void }) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const mode = set.mode;
  const lineCount = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  const process = async () => {
    setBusy(true);
    setErrors([]);
    try {
      const questions = await parseBulkQuestions(text, mode);
      set.addMany(questions);
      set.setNotice({ kind: "ok", text: `Importadas ${questions.length} preguntas (${MODE_LABEL[mode]}). Revísalas y guarda el set.` });
      setText("");
      onImported();
    } catch (e) {
      // Rust devuelve un error por línea ("Línea 3: …").
      setErrors(errorMessage(e).split("\n"));
    } finally {
      setBusy(false);
    }
  };

  const fillTemplate = async () => {
    try {
      setText(await bulkTemplate(mode));
      setErrors([]);
    } catch (e) {
      setErrors([errorMessage(e)]);
    }
  };

  const downloadTemplate = async () => {
    try {
      const template = await bulkTemplate(mode);
      const url = URL.createObjectURL(new Blob([template], { type: "text/plain;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `plantilla_${mode.toLowerCase()}.txt` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setErrors([errorMessage(e)]);
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card
        title="Pegar preguntas"
        icon={ClipboardPaste}
        actions={
          <Badge variant="accent">
            {MODE_LABEL[mode]} · se añaden a «{set.fileName || "set sin nombre"}»
          </Badge>
        }
        bodyClassName="flex flex-col gap-3"
      >
        <Textarea
          name="bulkText"
          rows={14}
          spellCheck={false}
          value={text}
          placeholder={COLUMNS[mode].join(" | ")}
          className="font-mono text-[13px]"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" icon={Upload} loading={busy} disabled={lineCount === 0} onClick={process}>
            Procesar e importar{lineCount > 0 ? ` (${lineCount})` : ""}
          </Button>
          <Button variant="secondary" size="lg" icon={FileText} onClick={fillTemplate}>
            Insertar plantilla
          </Button>
          <Button variant="ghost" size="lg" icon={Download} onClick={downloadTemplate}>
            Descargar .txt
          </Button>
        </div>
        {errors.length > 0 && (
          <Notice kind="error">
            <strong>No se ha importado nada: corrige estas líneas.</strong>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 font-mono text-xs">
              {errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
      </Card>

      <Card title="Formato" icon={FileText} bodyClassName="flex flex-col gap-3 text-sm text-zinc-300">
        <p>Una pregunta por línea, con las columnas en este orden:</p>
        <ol className="flex flex-wrap gap-1.5">
          {COLUMNS[mode].map((c, i) => (
            <li key={c}>
              <Badge variant={i < (mode === "Rosco" ? 3 : 3) ? "accent" : "neutral"}>
                {i + 1}. {c}
              </Badge>
            </li>
          ))}
        </ol>
        <ul className="list-disc space-y-1.5 pl-5 text-zinc-400">
          <li>
            Separador <code className="rounded bg-zinc-800 px-1 font-mono text-zinc-200">|</code>, tabulador (pegar desde Excel/Sheets) o{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-zinc-200">;</code>.
          </li>
          <li>
            Las líneas que empiezan por <code className="rounded bg-zinc-800 px-1 font-mono text-zinc-200">#</code> son comentarios.
          </li>
          {mode === "Millonario" ? (
            <>
              <li>La correcta va en la 2.ª columna y se coloca en una posición al azar.</li>
              <li>De 1 a 3 opciones incorrectas. Categoría y dificultad son opcionales.</li>
            </>
          ) : (
            <>
              <li>Se comprueba que la respuesta empiece por (o contenga) la letra.</li>
              <li>La última columna es opcional: por defecto, «empieza».</li>
            </>
          )}
          <li>Si alguna línea falla no se importa nada, y verás cada error con su número de línea.</li>
        </ul>
        <p className="text-xs text-zinc-500">El modo es el del set abierto en la pestaña Preguntas.</p>
      </Card>
    </div>
  );
}
