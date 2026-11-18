import { useEffect, useState } from "react";
import { COMODINES, COMODIN_INFO } from "@concursillo/ui";
import type { ClientCommand, Comodin, GameState, HitoStatus } from "@concursillo/shared-types";

interface Props {
  state: GameState;
  send: (cmd: ClientCommand) => void;
}

const HITO_LABEL: Record<HitoStatus, string> = {
  Locked: "🔒 bloqueado",
  Available: "✨ disponible",
  Used: "✔ usado",
};

/** Votos del chat en directo, para el presentador. */
function ChatVotesSummary({ state }: { state: GameState }) {
  const v = state.chat_votes;
  if (state.twitch.status !== "Connected" && !v?.a && !v?.b && !v?.c && !v?.d) {
    return <span className="muted">(Twitch no conectado: sin votos)</span>;
  }
  if (!v) return null;
  const counts = [v.a, v.b, v.c, v.d];
  const max = Math.max(...counts);
  return (
    <span className="chat-votes-summary">
      {["A", "B", "C", "D"].map((l, i) => (
        <span key={l} className={max > 0 && counts[i] === max ? "leader" : undefined}>
          {l}: {counts[i]}
        </span>
      ))}
    </span>
  );
}

/** Comodines, plantarse e hitos (solo Millonario). */
export function ComodinesPanel({ state, send }: Props) {
  const live = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const active = state.active_comodin;
  const used = COMODINES.filter((c) => state.comodines[c] === "Used");
  const [recoverTarget, setRecoverTarget] = useState<Comodin | "">("");
  const [confirmRetire, setConfirmRetire] = useState(false);

  // Mantener el selector de "recuperar" apuntando a un comodín gastado.
  useEffect(() => {
    if (!used.includes(recoverTarget as Comodin)) setRecoverTarget(used[0] ?? "");
  }, [used.join(","), recoverTarget]);

  // Si deja de poder plantarse, cerrar la confirmación.
  useEffect(() => {
    if (!state.can_retire) setConfirmRetire(false);
  }, [state.can_retire]);

  return (
    <section className="panel comodines-panel">
      <h2>
        Comodines · aciertos {state.correct_answers} · asegurado 🔒 {state.safety_net}
      </h2>

      <div className="comodin-buttons">
        {COMODINES.map((c) => {
          const status = state.comodines[c];
          return (
            <button
              key={c}
              className={`comodin-btn status-${status.toLowerCase()}`}
              disabled={status !== "Available" || !live || active !== null}
              onClick={() => send({ action: "use_comodin", payload: { comodin: c } })}
              title={status}
            >
              {COMODIN_INFO[c].icon} {COMODIN_INFO[c].label}
              <small>{status === "Used" ? "gastado" : status === "Active" ? "en curso" : "disponible"}</small>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="comodin-active">
          <span>
            {COMODIN_INFO[active].icon} <strong>{COMODIN_INFO[active].title}</strong>
            {state.comodin_time_remaining !== null &&
              (state.comodin_time_remaining === 0 ? " · ⏰ ¡tiempo!" : ` · ${state.comodin_time_remaining}s`)}
          </span>
          {active === "Chat" && <ChatVotesSummary state={state} />}
          <button className="ok" onClick={() => send({ action: "resolve_comodin", payload: { keep: true } })}>
            Cerrar y usar
          </button>
          <button className="secondary" onClick={() => send({ action: "resolve_comodin", payload: { keep: false } })}>
            Cancelar
          </button>
        </div>
      )}

      <div className="hitos">
        <div className="hito">
          <span>Hito pregunta 8 · recuperar comodín: {HITO_LABEL[state.hito_8]}</span>
          {state.hito_8 === "Available" && (
            <>
              <select name="recoverTarget" value={recoverTarget} onChange={(e) => setRecoverTarget(e.target.value as Comodin)}>
                {used.length === 0 && <option value="">(ningún comodín gastado)</option>}
                {used.map((c) => (
                  <option key={c} value={c}>{COMODIN_INFO[c].icon} {COMODIN_INFO[c].label}</option>
                ))}
              </select>
              <button
                disabled={!recoverTarget}
                onClick={() => recoverTarget && send({ action: "use_hito", payload: { hito: "recover", comodin: recoverTarget } })}
              >
                Recuperar
              </button>
            </>
          )}
        </div>
        <div className="hito">
          <span>Hito pregunta 11 · cambiar pregunta: {HITO_LABEL[state.hito_11]}</span>
          {state.hito_11 === "Available" && (
            <button disabled={!live || active !== null} onClick={() => send({ action: "use_hito", payload: { hito: "change_question" } })}>
              Cambiar pregunta
            </button>
          )}
        </div>
      </div>

      <div className="retire">
        {!confirmRetire ? (
          <button className="danger" disabled={!state.can_retire} onClick={() => setConfirmRetire(true)}>
            🏳️ Me cago (Plantarse)
          </button>
        ) : (
          <>
            <span>
              ¿Seguro? Se lleva sus <strong>{state.correct_answers}</strong> aciertos (si falla, bajaría a {state.safety_net}).
            </span>
            <button className="danger" onClick={() => send({ action: "retire", payload: { phrase: "me cago" } })}>
              Sí, se planta
            </button>
            <button className="secondary" onClick={() => setConfirmRetire(false)}>No</button>
          </>
        )}
        {state.phase === "Retired" && <span>🏳️ Se ha plantado con {state.prize_level} aciertos.</span>}
      </div>
    </section>
  );
}
