import { roscoHint } from "@concursillo/ui";
import type { GameState, RoscoState } from "@concursillo/shared-types";
import { Timer } from "./Timer";

const OPTION_LETTERS = ["A", "B", "C", "D"];
/** Radio del círculo de letras, en % del contenedor cuadrado. */
const RING_RADIUS = 45;

/** Posición de la letra i en el perímetro (empezando arriba, sentido horario). */
function letterPosition(i: number, total: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / total;
  return {
    left: `${50 + RING_RADIUS * Math.cos(angle)}%`,
    top: `${50 + RING_RADIUS * Math.sin(angle)}%`,
  };
}

function Counters({ rosco }: { rosco: RoscoState }) {
  const pending = rosco.letters.length - rosco.total_correct - rosco.total_wrong;
  return (
    <div className="rosco-counters">
      <span className="count correct" title="Aciertos">✔ {rosco.total_correct}</span>
      <span className="count wrong" title="Fallos">✘ {rosco.total_wrong}</span>
      <span className="count pending" title="Pendientes">● {pending}</span>
    </div>
  );
}

export function RoscoStage({ state }: { state: GameState }) {
  const rosco = state.rosco!;
  const inPlay = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const finished = state.phase === "Won" || state.phase === "GameOver";
  const current = rosco.letters[rosco.current_index];
  const q = state.current_question;

  return (
    <main className="stage rosco-stage">
      <div className="rosco-timer">
        <Timer state={state} />
      </div>

      <div className="rosco-ring">
        {rosco.letters.map((l, i) => {
          const isCurrent = inPlay && i === rosco.current_index;
          return (
            <div
              key={l.letter}
              className={`rosco-letter status-${l.status.toLowerCase()}${isCurrent ? " current" : ""}`}
              style={letterPosition(i, rosco.letters.length)}
            >
              {l.letter}
            </div>
          );
        })}

        <div className="rosco-center">
          {inPlay && q ? (
            <>
              <div className="rosco-hint">{roscoHint(current.letter, current.starts_with)}</div>
              <div className="rosco-question">{q.question}</div>
              {q.answers.length > 1 && (
                <div className="rosco-options">
                  {q.answers.map((a, i) => (
                    <div key={i} className="rosco-option">
                      <span className="letter">{OPTION_LETTERS[i] ?? i + 1}:</span> {a}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : finished ? (
            <div className={`rosco-result ${state.phase === "Won" ? "ok" : "bad"}`}>
              {state.phase === "Won" ? "¡Rosco completado!" : state.time_remaining === 0 ? "¡Se acabó el tiempo!" : "Fin del rosco"}
            </div>
          ) : (
            <div className="rosco-hint">Preparados…</div>
          )}
          <Counters rosco={rosco} />
        </div>
      </div>
    </main>
  );
}
