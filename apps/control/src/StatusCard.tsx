import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Activity, CircleCheck, CircleX, Flame, Pause, Timer } from "lucide-react";
import { Badge, Card, RollingNumber, cn, roscoHint, type BadgeVariant } from "@concursillo/ui";
import type { GamePhase, GameState, LetterStatus, RoscoState } from "@concursillo/shared-types";

const PHASE: Record<GamePhase, { label: string; variant: BadgeVariant }> = {
  Idle: { label: "En espera", variant: "neutral" },
  ReadingQuestion: { label: "Pregunta en juego", variant: "accent" },
  Selecting: { label: "Eligiendo", variant: "accent" },
  Answering: { label: "Respuesta revelada", variant: "info" },
  GameOver: { label: "Fin de partida", variant: "danger" },
  Won: { label: "¡Ganada!", variant: "success" },
  Retired: { label: "Se ha plantado", variant: "warning" },
};

const LETTER_STYLE: Record<LetterStatus, string> = {
  Pending: "bg-zinc-800 text-zinc-300",
  Passed: "bg-amber-400 text-zinc-950",
  Correct: "bg-emerald-500 text-white",
  Wrong: "bg-rose-500 text-white",
};

const OPTION_LETTERS = ["A", "B", "C", "D"];
/** Diámetro del mini-rosco (px). */
const MINI_ROSCO = 184;

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-zinc-950/40 px-2.5 py-1.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="truncate font-display text-base font-bold tabular-nums leading-tight">{children}</div>
    </div>
  );
}

/** Reloj compacto con barra de progreso. */
function Clock({ state, live }: { state: GameState; live: boolean }) {
  const danger = live && state.time_remaining < 5;
  const progress = state.time_limit > 0 ? (state.time_remaining / state.time_limit) * 100 : 0;
  return (
    <div
      className={cn(
        "relative flex w-28 shrink-0 flex-col items-center justify-center overflow-hidden rounded-xl border px-2 pb-2 pt-1.5 transition-colors",
        danger ? "border-rose-500/50 bg-rose-500/10" : "border-line bg-zinc-950/50",
      )}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {state.timer_paused ? <Pause className="size-3" /> : <Timer className="size-3" />}
        {state.timer_paused ? "Pausa" : state.rosco ? "Total" : "Tiempo"}
      </div>
      <div className={cn("font-display text-4xl font-black leading-none", danger ? "animate-pulse text-rose-400 drop-shadow-[0_0_10px_rgb(244_63_94/0.7)]" : "text-white")}>
        <RollingNumber value={state.time_remaining} />
      </div>
      <div className="text-[10px] text-zinc-500">de {state.time_limit}s</div>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-800">
        <div className={cn("h-full transition-[width] duration-1000 ease-linear", danger ? "bg-rose-500" : "bg-brand-500")} style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

/** Mini-rosco: las 27 letras en círculo (~184 px), con la actual resaltada. */
function MiniRosco({ rosco, live }: { rosco: RoscoState; live: boolean }) {
  const n = rosco.letters.length;
  const r = MINI_ROSCO / 2 - 12;
  const current = rosco.letters[rosco.current_index];
  const pending = n - rosco.total_correct - rosco.total_wrong;
  return (
    <div className="relative shrink-0" style={{ width: MINI_ROSCO, height: MINI_ROSCO }} aria-label="Rosco">
      {rosco.letters.map((l, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
        const isCurrent = live && i === rosco.current_index;
        return (
          <motion.span
            key={l.letter}
            title={`${l.letter}: ${l.status}`}
            // Al cambiar de estado, la letra "rebota" (muelle).
            animate={{ scale: isCurrent ? 1.35 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 14 }}
            className={cn(
              "absolute grid size-[19px] place-items-center rounded-full text-[9.5px] font-bold transition-colors duration-300",
              LETTER_STYLE[l.status],
              isCurrent && "z-10 ring-2 ring-white shadow-[0_0_12px_2px] shadow-brand-400",
            )}
            style={{ left: MINI_ROSCO / 2 + r * Math.cos(angle), top: MINI_ROSCO / 2 + r * Math.sin(angle), x: "-50%", y: "-50%" }}
          >
            <motion.span key={l.status} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 600, damping: 12 }}>
              {l.letter}
            </motion.span>
          </motion.span>
        );
      })}
      <div className="absolute inset-[34px] flex flex-col items-center justify-center rounded-full border border-line bg-zinc-950/60 text-center">
        <span key={current.letter} className={cn("animate-pop text-4xl font-black leading-none", live ? "text-brand-400" : "text-zinc-600")}>
          {current.letter}
        </span>
        <span className="mt-1 flex text-[10px] font-semibold">
          <RollingNumber value={rosco.total_correct} className="text-emerald-400" />
          <span className="text-zinc-600">&nbsp;·&nbsp;</span>
          <RollingNumber value={rosco.total_wrong} className="text-rose-400" />
          <span className="text-zinc-600">&nbsp;·&nbsp;</span>
          <RollingNumber value={pending} className="text-zinc-400" />
        </span>
      </div>
    </div>
  );
}

/** La pregunta en juego (con la respuesta correcta, solo para el presentador). */
function CurrentQuestion({ state }: { state: GameState }) {
  const q = state.current_question;
  const rosco = state.rosco;
  const current = rosco ? rosco.letters[rosco.current_index] : null;
  return (
    <div key={q?.id ?? "none"} className="min-w-0 animate-fade-in rounded-xl border border-line bg-zinc-950/40 px-3 py-2">
      {q ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
            {current && <Badge variant="accent" className="text-[10px]">{roscoHint(current.letter, current.starts_with)}</Badge>}
            <span>{q.category}</span>
          </div>
          <p className="line-clamp-2 text-sm font-semibold leading-snug text-zinc-100">{q.question}</p>
          {q.answers.length > 1 ? (
            <ol className="mt-1.5 grid grid-cols-2 gap-1">
              {q.answers.map((a, i) => {
                const correct = i === q.correct;
                const chosen = state.selected_answer === i;
                return (
                  <li
                    key={i}
                    className={cn(
                      "flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs",
                      correct ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-line text-zinc-300",
                      chosen && !correct && "border-rose-500/50 bg-rose-500/10 text-rose-200",
                    )}
                  >
                    <span className="font-bold text-zinc-500">{OPTION_LETTERS[i] ?? i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{a}</span>
                    {correct && <CircleCheck className="size-3.5 shrink-0 text-emerald-400" />}
                    {chosen && !correct && <CircleX className="size-3.5 shrink-0 text-rose-400" />}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
              <CircleCheck className="size-3.5" /> {q.answers[q.correct]}
            </p>
          )}
        </>
      ) : (
        <p className="py-1 text-xs text-zinc-500">
          {state.phase === "Retired"
            ? `Se ha plantado con ${state.prize_level ?? state.correct_answers} aciertos.`
            : state.phase === "Won" || state.phase === "GameOver"
              ? `Partida terminada${state.prize_level !== null ? ` · premio: ${state.prize_level} aciertos` : ""}.`
              : "No hay ninguna pregunta en juego."}
        </p>
      )}
    </div>
  );
}

/** Estado de la partida, compacto: reloj, datos clave, (mini-rosco) y pregunta en juego. */
export function StatusCard({ state }: { state: GameState | null }) {
  if (!state) {
    return (
      <Card compact title="Estado" icon={Activity}>
        <p className="text-sm text-zinc-500">Esperando al motor del juego…</p>
      </Card>
    );
  }

  const phase = PHASE[state.phase];
  const rosco = state.rosco;
  const live = state.phase === "ReadingQuestion" || state.phase === "Selecting";

  const streak = (
    <Stat label="Racha">
      <span className="inline-flex items-center gap-1">
        <Flame className={cn("size-3.5", state.streak > 0 ? "text-orange-400" : "text-zinc-600")} />
        <RollingNumber value={state.streak} />
      </span>
    </Stat>
  );

  const stats = rosco ? (
    <>
      <Stat label="Resueltas">
        <RollingNumber value={rosco.total_correct + rosco.total_wrong} />/{rosco.letters.length}
      </Stat>
      {streak}
      <Stat label="Para ganar">{rosco.min_correct}</Stat>
    </>
  ) : (
    <>
      <Stat label="Ronda">
        <RollingNumber value={Math.min(state.current_question_index + 1, state.total_questions)} />/{state.total_questions}
      </Stat>
      {streak}
      <Stat label="Asegurado">
        <RollingNumber value={state.safety_net} />
      </Stat>
    </>
  );

  return (
    <Card
      compact
      title="Estado de la partida"
      icon={Activity}
      tone={live ? "accent" : "default"}
      actions={
        <>
          <Badge variant="accent">{state.mode}</Badge>
          <Badge key={state.phase} variant={phase.variant} dot={live ? "pulse" : true} className="animate-pop">
            {phase.label}
          </Badge>
        </>
      }
    >
      {rosco ? (
        <div className="flex items-center gap-3">
          <MiniRosco rosco={rosco} live={live} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex gap-2">
              <Clock state={state} live={live} />
              <div className="grid min-w-0 flex-1 grid-cols-3 content-center gap-1.5">{stats}</div>
            </div>
            <CurrentQuestion state={state} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Clock state={state} live={live} />
            <div className="grid min-w-0 flex-1 grid-cols-3 content-center gap-2">{stats}</div>
          </div>
          <CurrentQuestion state={state} />
        </div>
      )}
    </Card>
  );
}
