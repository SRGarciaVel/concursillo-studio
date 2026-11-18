import { COMODINES, COMODIN_INFO } from "@concursillo/ui";
import { motion, type TargetAndTransition } from "motion/react";
import type { Comodin, GameState } from "@concursillo/shared-types";
import { TimeUpFlash } from "./TimeUpFlash";

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
              {/* `key` por valor: cada voto nuevo hace "saltar" el número. */}
              <span key={count} className={count > 0 ? "vote-num bump" : "vote-num"}>{count}</span>
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

/** Pose inicial de la entrada 3D de cada comodín. */
const ENTRY: Record<Comodin, TargetAndTransition> = {
  Chat: { opacity: 0, rotateX: -95, scale: 0.85, y: -60 },
  Ruleta: { opacity: 0, rotateY: 180, scale: 0.4, y: 0 },
  Llamada: { opacity: 0, scale: 0.55, y: -30 },
  Sacrificio: { opacity: 0, scale: 0.55, y: -30 },
};

/** Capa sobre el stage mientras hay un comodín activo. */
export function ComodinOverlay({ state }: { state: GameState }) {
  const comodin = state.active_comodin;
  if (!comodin) return null;
  const info = COMODIN_INFO[comodin];
  const left = state.comodin_time_remaining;
  const limit = state.comodin_time_limit;
  const expired = left === 0;
  const danger = left !== null && left > 0 && left <= 5;

  const countdown =
    left !== null ? <div className={`comodin-countdown${danger ? " danger" : ""}`}>{left}</div> : null;
  const progress =
    left !== null && limit ? (
      <div className="comodin-progress">
        <div className="comodin-progress-bar" style={{ width: `${(left / limit) * 100}%` }} />
      </div>
    ) : null;

  return (
    <>
      <div className={`comodin-overlay comodin-${comodin.toLowerCase()}${expired ? " expired" : ""}`} role="status">
        <motion.div
          className="comodin-card"
          // Entrada 3D: el chat cae "abatiéndose" (flip X); la ruleta gira sobre Y con zoom; el resto, zoom.
          initial={ENTRY[comodin]}
          animate={{ opacity: 1, rotateX: 0, rotateY: 0, scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 170, damping: 17, mass: 0.9 }}
          style={{ transformPerspective: 1400 }}
        >
          {comodin === "Chat" ? (
            // Chat: una sola fila (icono · título · reloj) para dejar sitio a las barras.
            <>
              <div className="comodin-head">
                <div className="comodin-icon">{info.icon}</div>
                <div>
                  <div className="comodin-title">{info.title}</div>
                  <div className="comodin-subtitle">{info.subtitle(limit)}</div>
                </div>
                {countdown}
              </div>
              {progress}
              <ChatVoteBars state={state} />
            </>
          ) : (
            <>
              <div className="comodin-icon">{info.icon}</div>
              <div className="comodin-title">{info.title}</div>
              <div className="comodin-subtitle">{info.subtitle(limit)}</div>
              {comodin === "Ruleta" && <Ruleta />}
              {countdown}
              {progress}
            </>
          )}
          {state.timer_paused && <div className="comodin-paused">⏸ En pausa</div>}
        </motion.div>
      </div>
      {expired && <TimeUpFlash key={`comodin-${comodin}`} />}
    </>
  );
}
