import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SoundPlayer, useGameSocket } from "@concursillo/ui";
import { applyTheme, getTheme } from "@concursillo/themes";
import type { GameState, Sound } from "@concursillo/shared-types";
import { useCelebrations } from "./celebrate";
import { ComodinBar, ComodinOverlay } from "./Comodines";
import { RoscoStage } from "./Rosco";
import { Timer } from "./Timer";
import { TimeUpFlash } from "./TimeUpFlash";

const LETTERS = ["A", "B", "C", "D"];

/**
 * Reproductor de efectos. Se vuelve a crear cuando cambia `sounds_version`
 * (el streamer ha subido un sonido nuevo desde el editor): así el stage usa el
 * archivo nuevo sin tener que recargar la Browser Source de OBS.
 */
function useSoundPlayer(ref: React.MutableRefObject<SoundPlayer | null>, version: number) {
  useEffect(() => {
    const player = new SoundPlayer(version);
    ref.current = player;
    if (version > 0) console.info(`[audio] sonidos actualizados (versión ${version})`);
    return () => {
      player.dispose();
      if (ref.current === player) ref.current = null;
    };
  }, [ref, version]);
}

export default function App() {
  const player = useRef<SoundPlayer | null>(null);
  const { state } = useGameSocket({
    onAudio: (sound: Sound) => void player.current?.play(sound),
  });
  useSoundPlayer(player, state?.sounds_version ?? 0);

  const themeId = state?.theme;
  useEffect(() => {
    applyTheme(getTheme(themeId));
  }, [themeId]);

  // El bucle de tensión solo tiene sentido mientras corre una pregunta.
  const phase = state?.phase;
  const paused = state?.timer_paused ?? false;
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    if (phase !== "ReadingQuestion" && phase !== "Selecting") p.stopLoop();
    else p.setLoopPaused(paused);
  }, [phase, paused, player]);

  useCelebrations(state);

  // Modo transparente (OBS): se marca en <html> para que html/body/cristal lo sepan.
  // Mientras no llega el primer estado no se pinta fondo: si el streamer usa el
  // modo transparente, OBS nunca ve un destello de color al cargar la fuente.
  const transparent = state?.transparent_background ?? true;
  useEffect(() => {
    document.documentElement.dataset.transparent = String(transparent);
  }, [transparent]);

  return (
    <>
      {!transparent && <div className="stage-backdrop" aria-hidden />}
      <StageView state={state} />
      <Watermark />
    </>
  );
}

/** Marca de agua discreta en la esquina inferior derecha. */
function Watermark() {
  return (
    <div className="watermark" aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" strokeDasharray="3.2 2.6" />
        <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
      </svg>
      Concursillo Studio
    </div>
  );
}

/** Variantes de entrada/salida de pregunta: de borroso a nítido con desplazamiento vertical. */
const QUESTION_VARIANTS = {
  hidden: { opacity: 0, y: 46, filter: "blur(14px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.2, 0.9, 0.3, 1], staggerChildren: 0.09, delayChildren: 0.15 } },
  gone: { opacity: 0, y: -30, filter: "blur(10px)", transition: { duration: 0.28, ease: "easeIn" } },
} as const;
const ANSWER_VARIANTS = {
  hidden: { opacity: 0, y: 30, scale: 0.96, filter: "blur(8px)" },
  shown: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { type: "spring", stiffness: 260, damping: 24 } },
} as const;

function StageView({ state }: { state: GameState | null }) {
  if (state?.rosco) return <RoscoStage state={state} />;

  const q = state?.current_question;

  if (state?.phase === "Retired") {
    return (
      <main className="stage">
        <div className="waiting retired">
          <div>🏳️ ¡Se planta!</div>
          <div className="retired-sub">Se lleva sus {state.prize_level ?? state.correct_answers} aciertos</div>
        </div>
      </main>
    );
  }

  if (!state || state.phase === "Idle" || !q) {
    return (
      <main className="stage">
        <p className="waiting">Esperando...</p>
      </main>
    );
  }

  const revealed = state.is_correct !== null;
  const timedOut = state.phase === "GameOver" && state.time_remaining === 0 && state.selected_answer === null;

  return (
    <main className="stage">
      <ComodinOverlay state={state} />
      <div className="stage-top">
        <ComodinBar state={state} />
        <Timer state={state} />
        <div className="progress-pill">
          Pregunta {state.current_question_index + 1}/{state.total_questions}
          {state.safety_net > 0 && <span className="net"> · 🔒 {state.safety_net}</span>}
        </div>
      </div>
      {/* Cada pregunta entra "de borroso a nítido" y las respuestas en cascada. */}
      <AnimatePresence mode="wait">
        <motion.div key={q.id} className="question-block" variants={QUESTION_VARIANTS} initial="hidden" animate="shown" exit="gone">
          <motion.div className="question" variants={ANSWER_VARIANTS}>
            {q.question}
          </motion.div>
          <div className="answers">
            {q.answers.map((answer, i) => {
              let cls = "answer";
              if (state.selected_answer === i) cls += " selected";
              // Marcada pero sin revelar: naranja con pulso, sin decir si es correcta.
              if (state.selected_answer === i && !revealed) cls += " pending";
              if (revealed && i === q.correct) cls += " correct";
              else if (revealed && state.selected_answer === i) cls += " wrong";
              return (
                <motion.div key={i} className={cls} variants={ANSWER_VARIANTS}>
                  <span className="letter">{LETTERS[i] ?? i + 1}</span>
                  <span className="answer-text">{answer}</span>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>
      {state.phase === "GameOver" && (
        <div className="banner bad">
          {timedOut ? "Tiempo agotado" : "Fin de la partida"}
          {state.prize_level !== null && <span className="banner-sub"> · se lleva {state.prize_level} aciertos</span>}
        </div>
      )}
      {/* «¡TIEMPO!» con zoom y destello; se desvanece y deja ver la respuesta correcta. */}
      {timedOut && <TimeUpFlash key={`timeout-${q.id}`} />}
      {state.phase === "Won" && <div className="banner ok">¡Has ganado!</div>}
    </main>
  );
}
