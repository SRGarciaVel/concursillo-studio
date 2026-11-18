import { useState } from "react";
import { bulkTemplate, errorMessage, parseBulkQuestions } from "@concursillo/ui";
import type { GameMode, Question } from "@concursillo/shared-types";

interface Props {
  mode: GameMode;
  onImport: (questions: Question[]) => void;
}

const FORMAT_HINT: Record<GameMode, string> = {
  Millonario: "Pregunta | Respuesta correcta | Opción 2 | Opción 3 | Opción 4 | Categoría | Dificultad",
  Rosco: "Letra | Definición | Respuesta | Categoría | Dificultad | empieza/contiene",
};

/** Importador masivo: pegar texto (una pregunta por línea) y procesarlo en Rust. */
export function BulkImport({ mode, onImport }: Props) {
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lineCount = text.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;

  const process = async () => {
    setBusy(true);
    setErrors([]);
    setResult(null);
    try {
      const questions = await parseBulkQuestions(text, mode);
      onImport(questions);
      setResult(`✔ ${questions.length} preguntas importadas al set`);
      setText("");
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
    <details className="panel bulk-import">
      <summary>
        <h2>Importar masivo · {mode}</h2>
      </summary>
      <p className="hint">
        Una pregunta por línea: <code>{FORMAT_HINT[mode]}</code>. Separador <code>|</code>, tabulador o <code>;</code>.
        Las líneas que empiezan por <code>#</code> se ignoran.
        {mode === "Millonario" && " La correcta va en la 2.ª columna y se coloca en una posición al azar."}
      </p>
      <textarea
        name="bulkText"
        rows={10}
        spellCheck={false}
        value={text}
        placeholder={FORMAT_HINT[mode]}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <button type="button" onClick={process} disabled={busy || lineCount === 0} className={busy ? "is-busy" : undefined}>
          Procesar e Importar{lineCount > 0 ? ` (${lineCount})` : ""}
        </button>
        <button type="button" className="secondary" onClick={fillTemplate}>Insertar plantilla</button>
        <button type="button" className="secondary" onClick={downloadTemplate}>Descargar plantilla .txt</button>
      </div>
      {result && <p className="notice notice-ok">{result}</p>}
      {errors.length > 0 && (
        <div className="notice notice-error bulk-errors">
          <strong>No se ha importado nada: corrige estas líneas.</strong>
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
