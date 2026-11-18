import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";
import type { GameState } from "@concursillo/shared-types";

/** Colores del tema activo (variables CSS ya inyectadas en :root). */
function themeColors(): string[] {
  const css = getComputedStyle(document.documentElement);
  return ["--stage-accent", "--stage-correct", "--stage-border", "--stage-selected", "--stage-text"]
    .map((v) => css.getPropertyValue(v).trim())
    .filter((c) => /^#|^rgb|^hsl|^oklch/.test(c));
}

const BASE = { disableForReducedMotion: true, zIndex: 25, ticks: 220, scalar: 1.1 } as const;

/** Explosión desde el centro de la pantalla (respuesta correcta). */
export function burst(power = 1) {
  const colors = themeColors();
  void confetti({ ...BASE, colors, particleCount: Math.round(130 * power), spread: 85, startVelocity: 48 * Math.sqrt(power), origin: { x: 0.5, y: 0.55 } });
  void confetti({ ...BASE, colors, particleCount: Math.round(60 * power), spread: 140, startVelocity: 30, decay: 0.92, origin: { x: 0.5, y: 0.55 }, shapes: ["star"] });
}

/** Gran celebración (partida ganada): explosión central + cañones laterales ~1,8 s. */
export function grandFinale() {
  burst(1.4);
  const colors = themeColors();
  const end = Date.now() + 1800;
  const frame = () => {
    void confetti({ ...BASE, colors, particleCount: 6, angle: 60, spread: 60, startVelocity: 60, origin: { x: 0, y: 0.75 } });
    void confetti({ ...BASE, colors, particleCount: 6, angle: 120, spread: 60, startVelocity: 60, origin: { x: 1, y: 0.75 } });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const LIVE = new Set(["ReadingQuestion", "Selecting"]);

/**
 * Dispara el confeti al REVELAR un acierto (no al cargar el stage a mitad de
 * partida): compara con el estado anterior.
 * - Millonario: pregunta en juego → acierto revelado (o victoria).
 * - Rosco: sube el contador de aciertos (pequeño) o se gana el rosco (grande).
 */
export function useCelebrations(state: GameState | null) {
  const prev = useRef<GameState | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = state;
    if (!before || !state) return;

    if (state.phase === "Won" && before.phase !== "Won") {
      grandFinale();
      return;
    }
    if (state.rosco && before.rosco) {
      if (state.rosco.total_correct > before.rosco.total_correct) burst(0.45);
      return;
    }
    if (LIVE.has(before.phase) && state.phase === "Answering" && state.is_correct) burst(1);
  }, [state]);
}
