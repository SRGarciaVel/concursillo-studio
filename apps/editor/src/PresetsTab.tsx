import { useEffect, useState, type FormEvent } from "react";
import {
  detectSetMode,
  errorMessage,
  listPresets,
  listQuestionSets,
  loadPreset,
  loadQuestionSet,
  savePreset,
  slugify,
} from "@concursillo/ui";
import { THEMES, getTheme } from "@concursillo/themes";
import type { GameMode, Preset, PresetSummary, Question } from "@concursillo/shared-types";

const DEFAULT_TIME: Record<GameMode, number> = { Millonario: 30, Rosco: 150 };
const TIME_RANGE: Record<GameMode, [number, number]> = { Millonario: [5, 300], Rosco: [30, 900] };

type Notice = { kind: "ok" | "error"; text: string } | null;

interface Form {
  name: string;
  /** Vacío = se deriva del nombre. */
  id: string;
  set: string;
  theme: string;
  timeLimit: number;
  minCorrect: number;
  twitchChannel: string;
}

const EMPTY: Form = { name: "", id: "", set: "", theme: "default", timeLimit: 30, minCorrect: 27, twitchChannel: "" };

/** Pestaña de presets: un preset = set de preguntas + tema + tiempo (+ canal). */
export function PresetsTab() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  // Preguntas del set elegido (se copian dentro del preset al guardar).
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const mode: GameMode | null = questions ? detectSetMode(questions) : null;
  const id = form.id.trim() || slugify(form.name);
  const [minT, maxT] = TIME_RANGE[mode ?? "Millonario"];
  const timeValid = form.timeLimit >= minT && form.timeLimit <= maxT;
  const canSave = !!form.name.trim() && !!id && !!questions && !!mode && timeValid;
  const overwriting = presets.some((p) => p.id === id);

  const refresh = async () => {
    try {
      const [p, s] = await Promise.all([listPresets(), listQuestionSets()]);
      setPresets(p);
      setSets(s);
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // Al cambiar de set: cargar sus preguntas y poner el tiempo por defecto de su modo.
  const chooseSet = async (set: string) => {
    setForm((f) => ({ ...f, set }));
    setQuestions(null);
    if (!set) return;
    try {
      const qs = await loadQuestionSet(set);
      const m = detectSetMode(qs);
      setQuestions(qs);
      setForm((f) => ({ ...f, set, timeLimit: DEFAULT_TIME[m], minCorrect: Math.min(f.minCorrect, qs.length) || qs.length }));
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSave || !questions || !mode) return;
    const preset: Preset = {
      id,
      name: form.name.trim(),
      mode,
      questions,
      theme: form.theme,
      time_limit: form.timeLimit,
      min_correct: mode === "Rosco" ? form.minCorrect : null,
      twitch_channel: form.twitchChannel.trim() || null,
    };
    try {
      await savePreset(preset);
      setNotice({ kind: "ok", text: `Preset «${preset.name}» guardado como ${id}.json` });
      await refresh();
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err) });
    }
  };

  /** Rellena el formulario con un preset existente para editarlo. */
  const edit = async (presetId: string) => {
    try {
      const p = await loadPreset(presetId);
      setQuestions(p.questions);
      setForm({
        name: p.name,
        id: p.id,
        set: "",
        theme: p.theme,
        timeLimit: p.time_limit,
        minCorrect: p.min_correct ?? p.questions.length,
        twitchChannel: p.twitch_channel ?? "",
      });
      setNotice({ kind: "ok", text: `Editando «${p.name}» (${p.questions.length} preguntas incluidas)` });
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  return (
    <>
      {notice && <p className={`notice notice-${notice.kind}`}>{notice.text}</p>}
      <div className="columns">
        <form className="panel form" onSubmit={save}>
          <h2>Nuevo preset</h2>
          <label>
            Nombre
            <input name="presetName" value={form.name} placeholder="Gran final del viernes" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <p className="hint">
            Archivo: <code>data/presets/{id || "…"}.json</code>
            {overwriting && " · ⚠ ya existe: se sobrescribirá"}
          </p>
          <label>
            Set de preguntas
            <select name="presetSet" value={form.set} onChange={(e) => void chooseSet(e.target.value)}>
              <option value="">{questions && !form.set ? "(preguntas del preset cargado)" : "— elige un set —"}</option>
              {sets.map((s) => (
                <option key={s} value={s}>{s}.json</option>
              ))}
            </select>
          </label>
          {questions && mode && (
            <p className="hint">
              Modo detectado: <strong>{mode}</strong> · {questions.length} preguntas
              {mode === "Millonario" && questions.length > 15 && ` (15 se juegan, ${questions.length - 15} de reserva)`}
            </p>
          )}
          <div className="row">
            <label className="grow">
              Tema
              <select name="presetTheme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                {THEMES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
            <label>
              {mode === "Rosco" ? "Tiempo total (s)" : "Segundos por pregunta"}
              <input
                name="presetTime"
                type="number"
                min={minT}
                max={maxT}
                value={form.timeLimit}
                onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}
              />
            </label>
            {mode === "Rosco" && (
              <label>
                Aciertos para ganar
                <input
                  name="presetMinCorrect"
                  type="number"
                  min={1}
                  max={27}
                  value={form.minCorrect}
                  onChange={(e) => setForm({ ...form, minCorrect: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          {!timeValid && <p className="hint warn">El tiempo debe estar entre {minT} y {maxT} s.</p>}
          <label>
            Canal de Twitch <small>(opcional: se conecta solo al iniciar)</small>
            <input name="presetTwitch" value={form.twitchChannel} placeholder="tu_canal" onChange={(e) => setForm({ ...form, twitchChannel: e.target.value })} />
          </label>
          <div className="row">
            <button type="submit" disabled={!canSave}>Guardar Preset</button>
            <button type="button" className="secondary" onClick={() => { setForm(EMPTY); setQuestions(null); }}>
              Limpiar
            </button>
          </div>
        </form>

        <section className="panel">
          <h2>Presets guardados ({presets.length})</h2>
          {presets.length === 0 ? (
            <p className="hint">Todavía no hay presets.</p>
          ) : (
            <ul className="preset-list">
              {presets.map((p) => (
                <li key={p.id}>
                  <div className="q-text">{p.name}</div>
                  <div className="q-meta">
                    {p.mode} · {p.question_count} preguntas · {getTheme(p.theme).name} · {p.time_limit}s
                    {p.twitch_channel && ` · #${p.twitch_channel}`}
                  </div>
                  <div className="q-actions">
                    <code className="muted">{p.id}.json</code>
                    <button className="secondary" onClick={() => void edit(p.id)}>Editar</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
