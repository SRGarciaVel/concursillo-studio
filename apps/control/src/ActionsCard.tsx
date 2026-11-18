import { useEffect, useState } from "react";
import { AudioLines, Check, ChevronRight, CircleX, Drum, PartyPopper, Pause, Play, RotateCcw, SkipForward, Siren, Sparkles, Swords, X, Zap } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button, Card, cn } from "@concursillo/ui";
import type { ClientCommand, GameState, Sound } from "@concursillo/shared-types";

interface Props {
  state: GameState | null;
  online: boolean;
  send: (cmd: ClientCommand) => void;
}

/** "Me cago": interruptor de emergencia (con confirmación en dos pasos). */
function PanicButton({ state, send }: { state: GameState; send: (cmd: ClientCommand) => void }) {
  const [confirming, setConfirming] = useState(false);
  const armed = state.can_retire;
  const still = useReducedMotion() === true;
  useEffect(() => {
    if (!armed) setConfirming(false);
  }, [armed]);

  return (
    <AnimatePresence mode="wait" initial={false}>
      {confirming ? (
        <motion.div
          key="confirm"
          initial={{ opacity: 0, rotateX: -70, y: -6 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          exit={{ opacity: 0, rotateX: 70, y: 6 }}
          transition={{ type: "spring", stiffness: 380, damping: 26 }}
          style={{ transformPerspective: 600 }}
          className="rounded-xl border-2 border-rose-500/60 bg-rose-500/10 p-2.5 shadow-glow-rose"
        >
          <p className="mb-2 text-sm text-rose-100">
            ¿Seguro? Se lleva sus <strong className="text-white">{state.correct_answers}</strong> aciertos
            <span className="text-rose-300/80"> (si falla, bajaría a {state.safety_net}).</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" icon={Siren} onClick={() => send({ action: "retire", payload: { phrase: "me cago" } })}>
              Sí, se planta
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Seguir jugando
            </Button>
          </div>
        </motion.div>
      ) : (
        // Carcasa con cinta de peligro amarilla/negra y, dentro, el pulsador rojo.
        <motion.div
          key="switch"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: armed ? 1 : 0.35, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="rounded-xl bg-[repeating-linear-gradient(-45deg,#facc15_0_9px,#18181b_9px_18px)] p-[3px] shadow-lg shadow-black/50"
        >
          <motion.button
            type="button"
            disabled={!armed}
            onClick={() => setConfirming(true)}
            whileHover={armed && !still ? { y: -1 } : undefined}
            whileTap={armed && !still ? { scale: 0.95, y: 2 } : undefined}
            // Brillo rojo pulsante mientras se puede plantar.
            animate={
              armed && !still
                ? {
                    boxShadow: [
                      "0 0 0px 0px rgb(244 63 94 / 0.0), inset 0 -4px 0 rgb(0 0 0 / 0.35), inset 0 2px 0 rgb(255 255 255 / 0.25)",
                      "0 0 22px 3px rgb(244 63 94 / 0.75), inset 0 -4px 0 rgb(0 0 0 / 0.35), inset 0 2px 0 rgb(255 255 255 / 0.25)",
                    ],
                  }
                : { boxShadow: "inset 0 -4px 0 rgb(0 0 0 / 0.35)" }
            }
            transition={{
              boxShadow: { duration: 1.1, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" },
              default: { type: "spring", stiffness: 520, damping: 20 },
            }}
            className={cn(
              "group flex h-[34px] w-full items-center justify-center gap-3 rounded-[9px] px-5",
              "bg-[radial-gradient(ellipse_at_50%_20%,#fb7185_0%,#e11d48_45%,#9f1239_100%)]",
              "font-display text-sm font-black uppercase tracking-[0.25em] text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.6)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
              "disabled:cursor-not-allowed",
            )}
          >
            <Siren className="size-4 transition-transform group-hover:rotate-12" />
            Me cago · Plantarse
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Botones del soundboard: lanzan un efecto en el stage sin tocar la partida. */
const SOUNDBOARD: { sound: Sound; label: string; icon: typeof Drum; cls: string }[] = [
  { sound: "play_drumroll", label: "Redoble", icon: Drum, cls: "hover:text-amber-300" },
  { sound: "play_applause", label: "Aplausos", icon: PartyPopper, cls: "hover:text-sky-300" },
  { sound: "play_wrong", label: "Error", icon: CircleX, cls: "hover:text-rose-300" },
  { sound: "play_correct", label: "Acierto", icon: Sparkles, cls: "hover:text-emerald-300" },
];

function Soundboard({ online, send }: { online: boolean; send: (cmd: ClientCommand) => void }) {
  return (
    <div className="flex items-center gap-2 border-t border-line pt-2">
      <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <AudioLines className="size-3.5 text-brand-400" /> Soundboard
      </span>
      <div className="grid flex-1 grid-cols-4 gap-1.5">
        {SOUNDBOARD.map(({ sound, label, icon, cls }) => (
          <Button
            key={sound}
            variant="ghost"
            size="sm"
            icon={icon}
            disabled={!online}
            className={cn("border border-line bg-zinc-950/40", cls)}
            onClick={() => send({ action: "play_sound", payload: { sound } })}
          >
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Acciones principales del presentador (cambian según el modo). */
export function ActionsCard({ state, online, send }: Props) {
  if (!state) {
    return (
      <Card compact title="Acciones" icon={Zap}>
        <p className="text-sm text-zinc-500">Sin conexión con el motor.</p>
      </Card>
    );
  }

  const q = state.current_question;
  const live = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const rosco = state.rosco;
  const comodinActive = state.active_comodin !== null;
  const canLoadNext = state.phase === "Idle" && state.current_question_index < state.total_questions;

  const pauseButton = state.timer_paused ? (
    <Button variant="secondary" icon={Play} disabled={!live || !online} onClick={() => send({ action: "resume_timer" })}>
      Reanudar
    </Button>
  ) : (
    <Button variant="secondary" icon={Pause} disabled={!live || !online} onClick={() => send({ action: "pause_timer" })}>
      Pausar reloj
    </Button>
  );

  const resetButton = (
    <Button variant="ghost" icon={RotateCcw} disabled={!online} onClick={() => send({ action: "reset_game" })} title="Reiniciar la partida con el mismo set">
      Reset
    </Button>
  );

  return (
    <Card
      compact
      title="Acciones"
      icon={Zap}
      actions={comodinActive && live ? <span className="text-[11px] text-amber-300">Cierra el comodín para responder</span> : undefined}
    >
      {rosco ? (
        <div className="grid gap-2">
          {state.phase === "Idle" && (
            <Button variant="primary" size="lg" icon={Play} fullWidth disabled={!online} onClick={() => send({ action: "load_next_question" })}>
              Empezar rosco
            </Button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Button variant="success" size="lg" icon={Check} className="h-14" disabled={!live || !online} onClick={() => send({ action: "rosco_answer", payload: { is_correct: true } })}>
              Acertó
            </Button>
            <Button variant="danger" size="lg" icon={X} className="h-14" disabled={!live || !online} onClick={() => send({ action: "rosco_answer", payload: { is_correct: false } })}>
              Falló
            </Button>
            <Button variant="warning" size="lg" icon={SkipForward} className="h-14" disabled={!live || !online} onClick={() => send({ action: "rosco_pass" })}>
              Pasapalabra
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {pauseButton}
            {resetButton}
          </div>
          <Soundboard online={online} send={send} />
        </div>
      ) : (
        <div className="grid gap-2">
          <Button variant="primary" size="lg" icon={Swords} fullWidth disabled={!canLoadNext || !online} onClick={() => send({ action: "load_next_question" })}>
            Cargar siguiente pregunta
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="success"
              size="lg"
              icon={Check}
              disabled={!q || !live || comodinActive || !online}
              onClick={() => q && send({ action: "submit_answer", payload: q.correct })}
            >
              Simular correcta
            </Button>
            <Button
              variant="danger"
              size="lg"
              icon={X}
              disabled={!q || !live || comodinActive || !online}
              onClick={() => q && send({ action: "submit_answer", payload: (q.correct + 1) % q.answers.length })}
            >
              Simular incorrecta
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" icon={ChevronRight} disabled={state.phase !== "Answering" || !online} onClick={() => send({ action: "next_round" })}>
              Siguiente ronda
            </Button>
            {pauseButton}
            {resetButton}
          </div>
          <PanicButton state={state} send={send} />
          <Soundboard online={online} send={send} />
        </div>
      )}
    </Card>
  );
}
