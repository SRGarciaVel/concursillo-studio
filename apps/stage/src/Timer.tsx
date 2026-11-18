import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { prefersReducedMotion } from "@concursillo/ui";
import type { GameState } from "@concursillo/shared-types";

const DANGER_SECONDS = 5;
const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Reloj circular animado con anime.js:
 * - el anillo SVG se "dibuja" suavemente hacia el nuevo valor en cada segundo;
 * - el número da un pequeño latido al cambiar;
 * - por debajo de 5 s vibra (shake sutil) y pasa a rojo.
 */
export function Timer({ state }: { state: GameState }) {
  const { time_remaining: left, time_limit: limit, timer_paused: paused } = state;
  const root = useRef<HTMLDivElement>(null);
  const bar = useRef<SVGCircleElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const progress = limit > 0 ? left / limit : 0;
  const danger = left < DANGER_SECONDS;

  // Anillo: anima el trazo hasta la nueva posición (sin saltos).
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const target = CIRCUMFERENCE * (1 - progress);
    if (prefersReducedMotion()) {
      el.style.strokeDashoffset = String(target);
      return;
    }
    const a = animate(el, { strokeDashoffset: target, duration: 900, ease: "outQuart" });
    return () => void a.pause();
  }, [progress]);

  // Número y vibración: cada vez que cambia el segundo.
  useEffect(() => {
    if (prefersReducedMotion() || paused) return;
    const anims: { pause: () => unknown }[] = [];
    if (value.current) anims.push(animate(value.current, { scale: [1.22, 1], duration: 450, ease: "outBack(2)" }));
    if (danger && left > 0 && root.current) {
      anims.push(animate(root.current, { translateX: [0, -6, 6, -4, 4, -2, 0], rotate: [0, -2, 2, -1, 1, 0], duration: 420, ease: "inOutSine" }));
    }
    return () => anims.forEach((a) => a.pause());
  }, [left, danger, paused]);

  return (
    <div ref={root} className={`timer${danger ? " danger" : ""}${paused ? " paused" : ""}`} role="timer" aria-label={`${left} segundos`}>
      <svg viewBox="0 0 120 120">
        <circle className="timer-track" cx="60" cy="60" r={RADIUS} />
        {/* El offset lo controla anime.js (estilo en línea); React solo pone el valor inicial constante. */}
        <circle ref={bar} className="timer-bar" cx="60" cy="60" r={RADIUS} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={CIRCUMFERENCE} />
      </svg>
      {/* Con 3 cifras (rosco de 150 s) el número se reduce para no salirse del anillo. */}
      <span className={`timer-value${!paused && left >= 100 ? " digits-3" : ""}`}>
        <span ref={value} className="timer-num">{paused ? "⏸" : left}</span>
      </span>
    </div>
  );
}
