import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, Info, OctagonX, X } from "lucide-react";
import { cn } from "./cn";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

export interface ToastApi {
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Los errores duran más: el streamer puede estar mirando el directo. */
const DURATION: Record<ToastKind, number> = { success: 2800, info: 3500, error: 7000 };
const MAX_VISIBLE = 4;

const STYLES: Record<ToastKind, { box: string; icon: typeof Info }> = {
  success: { box: "border-emerald-500/40 text-emerald-100 shadow-glow-emerald", icon: CircleCheck },
  error: { box: "border-rose-500/50 text-rose-100 shadow-glow-rose", icon: OctagonX },
  info: { box: "border-sky-500/40 text-sky-100", icon: Info },
};

/**
 * Notificaciones flotantes (abajo a la derecha) para toda la app.
 * Envuelve cada vista una vez (main.tsx) y usa `useToast()` donde haga falta.
 * Mensajes repetidos seguidos no se apilan: se renueva el existente.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const id = ++nextId.current;
      setItems((list) => [...list.filter((t) => !(t.kind === kind && t.text === text)), { id, kind, text }].slice(-MAX_VISIBLE));
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach(clearTimeout);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (t) => push("success", t), error: (t) => push("error", t), info: (t) => push("info", t) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live: los lectores de pantalla anuncian cada aviso sin mover el foco. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
        <AnimatePresence initial={false}>
          {items.map(({ id, kind, text }) => {
            const { box, icon: Icon } = STYLES[kind];
            return (
              <motion.div
                key={id}
                layout
                role={kind === "error" ? "alert" : "status"}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className={cn(
                  "pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-zinc-900/95 px-3.5 py-2.5 text-sm backdrop-blur-md",
                  box,
                )}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <p className="min-w-0 flex-1 break-words">{text}</p>
                <button
                  type="button"
                  aria-label="Cerrar aviso"
                  onClick={() => dismiss(id)}
                  className="-mr-1 rounded-md p-0.5 text-zinc-400 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Lanza avisos: `toast.success("Guardado")`, `toast.error(msg)`, `toast.info(msg)`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() necesita un <ToastProvider> por encima");
  return ctx;
}
