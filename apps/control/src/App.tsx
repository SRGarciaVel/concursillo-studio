import { useEffect, useState } from "react";
import { errorMessage, listPresets, loadPreset, openEditor, useGameSocket } from "@concursillo/ui";
import { THEMES, getTheme } from "@concursillo/themes";
import type { ClientCommand, PresetSummary } from "@concursillo/shared-types";
import { ComodinesPanel } from "./ComodinesPanel";
import { RoscoPanel } from "./RoscoPanel";
import { TwitchPanel } from "./TwitchPanel";

const STATUS_LABEL = { open: "Conectado", connecting: "Conectando…", closed: "Desconectado" };

/** Resumen corto para el log (las listas de preguntas son demasiado largas). */
function describe(cmd: ClientCommand): string {
  if (cmd.action === "init_game") return `init_game (${cmd.payload.length} preguntas)`;
  if (cmd.action === "init_rosco") return `init_rosco (${cmd.payload.questions.length} letras)`;
  if (cmd.action === "start_preset") return `start_preset «${cmd.payload.preset.name}» (${cmd.payload.preset.mode})`;
  // Nunca escribir el token en el log.
  if (cmd.action === "connect_twitch") return `connect_twitch #${cmd.payload.channel}${cmd.payload.token ? " (con token)" : " (anónimo)"}`;
  return JSON.stringify(cmd);
}

export default function App() {
  const { state, status, lastError, sendCommand } = useGameSocket();
  const [log, setLog] = useState<string[]>([]);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const chosen = presets.find((p) => p.id === selectedPreset);

  const addLog = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()} ${line}`, ...l].slice(0, 30));

  const send = (cmd: ClientCommand) => {
    const ok = sendCommand(cmd);
    addLog(`${ok ? "→" : "✗"} ${describe(cmd)}`);
  };

  const refreshPresets = async () => {
    try {
      const list = await listPresets();
      setPresets(list);
      setSelectedPreset((s) => (list.some((p) => p.id === s) ? s : (list[0]?.id ?? "")));
      setPresetsError(null);
    } catch (e) {
      setPresetsError(errorMessage(e));
    }
  };

  useEffect(() => {
    void refreshPresets();
  }, []);

  /** Un único comando: el backend aplica modo, preguntas, tiempo, tema y Twitch. */
  // "Iniciando…" desde el clic hasta que llega el siguiente estado del backend.
  const [starting, setStarting] = useState(false);
  useEffect(() => setStarting(false), [state, lastError]);

  const startPreset = async () => {
    setStarting(true);
    try {
      const preset = await loadPreset(selectedPreset);
      addLog(`📂 preset «${preset.name}» cargado`);
      send({ action: "start_preset", payload: { preset } });
    } catch (e) {
      setPresetsError(errorMessage(e));
      setStarting(false);
    }
  };

  const showEditor = async () => {
    try {
      await openEditor();
    } catch (e) {
      addLog(`✗ no se pudo abrir el editor: ${errorMessage(e)}`);
    }
  };

  const q = state?.current_question;
  const canLoadNext =
    state?.phase === "Idle" && state.current_question_index < state.total_questions;
  const questionLive = state?.phase === "ReadingQuestion" || state?.phase === "Selecting";
  const isRosco = !!state?.rosco;

  return (
    <main className="control">
      <header>
        <h1>Concursillo · Control</h1>
        <div className="header-actions">
          <button className="secondary" onClick={showEditor} title="Abrir el editor (o traerlo al frente)">
            ✏️ Editor
          </button>
          <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>
        </div>
      </header>

      <section className="panel">
        <h2>Estado</h2>
        {state ? (
          <dl>
            <dt>Fase</dt><dd key={state.phase} className="flash">{state.phase}</dd>
            <dt>Modo</dt><dd>{state.mode}</dd>
            {!isRosco && <><dt>Ronda</dt><dd>{state.current_question_index + 1} / {state.total_questions}</dd></>}
            <dt>Racha</dt><dd>{state.streak}</dd>
            <dt>Tiempo</dt>
            <dd className={state.time_remaining < 5 ? "danger" : undefined}>
              {state.time_remaining}s / {state.time_limit}s{state.timer_paused && " ⏸ pausado"}
            </dd>
            <dt>Tema</dt><dd>{state.theme}</dd>
            {!isRosco && <>
            <dt>Respuesta</dt>
            <dd>
              {state.selected_answer ?? "—"}
              {state.is_correct !== null && (state.is_correct ? " ✔ correcta" : " ✘ incorrecta")}
            </dd>
            <dt>Pregunta</dt>
            <dd>
              {q ? (
                <>
                  {q.question}
                  <ol start={0}>
                    {q.answers.map((a, i) => (
                      <li key={i} className={i === q.correct ? "correct" : undefined}>{a}</li>
                    ))}
                  </ol>
                </>
              ) : "—"}
            </dd>
            </>}
          </dl>
        ) : (
          <p>Sin datos del servidor.</p>
        )}
        {lastError && <p className="error">Error del servidor: {lastError}</p>}
      </section>

      <section className="panel actions">
        <h2>Preset</h2>
        <select name="preset" value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)}>
          {presets.length === 0 && <option value="">(ningún preset: créalo en el editor)</option>}
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button onClick={startPreset} disabled={!selectedPreset || status !== "open" || starting} className={starting ? "is-busy" : undefined}>
          {starting ? "Iniciando…" : "▶ Iniciar"}
        </button>
        <button className="secondary" onClick={refreshPresets} aria-label="Recargar lista">↻</button>
        {chosen && (
          <p className="muted preset-info">
            {chosen.mode} · {chosen.question_count} preguntas · tema {getTheme(chosen.theme).name} ·{" "}
            {chosen.mode === "Rosco" ? `${chosen.time_limit}s en total` : `${chosen.time_limit}s por pregunta`}
            {chosen.twitch_channel ? ` · Twitch #${chosen.twitch_channel}` : ""}
          </p>
        )}
        {presetsError && <p className="error">{presetsError}</p>}
      </section>

      {state && <TwitchPanel state={state} send={send} />}

      <section className="panel actions">
        <h2>Tema del stage</h2>
        <select
          name="theme"
          value={state?.theme ?? ""}
          disabled={status !== "open"}
          onChange={(e) => send({ action: "change_theme", payload: e.target.value })}
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </section>

      {isRosco && state && <RoscoPanel state={state} send={send} />}
      {!isRosco && state && <ComodinesPanel state={state} send={send} />}

      <section className="panel actions">
        <h2>Acciones</h2>
        {!isRosco && (
          <>
            <button onClick={() => send({ action: "load_next_question" })} disabled={!canLoadNext}>
              Cargar siguiente pregunta
            </button>
            <button onClick={() => q && send({ action: "submit_answer", payload: q.correct })} disabled={!q}>
              Simular correcta
            </button>
            <button onClick={() => q && send({ action: "submit_answer", payload: (q.correct + 1) % q.answers.length })} disabled={!q}>
              Simular incorrecta
            </button>
          </>
        )}
        {state?.timer_paused ? (
          <button onClick={() => send({ action: "resume_timer" })} disabled={!questionLive}>▶ Reanudar reloj</button>
        ) : (
          <button onClick={() => send({ action: "pause_timer" })} disabled={!questionLive}>⏸ Pausar reloj</button>
        )}
        {!isRosco && <button onClick={() => send({ action: "next_round" })}>Next Round</button>}
        <button className="danger" onClick={() => send({ action: "reset_game" })}>Reset Game</button>
      </section>

      <section className="panel">
        <h2>Log</h2>
        <pre className="log">{log.join("\n") || "—"}</pre>
      </section>
    </main>
  );
}
