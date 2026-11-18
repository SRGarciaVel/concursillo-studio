import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ScrollText } from "lucide-react";
import { Badge, Button, cn } from "@concursillo/ui";

export interface LogEntry {
  id: number;
  time: string;
  /** sent: comando enviado · fail: no se pudo enviar · info: aviso local · error: error del motor */
  kind: "sent" | "fail" | "info" | "error";
  text: string;
}

const KIND = {
  sent: { mark: "→", cls: "text-zinc-300" },
  info: { mark: "•", cls: "text-sky-300" },
  fail: { mark: "✗", cls: "text-amber-300" },
  error: { mark: "✗", cls: "text-rose-400" },
};

const STORAGE_KEY = "concursillo.control.logOpen";

function readOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Registro de eventos plegable. Plegado ocupa una sola línea (para no hacer
 * scroll a 720p) pero sigue mostrando el último evento y si hay errores sin ver.
 */
export function LogCard({ entries, onClear, className }: { entries: LogEntry[]; onClear: () => void; className?: string }) {
  const [open, setOpen] = useState(readOpen);
  // Errores que han llegado con el registro plegado.
  const [unseenErrors, setUnseenErrors] = useState(0);
  const last = entries[0];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* almacenamiento no disponible: no pasa nada */
    }
    if (open) setUnseenErrors(0);
  }, [open]);

  useEffect(() => {
    if (!open && last?.kind === "error") setUnseenErrors((n) => n + 1);
  }, [last?.id]);

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-line bg-surface shadow-xl shadow-black/30 backdrop-blur-md",
        open && "flex-1",
        className,
      )}
    >
      <header className="flex min-h-10 items-center gap-2 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
        >
          <ScrollText className="size-4 shrink-0 text-brand-400" />
          <span className="shrink-0 text-sm font-semibold text-zinc-200">Registro</span>
          <Badge className="text-[10px]">{entries.length}</Badge>
          {unseenErrors > 0 && (
            <Badge variant="danger" dot="pulse" className="text-[10px]">
              {unseenErrors} {unseenErrors === 1 ? "error" : "errores"}
            </Badge>
          )}
          {!open && last && (
            // Plegado: el último evento entra deslizándose desde la izquierda.
            <motion.span
              key={last.id}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("min-w-0 truncate font-mono text-[11px]", KIND[last.kind].cls)}
            >
              {KIND[last.kind].mark} {last.text}
            </motion.span>
          )}
          <ChevronDown className={cn("ml-auto size-4 shrink-0 text-zinc-500 transition-transform duration-200", open && "rotate-180")} />
        </button>
        {open && (
          <Button variant="ghost" size="sm" onClick={onClear} disabled={entries.length === 0}>
            Limpiar
          </Button>
        )}
      </header>
      {open && (
        <ol className="min-h-24 flex-1 animate-fade-in overflow-y-auto border-t border-line px-3 py-2 font-mono text-[11.5px] leading-relaxed" aria-live="polite">
          {entries.length === 0 && <li className="text-zinc-600">Sin eventos todavía.</li>}
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <motion.li
                key={e.id}
                layout="position"
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className={cn("flex gap-2", KIND[e.kind].cls)}
              >
                <span className="shrink-0 text-zinc-600">{e.time}</span>
                <span className="shrink-0">{KIND[e.kind].mark}</span>
                <span className="min-w-0 break-words">{e.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}
