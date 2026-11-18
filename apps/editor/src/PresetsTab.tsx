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
import { Eraser, Layers, Library, Save, SquarePen } from "lucide-react";
import { Badge, Button, Card, Field, Input, Notice, Select } from "@concursillo/ui";

const DEFAULT_TIME: Record<GameMode, number> = { Millonario: 30, Rosco: 150 };
const TIME_RANGE: Record<GameMode, [number, number]> = { Millonario: [5, 300], Rosco: [30, 900] };

type NoticeState = { kind: "ok" | "error"; text: string } | null;

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
  const [notice, setNotice] = useState<NoticeState>(null);

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
    <div className="flex flex-col gap-4">
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <Card title={form.id ? "Editar preset" : "Nuevo preset"} icon={Layers}>
          <form className="flex flex-col gap-4" onSubmit={save}>
            <Field
              label="Nombre"
              hint={
                <>
                  Archivo: <code className="font-mono text-zinc-400">data/presets/{id || "…"}.json</code>
                  {overwriting && <span className="text-amber-300"> · ya existe: se sobrescribirá</span>}
                </>
              }
            >
              <Input name="presetName" value={form.name} placeholder="Gran final del viernes" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field
              label="Set de preguntas"
              hint={
                questions && mode ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Badge variant="accent">{mode}</Badge>
                    {questions.length} preguntas
                    {mode === "Millonario" && questions.length > 15 && ` · 15 se juegan, ${questions.length - 15} de reserva`}
                  </span>
                ) : undefined
              }
            >
              <Select name="presetSet" value={form.set} onChange={(e) => void chooseSet(e.target.value)}>
                <option value="">{questions && !form.set ? "(preguntas del preset cargado)" : "— elige un set —"}</option>
                {sets.map((s) => (
                  <option key={s} value={s}>{s}.json</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Tema">
                <Select name="presetTheme" value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })}>
                  {THEMES.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label={mode === "Rosco" ? "Tiempo total (s)" : "Segundos por pregunta"} error={!timeValid ? `Entre ${minT} y ${maxT} s` : undefined}>
                <Input
                  name="presetTime"
                  type="number"
                  min={minT}
                  max={maxT}
                  aria-invalid={!timeValid}
                  value={form.timeLimit}
                  onChange={(e) => setForm({ ...form, timeLimit: Number(e.target.value) })}
                />
              </Field>
              {mode === "Rosco" && (
                <Field label="Aciertos para ganar">
                  <Input
                    name="presetMinCorrect"
                    type="number"
                    min={1}
                    max={27}
                    value={form.minCorrect}
                    onChange={(e) => setForm({ ...form, minCorrect: Number(e.target.value) })}
                  />
                </Field>
              )}
            </div>
            <Field label="Canal de Twitch" hint="Opcional: se conecta (en anónimo) al iniciar el preset.">
              <Input name="presetTwitch" value={form.twitchChannel} placeholder="tu_canal" onChange={(e) => setForm({ ...form, twitchChannel: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="lg" icon={Save} disabled={!canSave} className="flex-1">
                Guardar preset
              </Button>
              <Button variant="ghost" size="lg" icon={Eraser} onClick={() => { setForm(EMPTY); setQuestions(null); }}>
                Limpiar
              </Button>
            </div>
          </form>
        </Card>

        <Card title={`Presets guardados (${presets.length})`} icon={Library}>
          {presets.length === 0 ? (
            <p className="text-sm text-zinc-500">Todavía no hay presets.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {presets.map((p) => (
                <li key={p.id} className="group flex items-center gap-3 rounded-xl border border-line bg-zinc-950/40 px-3 py-2.5 transition-colors hover:border-white/15">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="accent">{p.mode}</Badge>
                      <Badge>{p.question_count} {p.mode === "Rosco" ? "letras" : "preguntas"}</Badge>
                      <Badge>{getTheme(p.theme).name}</Badge>
                      <Badge>{p.time_limit}s</Badge>
                      {p.twitch_channel && <Badge variant="info">#{p.twitch_channel}</Badge>}
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" icon={SquarePen} onClick={() => void edit(p.id)}>
                    Editar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
