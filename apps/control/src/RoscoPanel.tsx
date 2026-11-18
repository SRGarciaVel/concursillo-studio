import { roscoHint } from "@concursillo/ui";
import type { ClientCommand, GameState } from "@concursillo/shared-types";

interface Props {
  state: GameState;
  send: (cmd: ClientCommand) => void;
}

/** Controles del presentador para el Rosco. */
export function RoscoPanel({ state, send }: Props) {
  const rosco = state.rosco!;
  const inPlay = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const resolved = rosco.total_correct + rosco.total_wrong;
  const current = rosco.letters[rosco.current_index];
  const q = state.current_question;

  return (
    <section className="panel rosco-panel">
      <h2>
        Rosco · {resolved}/{rosco.letters.length} resueltas · ✔ {rosco.total_correct} · ✘ {rosco.total_wrong} · ⏭ {rosco.total_passed} pasadas
        {" "}· para ganar: {rosco.min_correct}
      </h2>

      <div className="rosco-strip">
        {rosco.letters.map((l, i) => (
          <span
            key={l.letter}
            className={`chip status-${l.status.toLowerCase()}${inPlay && i === rosco.current_index ? " current" : ""}`}
          >
            {l.letter}
          </span>
        ))}
      </div>

      {inPlay && q ? (
        <div className="rosco-current">
          <div className="rosco-current-letter">{current.letter}</div>
          <div>
            <div className="hint-strong">{roscoHint(current.letter, current.starts_with)}</div>
            <div className="rosco-current-q">{q.question}</div>
            <div className="rosco-current-a">
              Respuesta: <strong>{q.answers[q.correct]}</strong>
              {q.answers.length > 1 && <span className="muted"> (de {q.answers.join(" / ")})</span>}
            </div>
          </div>
        </div>
      ) : (
        <p className="muted">
          {state.phase === "Idle"
            ? "Rosco cargado. Pulsa «Empezar rosco» para arrancar el reloj."
            : state.phase === "Won"
              ? "🏆 Rosco ganado."
              : "Rosco terminado."}
        </p>
      )}

      <div className="rosco-buttons">
        {state.phase === "Idle" && (
          <button className="big" onClick={() => send({ action: "load_next_question" })}>▶ Empezar rosco</button>
        )}
        <button className="big ok" disabled={!inPlay} onClick={() => send({ action: "rosco_answer", payload: { is_correct: true } })}>
          ✅ Acertó
        </button>
        <button className="big bad" disabled={!inPlay} onClick={() => send({ action: "rosco_answer", payload: { is_correct: false } })}>
          ❌ Falló
        </button>
        <button className="big pass" disabled={!inPlay} onClick={() => send({ action: "rosco_pass" })}>
          ⏭️ Pasapalabra
        </button>
      </div>
    </section>
  );
}
