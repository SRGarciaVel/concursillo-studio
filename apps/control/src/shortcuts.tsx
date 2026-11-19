import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Keyboard, X } from "lucide-react";
import { cn } from "@concursillo/ui";
import type { ClientCommand, GameState } from "@concursillo/shared-types";

/** Tabla de atajos (la misma que se enseña en el modal de ayuda). */
export const SHORTCUTS: { group: string; items: { keys: string[]; label: string }[] }[] = [
  {
    group: "Millonario",
    items: [
      { keys: ["1–4", "A–D"], label: "Marcar la respuesta del concursante (se puede cambiar)" },
      { keys: ["Enter"], label: "Revelar la respuesta marcada" },
      { keys: ["N"], label: "Siguiente pregunta (y siguiente ronda tras acertar)" },
    ],
  },
  {
    group: "Rosco",
    items: [
      { keys: ["N"], label: "Empezar el rosco" },
      { keys: ["R"], label: "Acertó" },
      { keys: ["F"], label: "Falló" },
      { keys: ["P"], label: "Pasapalabra" },
    ],
  },
  {
    group: "Siempre",
    items: [
      { keys: ["Espacio"], label: "Pausar / reanudar el reloj" },
      { keys: ["Esc"], label: "Cancelar el comodín activo o cerrar esta ayuda" },
      { keys: ["?"], label: "Mostrar u ocultar esta ayuda" },
    ],
  },
];

/** ¿El foco está en un campo donde se escribe? Ahí los atajos no deben actuar. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** ¿El foco está en un control que ya reacciona a Enter/Espacio (navegación con Tab)? */
function isActivatable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && el !== document.body && !!el.closest("button, a, [role='radio'], [role='tab'], label");
}

const ANSWER_KEYS: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };

/**
 * Atajos de teclado del directo. Solo envían comandos que el estado actual
 * admite (si no, no hacen nada): el backend sigue siendo quien decide.
 */
export function useLiveShortcuts({
  state,
  online,
  send,
  helpOpen,
  setHelpOpen,
}: {
  state: GameState | null;
  online: boolean;
  send: (cmd: ClientCommand) => void;
  helpOpen: boolean;
  setHelpOpen: (open: boolean | ((o: boolean) => boolean)) => void;
}) {
  // Refs: el listener se registra una vez y siempre ve el estado más reciente.
  const latest = useRef({ state, online, send, helpOpen });
  latest.current = { state, online, send, helpOpen };

  useEffect(() => {
    // Tras un clic con ratón, el botón no se queda con el foco: así Enter/Espacio
    // siguen siendo atajos (y no "volver a pulsar el último botón"). Con teclado
    // (Tab + Enter) el foco se conserva, como debe ser.
    const onClick = (e: MouseEvent) => {
      if (e.detail > 0 && document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const { state: s, online: on, send: cmd, helpOpen: help } = latest.current;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (key === "?") {
        e.preventDefault();
        setHelpOpen((o) => !o);
        return;
      }
      if (key === "Escape") {
        if (help) setHelpOpen(false);
        else if (s?.active_comodin && on) cmd({ action: "resolve_comodin", payload: { keep: false } });
        return;
      }
      if (help || !s || !on) return;

      // Enter y Espacio respetan el control enfocado (navegación con Tab).
      if ((key === "Enter" || key === " ") && isActivatable(e.target)) return;

      const live = s.phase === "ReadingQuestion" || s.phase === "Selecting";
      const act = (c: ClientCommand) => {
        e.preventDefault();
        cmd(c);
      };

      if (key === " ") {
        if (live) act({ action: s.timer_paused ? "resume_timer" : "pause_timer" });
        return;
      }

      if (s.rosco) {
        if (key === "n" && s.phase === "Idle") act({ action: "load_next_question" });
        else if (key === "r" && live) act({ action: "rosco_answer", payload: { is_correct: true } });
        else if (key === "f" && live) act({ action: "rosco_answer", payload: { is_correct: false } });
        else if (key === "p" && live) act({ action: "rosco_pass" });
        return;
      }

      // Millonario.
      const q = s.current_question;
      if (key in ANSWER_KEYS) {
        const i = ANSWER_KEYS[key];
        if (live && q && i < q.answers.length && !s.active_comodin) act({ action: "select_answer", payload: i });
      } else if (key === "Enter") {
        if (s.phase === "Selecting" && !s.active_comodin) act({ action: "reveal_answer" });
      } else if (key === "n") {
        if (s.phase === "Answering") {
          // Tras acertar: siguiente ronda y su pregunta, de una vez.
          e.preventDefault();
          cmd({ action: "next_round" });
          cmd({ action: "load_next_question" });
        } else if (s.phase === "Idle" && s.current_question_index < s.total_questions) {
          act({ action: "load_next_question" });
        }
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
    };
  }, [setHelpOpen]);
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-7 items-center justify-center rounded-md border border-white/15 border-b-white/5 bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-zinc-100 shadow-[inset_0_-2px_0_rgb(0_0_0/0.4)]">
      {children}
    </kbd>
  );
}

/** Botón flotante (abajo a la izquierda) y modal con la lista de atajos. */
export function ShortcutsHelp({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const [opener, setOpener] = useState<HTMLElement | null>(null);

  // Al abrir, el foco va al botón de cerrar; al cerrar, vuelve a donde estaba.
  useEffect(() => {
    if (open) {
      setOpener(document.activeElement as HTMLElement | null);
      requestAnimationFrame(() => close.current?.focus());
    } else {
      opener?.focus?.();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Atajos de teclado"
        title="Atajos de teclado (?)"
        className={cn(
          "fixed bottom-2 left-3 z-40 inline-flex items-center gap-1.5 rounded-full border border-line bg-zinc-900/90 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 shadow-lg backdrop-blur",
          "hover:border-brand-500/50 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
        )}
      >
        <Keyboard className="size-3.5" /> Atajos <Kbd>?</Kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="shortcuts"
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="shortcuts-title"
              initial={{ y: 16, scale: 0.97 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-2xl shadow-black/60"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 id="shortcuts-title" className="flex items-center gap-2 text-base font-bold">
                  <Keyboard className="size-5 text-brand-400" /> Atajos de teclado
                </h2>
                <button
                  ref={close}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar"
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-4">
                {SHORTCUTS.map(({ group, items }) => (
                  <section key={group}>
                    <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{group}</h3>
                    <ul className="grid gap-1.5">
                      {items.map(({ keys, label }) => (
                        <li key={label} className="flex items-center justify-between gap-4 text-sm text-zinc-200">
                          <span>{label}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {keys.map((k, i) => (
                              <span key={k} className="flex items-center gap-1">
                                {i > 0 && <span className="text-[10px] text-zinc-500">o</span>}
                                <Kbd>{k}</Kbd>
                              </span>
                            ))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <p className="mt-4 text-xs text-zinc-500">
                Los atajos no actúan mientras escribes en un campo. Con Tab + Enter puedes seguir usando cualquier botón.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
