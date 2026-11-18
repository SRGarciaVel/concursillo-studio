import { useEffect, useState, type ComponentType } from "react";
import { Check, Dices, Hourglass, Lock, MessagesSquare, Phone, RefreshCw, Shuffle, Sparkles, Target, Undo2, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Badge, Button, Card, PRESS_SPRING, RollingNumber, Select, cn, COMODINES, COMODIN_INFO, type BadgeVariant } from "@concursillo/ui";
import type { ClientCommand, Comodin, ComodinStatus, GameState, HitoStatus } from "@concursillo/shared-types";

interface Props {
  state: GameState;
  send: (cmd: ClientCommand) => void;
}

const ICONS: Record<Comodin, ComponentType<{ className?: string }>> = {
  Chat: MessagesSquare,
  Llamada: Phone,
  Sacrificio: Target,
  Ruleta: Dices,
};

const STATUS: Record<ComodinStatus, { label: string; variant: BadgeVariant }> = {
  Available: { label: "Disponible", variant: "success" },
  Active: { label: "En uso", variant: "warning" },
  Used: { label: "Gastado", variant: "neutral" },
};

const HITO: Record<HitoStatus, { label: string; variant: BadgeVariant }> = {
  Locked: { label: "Bloqueado", variant: "neutral" },
  Available: { label: "Disponible", variant: "accent" },
  Used: { label: "Usado", variant: "neutral" },
};

/** Votos del chat en directo, para el presentador. */
function ChatVotes({ state }: { state: GameState }) {
  const v = state.chat_votes;
  if (!v || (state.twitch.status !== "Connected" && v.a + v.b + v.c + v.d === 0)) {
    return <p className="text-xs text-zinc-500">Twitch no conectado: sin votos.</p>;
  }
  const counts = [v.a, v.b, v.c, v.d];
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  return (
    <div className="grid grid-cols-4 gap-2">
      {["A", "B", "C", "D"].map((l, i) => {
        const leader = max > 0 && counts[i] === max;
        const pct = total ? (counts[i] / total) * 100 : 0;
        return (
          <div key={l} className={cn("relative overflow-hidden rounded-lg border px-2 py-1 text-center", leader ? "border-emerald-400/60" : "border-line")}>
            <div className={cn("absolute inset-x-0 bottom-0 transition-[height] duration-300", leader ? "bg-emerald-500/25" : "bg-white/5")} style={{ height: `${pct}%` }} />
            <div className="relative text-xs font-bold text-zinc-400">{l}</div>
            <div className={cn("relative font-display text-lg font-black", leader && "text-emerald-300")}>
              <RollingNumber value={counts[i]} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Comodines (tarjetas cuadradas con estado) e hitos de las preguntas 8 y 11. Solo Millonario. */
export function ComodinesCard({ state, send }: Props) {
  const [recoverTarget, setRecoverTarget] = useState<Comodin | "">("");
  // Todos los hooks antes de cualquier `return` (el de Rosco incluido).
  const still = useReducedMotion() === true;
  const used = COMODINES.filter((c) => state.comodines[c] === "Used");

  // Mantener el selector de "recuperar" apuntando a un comodín gastado.
  useEffect(() => {
    if (!used.includes(recoverTarget as Comodin)) setRecoverTarget(used[0] ?? "");
  }, [used.join(","), recoverTarget]);

  if (state.rosco) {
    return (
      <Card compact title="Comodines" icon={Sparkles}>
        <p className="text-sm text-zinc-500">Los comodines y los hitos solo existen en el modo Millonario.</p>
      </Card>
    );
  }

  const live = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const active = state.active_comodin;
  const left = state.comodin_time_remaining;

  return (
    <Card
      compact
      title="Comodines"
      icon={Sparkles}
      tone={active ? "warning" : "default"}
      actions={
        <span className="text-xs text-zinc-500">
          {state.correct_answers} aciertos · <Lock className="inline size-3" /> {state.safety_net}
        </span>
      }
    >
      <div className="grid grid-cols-4 gap-2">
        {COMODINES.map((c) => {
          const status = state.comodines[c];
          const Icon = ICONS[c];
          const usable = status === "Available" && live && active === null;
          return (
            <motion.button
              key={c}
              type="button"
              disabled={!usable}
              whileHover={usable && !still ? { y: -2 } : undefined}
              whileTap={usable && !still ? { scale: 0.93 } : undefined}
              transition={PRESS_SPRING}
              onClick={() => send({ action: "use_comodin", payload: { comodin: c } })}
              title={`${COMODIN_INFO[c].title}: ${STATUS[status].label}`}
              className={cn(
                "group relative flex h-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl border p-1.5 text-center",
                "transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                status === "Available" && "border-brand-500/30 bg-gradient-to-b from-brand-500/15 to-transparent",
                status === "Available" && usable && "hover:border-brand-400 hover:shadow-glow-brand",
                status === "Active" && "border-amber-400/70 bg-amber-400/15 shadow-glow-amber",
                status === "Used" && "border-line bg-zinc-950/40 opacity-50",
                !usable && status === "Available" && "cursor-not-allowed",
              )}
            >
              <Icon className={cn("size-6", status === "Active" ? "text-amber-300" : status === "Used" ? "text-zinc-600" : "text-brand-400")} />
              <span className={cn("text-sm font-bold", status === "Used" && "line-through")}>{COMODIN_INFO[c].label}</span>
              <Badge variant={STATUS[status].variant} className="text-[10px]">
                {STATUS[status].label}
              </Badge>
            </motion.button>
          );
        })}
      </div>

      {active && (
        <div className="mt-2 animate-pop rounded-xl border border-amber-400/40 bg-amber-400/10 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-amber-100">{COMODIN_INFO[active].title}</span>
            {left !== null && (
              <Badge variant={left === 0 ? "danger" : "warning"} dot={left === 0 ? true : "pulse"}>
                <Hourglass className="size-3" /> {left === 0 ? "¡Tiempo!" : <><RollingNumber value={left} />s</>}
              </Badge>
            )}
          </div>
          {active === "Chat" && (
            <div className="mb-2">
              <ChatVotes state={state} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" icon={Check} onClick={() => send({ action: "resolve_comodin", payload: { keep: true } })}>
              Cerrar y usar
            </Button>
            <Button variant="secondary" icon={X} onClick={() => send({ action: "resolve_comodin", payload: { keep: false } })}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Hitos. */}
      <div className="mt-2 grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-zinc-950/40 px-2.5 py-1">
          <Undo2 className="size-4 text-brand-400" />
          <span className="text-xs font-medium">Pregunta 8 · Recuperar comodín</span>
          <Badge variant={HITO[state.hito_8].variant} className="ml-auto">
            {HITO[state.hito_8].label}
          </Badge>
          {state.hito_8 === "Available" && (
            <div className="flex w-full animate-fade-in gap-2">
              <Select name="recoverTarget" className="min-w-0 flex-1" value={recoverTarget} onChange={(e) => setRecoverTarget(e.target.value as Comodin)}>
                {used.length === 0 && <option value="">Ningún comodín gastado</option>}
                {used.map((c) => (
                  <option key={c} value={c}>{COMODIN_INFO[c].label}</option>
                ))}
              </Select>
              <Button
                variant="primary"
                icon={RefreshCw}
                disabled={!recoverTarget}
                onClick={() => recoverTarget && send({ action: "use_hito", payload: { hito: "recover", comodin: recoverTarget } })}
              >
                Recuperar
              </Button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-zinc-950/40 px-2.5 py-1">
          <Shuffle className="size-4 text-brand-400" />
          <span className="text-xs font-medium">Pregunta 11 · Cambiar pregunta</span>
          <Badge variant={HITO[state.hito_11].variant} className="ml-auto">
            {HITO[state.hito_11].label}
          </Badge>
          {state.hito_11 === "Available" && (
            <Button
              variant="primary"
              icon={Shuffle}
              fullWidth
              className="animate-fade-in"
              disabled={!live || active !== null}
              onClick={() => send({ action: "use_hito", payload: { hito: "change_question" } })}
            >
              Cambiar pregunta
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
