import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Raíz de animaciones de cada app. `reducedMotion="user"`: si el sistema tiene
 * activado "reducir movimiento", Motion desactiva los desplazamientos y escalas
 * (y deja solo cambios de opacidad), sin tocar cada componente.
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** ¿El usuario pidió reducir el movimiento? (para animaciones fuera de Motion: anime.js, confeti). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
