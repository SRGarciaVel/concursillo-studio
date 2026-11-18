import { useEffect, useRef } from "react";
import { SoundPlayer, useGameSocket } from "@concursillo/ui";
import { applyTheme, getTheme } from "@concursillo/themes";
import type { Sound } from "@concursillo/shared-types";
import { ComodinBar, ComodinOverlay } from "./Comodines";
import { RoscoStage } from "./Rosco";
import { Timer } from "./Timer";

const LETTERS = ["A", "B", "C", "D"];

function useSoundPlayer() {
  const ref = useRef<SoundPlayer | null>(null);
  useEffect(() => {
    const player = new SoundPlayer();
    ref.current = player;
    return () => {
      player.dispose();
      ref.current = null;
    };
  }, []);
  return ref;
}

export default function App() {
  const player = useSoundPlayer();
  const { state } = useGameSocket({
    onAudio: (sound: Sound) => void player.current?.play(sound),
  });

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
          {state.safety_net > 0 && <span> · 🔒 {state.safety_net}</span>}
        </div>
      </div>
      <div className="question">{q.question}</div>
      <div className="answers">
        {q.answers.map((answer, i) => {
          let cls = "answer";
          if (state.selected_answer === i) cls += " selected";
          if (revealed && i === q.correct) cls += " correct";
          else if (revealed && state.selected_answer === i) cls += " wrong";
          return (
            <div key={i} className={cls}>
              <span className="letter">{LETTERS[i] ?? i + 1}:</span> {answer}
            </div>
          );
        })}
      </div>
      {state.phase === "GameOver" && (
        <div className="banner bad">
          {timedOut ? "¡Se acabó el tiempo!" : "Fin de la partida"}
          {state.prize_level !== null && <span className="banner-sub"> · se lleva {state.prize_level} aciertos</span>}
        </div>
      )}
      {state.phase === "Won" && <div className="banner ok">¡Has ganado!</div>}
    </main>
  );
}
