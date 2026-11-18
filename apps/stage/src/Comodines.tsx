import { COMODINES, COMODIN_INFO } from "@concursillo/ui";
import type { GameState } from "@concursillo/shared-types";

/** Fila de los 4 comodines (los gastados aparecen tachados). */
export function ComodinBar({ state }: { state: GameState }) {
  return (
    <div className="comodin-bar">
      {COMODINES.map((c) => (
        <span key={c} className={`comodin-chip status-${state.comodines[c].toLowerCase()}`} title={COMODIN_INFO[c].label}>
          {COMODIN_INFO[c].icon}
        </span>
      ))}
    </div>
  );
}

const WHEEL_SEGMENTS = 8;

function Ruleta() {
  return (
    <div className="ruleta" aria-hidden>
      <div className="ruleta-pointer" />
      <div className="ruleta-wheel">
        {Array.from({ length: WHEEL_SEGMENTS }, (_, i) => (
          <span key={i} className="ruleta-label" style={{ transform: `rotate(${(360 / WHEEL_SEGMENTS) * (i + 0.5)}deg) translateY(-95px)` }}>
            ?
          </span>
        ))}
      </div>
    </div>
  );
}

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

/** Barras de votos del chat en tiempo real. La(s) más votada(s) brillan. */
function ChatVoteBars({ state }: { state: GameState }) {
  const votes = state.chat_votes;
  const answers = state.current_question?.answers ?? [];
  const connected = state.twitch.status === "Connected";
  if (!votes) return null;
  const counts = [votes.a, votes.b, votes.c, votes.d].slice(0, Math.min(answers.length, 4));
  const total = counts.reduce((a, b) => a + b, 0);
  if (!connected && total === 0) return null; // sin Twitch no hay nada que enseñar
  const max = Math.max(0, ...counts);

  return (
    <div className="vote-bars">
      {counts.map((count, i) => {
        const pct = total > 0 ? (count / total) * 100 : 0;
        const leader = max > 0 && count === max;
        return (
          <div key={i} className={`vote-row${leader ? " leader" : ""}`}>
            <span className="vote-letter">{OPTION_LETTERS[i]}</span>
            <div className="vote-track">
              <div className="vote-fill" style={{ width: `${pct}%` }} />
              <span className="vote-answer">{answers[i]}</span>
            </div>
            <span className="vote-count">
              {count}
              <small>{Math.round(pct)}%</small>
            </span>
          </div>
        );
      })}
      <div className="vote-total">
        {total} {total === 1 ? "voto" : "votos"}
        {state.twitch.channel && connected ? ` · #${state.twitch.channel}` : ""}
      </div>
    </div>
  );
}

/** Capa sobre el stage mientras hay un comodín activo. */
export function ComodinOverlay({ state }: { state: GameState }) {
  const comodin = state.active_comodin;
  if (!comodin) return null;
  const info = COMODIN_INFO[comodin];
  const left = state.comodin_time_remaining;
  const limit = state.comodin_time_limit;
  const expired = left === 0;
  const danger = left !== null && left > 0 && left <= 5;

  return (
    <div className={`comodin-overlay comodin-${comodin.toLowerCase()}${expired ? " expired" : ""}`} role="status">
      <div className="comodin-card">
        <div className="comodin-icon">{info.icon}</div>
        <div className="comodin-title">{info.title}</div>
        <div className="comodin-subtitle">{info.subtitle(limit)}</div>
        {comodin === "Ruleta" && <Ruleta />}
        {comodin === "Chat" && <ChatVoteBars state={state} />}
        {left !== null && (
          <div className={`comodin-countdown${danger ? " danger" : ""}`}>{expired ? "¡TIEMPO!" : left}</div>
        )}
        {left !== null && limit ? (
          <div className="comodin-progress">
            <div className="comodin-progress-bar" style={{ width: `${(left / limit) * 100}%` }} />
          </div>
        ) : null}
        {state.timer_paused && <div className="comodin-paused">⏸ En pausa</div>}
      </div>
    </div>
  );
}
