import { useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "./cn";

/**
 * Número que "rueda" hacia su nuevo valor: el viejo sale por arriba y el nuevo
 * entra por abajo (o al revés si baja). Cada dígito rueda por separado, así en
 * 29 → 28 solo se mueve el último.
 */
export function RollingNumber({ value, className }: { value: number | string; className?: string }) {
  const text = String(value);
  const prev = useRef(text);
  // Dirección: sube (+1) si el valor crece, baja (-1) si decrece.
  const dir = Number(text) >= Number(prev.current) ? 1 : -1;
  prev.current = text;
  // Alinear a la derecha para que las unidades sigan siendo la misma "columna".
  const chars = text.split("");

  return (
    <span className={cn("inline-flex tabular-nums", className)} aria-label={text}>
      {chars.map((ch, i) => {
        const pos = chars.length - i; // posición desde la derecha
        return (
          <span key={pos} className="relative inline-block overflow-hidden" aria-hidden>
            {/* Reserva el ancho del carácter actual. */}
            <span className="invisible">{ch}</span>
            <AnimatePresence initial={false} custom={dir}>
              <motion.span
                key={ch}
                custom={dir}
                className="absolute inset-0 text-center"
                variants={{
                  enter: (d: number) => ({ y: d > 0 ? "70%" : "-70%", opacity: 0, filter: "blur(2px)" }),
                  center: { y: "0%", opacity: 1, filter: "blur(0px)" },
                  exit: (d: number) => ({ y: d > 0 ? "-70%" : "70%", opacity: 0, filter: "blur(2px)" }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.7 }}
              >
                {ch}
              </motion.span>
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}
