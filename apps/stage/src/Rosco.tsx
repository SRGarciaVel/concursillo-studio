import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { animate, spring } from "animejs";
import { prefersReducedMotion, roscoHint } from "@concursillo/ui";
import type { GameState, LetterStatus, RoscoState } from "@concursillo/shared-types";
import { Timer } from "./Timer";
import { TimeUpFlash } from "./TimeUpFlash";

const OPTION_LETTERS = ["A", "B", "C", "D"];

/** Geometría del rosco en un viewBox de 1000×1000. */
const VIEW = 1000;
const CENTER = VIEW / 2;
const RING_R = 448; // radio del círculo de letras
const LETTER_R = 46; // radio de cada letra

function letterXY(i: number, total: number) {
  const angle = -Math.PI / 2 + (2 * Math.PI * i) / total;
  return { x: CENTER + RING_R * Math.cos(angle), y: CENTER + RING_R * Math.sin(angle) };
}

function Counters({ rosco }: { rosco: RoscoState }) {
  const pending = rosco.letters.length - rosco.total_correct - rosco.total_wrong;
  return (
    <div className="rosco-counters">
      <span className="count correct" title="Aciertos"><span>{rosco.total_correct}</span></span>
      <span className="count wrong" title="Fallos"><span>{rosco.total_wrong}</span></span>
      <span className="count pending" title="Pendientes"><span>{pending}</span></span>
    </div>
  );
}

/**
 * Una letra del rosco (SVG). Cuando cambia de estado "rebota" con un muelle
 * de anime.js. El `<g>` exterior coloca la letra; el interior es el que escala
 * (con origen en el centro de la letra).
 */
function Letter({ letter, status, index, total, current }: { letter: string; status: LetterStatus; index: number; total: number; current: boolean }) {
  const node = useRef<SVGGElement>(null);
  const prev = useRef(status);
  const { x, y } = letterXY(index, total);

  useEffect(() => {
    if (prev.current === status) return;
    prev.current = status;
    if (!node.current || prefersReducedMotion()) return;
    const a = animate(node.current, { scale: [1.55, 1], ease: spring({ bounce: 0.62, duration: 700 }) });
    return () => void a.pause();
  }, [status]);

  return (
    <g transform={`translate(${x} ${y})`} className={`rl status-${status.toLowerCase()}${current ? " current" : ""}`}>
      {current && (
        // Halo elegante: resplandor suave que respira + un único anillo fino.
        <g aria-hidden>
          <circle className="rl-glow" r={LETTER_R + 22} />
          <circle className="rl-ring" r={LETTER_R + 13} />
        </g>
      )}
      <g ref={node} className="rl-body">
        <circle className="rl-disc" r={LETTER_R} />
        <circle className="rl-shine" r={LETTER_R - 6} />
        <text className="rl-text" dy="0.35em" textAnchor="middle">
          {letter}
        </text>
      </g>
    </g>
  );
}

export function RoscoStage({ state }: { state: GameState }) {
  const rosco = state.rosco!;
  const inPlay = state.phase === "ReadingQuestion" || state.phase === "Selecting";
  const finished = state.phase === "Won" || state.phase === "GameOver";
  const current = rosco.letters[rosco.current_index];
  const q = state.current_question;

  return (
    <main className="stage rosco-stage">
      <div className="rosco-timer">
        <Timer state={state} />
      </div>
      {finished && state.time_remaining === 0 && <TimeUpFlash key="rosco-timeout" />}

      <div className="rosco-ring">
        <svg className="rosco-svg" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-label="Rosco">
          <defs>
            {/* Reflejo superior de cada disco (volumen sin saturar). */}
            <linearGradient id="rl-shine" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* Guía del círculo. */}
          <circle className="rosco-track" cx={CENTER} cy={CENTER} r={RING_R} />
          {/* La letra actual se pinta la última para quedar por encima. */}
          {rosco.letters
            .map((l, i) => ({ l, i }))
            .sort((a, b) => Number(inPlay && a.i === rosco.current_index) - Number(inPlay && b.i === rosco.current_index))
            .map(({ l, i }) => (
              <Letter
                key={l.letter}
                letter={l.letter}
                status={l.status}
                index={i}
                total={rosco.letters.length}
                current={inPlay && i === rosco.current_index}
              />
            ))}
        </svg>

        <div className="rosco-center">
          <AnimatePresence mode="wait" initial={false}>
            {inPlay && q ? (
              // Cada letra nueva entra de "borroso a nítido" con desplazamiento vertical.
              <motion.div
                key={current.letter}
                className="rosco-card"
                initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -14, filter: "blur(8px)" }}
                transition={{ duration: 0.38, ease: [0.2, 0.9, 0.3, 1] }}
              >
                <div className="rosco-hint">{roscoHint(current.letter, current.starts_with)}</div>
                <div className="rosco-question">{q.question}</div>
                {q.answers.length > 1 && (
                  <div className="rosco-options">
                    {q.answers.map((a, i) => (
                      <div key={i} className="rosco-option">
                        <span className="opt">{OPTION_LETTERS[i] ?? i + 1}</span>{a}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            ) : finished ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 14 }}
                className={`rosco-result ${state.phase === "Won" ? "ok" : "bad"}`}
              >
                {state.phase === "Won" ? "¡Rosco completado!" : state.time_remaining === 0 ? "¡Se acabó el tiempo!" : "Fin del rosco"}
              </motion.div>
            ) : (
              <motion.div key="ready" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="rosco-hint">
                Preparados…
              </motion.div>
            )}
          </AnimatePresence>
          <Counters rosco={rosco} />
        </div>
      </div>
    </main>
  );
}
