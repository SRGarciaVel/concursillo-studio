import type { GameState } from "@concursillo/shared-types";

const DANGER_SECONDS = 5;

export function Timer({ state }: { state: GameState }) {
  const { time_remaining: left, time_limit: limit, timer_paused: paused } = state;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = limit > 0 ? left / limit : 0;
  const danger = left < DANGER_SECONDS;
  return (
    <div className={`timer${danger ? " danger" : ""}${paused ? " paused" : ""}`} role="timer" aria-label={`${left} segundos`}>
      <svg viewBox="0 0 120 120">
        <circle className="timer-track" cx="60" cy="60" r={radius} />
        <circle
          className="timer-bar"
          cx="60"
          cy="60"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span className="timer-value">{paused ? "⏸" : left}</span>
    </div>
  );
}
