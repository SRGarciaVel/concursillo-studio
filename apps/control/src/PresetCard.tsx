import { useEffect, useState } from "react";
import { Clock, FileQuestion, Layers, ListOrdered, Palette, Play, Radio, RefreshCw, SquarePen } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  IconButton,
  Select,
  cn,
  detectSetMode,
  errorMessage,
  listPresets,
  listQuestionSets,
  loadPreset,
  loadQuestionSet,
  useToast,
} from "@concursillo/ui";
import { getTheme } from "@concursillo/themes";
import type { ClientCommand, GameMode, GameState, PresetSummary, Question } from "@concursillo/shared-types";

type Source = "preset" | "set";

interface Props {
  state: GameState | null;
  /** Contador de errores del backend: un error también termina el "Iniciando…". */
  errorCount: number;
  online: boolean;
  send: (cmd: ClientCommand) => void;
  onOpenEditor: () => void;
}

/** Tiempo por defecto al jugar un set suelto (sin preset). Igual que en el editor de presets. */
const SET_DEFAULT_TIME: Record<GameMode, string> = { Millonario: "30s por pregunta", Rosco: "150s en total" };

/**
 * Tarjeta "Partida": empieza una partida desde un **preset** (set + tema + tiempo
 * + Twitch) o directamente desde un **set de preguntas** con los valores por defecto.
 */
export function PresetCard({ state, errorCount, online, send, onOpenEditor }: Props) {
  const toast = useToast();
  const [source, setSource] = useState<Source>("preset");
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [sets, setSets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [selectedSet, setSelectedSet] = useState("");
  // Preguntas del set elegido (para enseñar modo y número antes de empezar).
  const [setQuestions, setSetQuestions] = useState<Question[] | null>(null);
  const [starting, setStarting] = useState(false);

  const refresh = async () => {
    try {
      const [p, s] = await Promise.all([listPresets(), listQuestionSets()]);
      setPresets(p);
      setSets(s);
      setSelectedPreset((cur) => (p.some((x) => x.id === cur) ? cur : (p[0]?.id ?? "")));
      setSelectedSet((cur) => (s.includes(cur) ? cur : (s[0] ?? "")));
    } catch (e) {
      toast.error(`No se pudieron leer los presets y sets: ${errorMessage(e)}`);
    }
  };

  useEffect(() => {
    void refresh();
    // Sin presets pero con sets (instalación nueva sin presets propios): empezar por los sets.
  }, []);

  useEffect(() => {
    if (presets.length === 0 && sets.length > 0) setSource("set");
  }, [presets.length, sets.length]);

  // Resumen del set elegido.
  useEffect(() => {
    setSetQuestions(null);
    if (!selectedSet) return;
    let alive = true;
    loadQuestionSet(selectedSet)
      .then((qs) => alive && setSetQuestions(qs))
      .catch((e) => alive && toast.error(`No se pudo leer ${selectedSet}.json: ${errorMessage(e)}`));
    return () => {
      alive = false;
    };
  }, [selectedSet]);

  // "Iniciando…" desde el clic hasta que llega el siguiente estado (o un error) del backend.
  useEffect(() => setStarting(false), [state, errorCount]);

  const start = async () => {
    setStarting(true);
    try {
      if (source === "preset") {
        const preset = await loadPreset(selectedPreset);
        send({ action: "start_preset", payload: { preset } });
        toast.info(`Partida «${preset.name}» preparada`);
      } else {
        const questions = setQuestions ?? (await loadQuestionSet(selectedSet));
        if (questions.length === 0) throw new Error(`El set «${selectedSet}» no tiene preguntas`);
        const mode = detectSetMode(questions);
        send(mode === "Rosco" ? { action: "init_rosco", payload: { questions } } : { action: "init_game", payload: questions });
        toast.info(`Set «${selectedSet}» preparado (${mode})`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
      setStarting(false);
    }
  };

  const chosen = presets.find((p) => p.id === selectedPreset);
  const setMode = setQuestions && setQuestions.length > 0 ? detectSetMode(setQuestions) : null;
  const empty = source === "preset" ? presets.length === 0 : sets.length === 0;
  const canStart = online && !empty && (source === "preset" ? !!selectedPreset : !!selectedSet);

  return (
    <Card
      compact
      title="Partida"
      icon={Layers}
      actions={
        <>
          {/* Origen de la partida: preset completo o set suelto. */}
          <div role="radiogroup" aria-label="Empezar desde" className="flex rounded-lg border border-line bg-zinc-950/50 p-0.5 text-xs font-semibold">
            {(["preset", "set"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={source === s}
                onClick={() => setSource(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
                  source === s ? "bg-brand-500 text-white" : "text-zinc-400 hover:text-zinc-100",
                )}
              >
                {s === "preset" ? "Preset" : "Set de preguntas"}
              </button>
            ))}
          </div>
          <IconButton label="Recargar presets y sets" icon={RefreshCw} variant="ghost" size="sm" onClick={() => void refresh()} />
        </>
      }
    >
      {empty ? (
        // Estado vacío con salida clara: crear contenido en el editor.
        <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-white/10 px-3 py-2.5">
          <p className="text-sm text-zinc-400">
            {source === "preset"
              ? "Todavía no hay presets. Crea uno (set + tema + tiempo) en el editor."
              : "Todavía no hay sets de preguntas. Créalos o impórtalos en el editor."}
          </p>
          <Button size="sm" icon={SquarePen} onClick={onOpenEditor}>
            Abrir editor
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            {source === "preset" ? (
              <Select name="preset" aria-label="Preset" className="min-w-0 flex-1" value={selectedPreset} onChange={(e) => setSelectedPreset(e.target.value)}>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            ) : (
              <Select name="set" aria-label="Set de preguntas" className="min-w-0 flex-1" value={selectedSet} onChange={(e) => setSelectedSet(e.target.value)}>
                {sets.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            )}
            <Button variant="primary" icon={Play} loading={starting} disabled={!canStart} onClick={start} className="sm:w-40">
              {starting ? "Iniciando…" : "Iniciar"}
            </Button>
          </div>
          <div className="mt-2 flex min-h-6 flex-wrap gap-1.5">
            {source === "preset" && chosen && (
              <>
                <Badge variant="accent">{chosen.mode}</Badge>
                <Badge>
                  <ListOrdered className="size-3" /> {chosen.question_count} {chosen.mode === "Rosco" ? "letras" : "preguntas"}
                </Badge>
                <Badge>
                  <Clock className="size-3" /> {chosen.time_limit}s {chosen.mode === "Rosco" ? "en total" : "por pregunta"}
                </Badge>
                <Badge>
                  <Palette className="size-3" /> {getTheme(chosen.theme).name}
                </Badge>
                {chosen.twitch_channel && (
                  <Badge variant="info">
                    <Radio className="size-3" /> #{chosen.twitch_channel}
                  </Badge>
                )}
              </>
            )}
            {source === "set" && setQuestions && (
              <>
                {setMode ? <Badge variant="accent">{setMode}</Badge> : <Badge variant="danger">Vacío</Badge>}
                <Badge>
                  <FileQuestion className="size-3" /> {setQuestions.length} {setMode === "Rosco" ? "letras" : "preguntas"}
                </Badge>
                {setMode && (
                  <Badge>
                    <Clock className="size-3" /> {SET_DEFAULT_TIME[setMode]}
                  </Badge>
                )}
                <span className="self-center text-[11px] text-zinc-500">Tema actual · sin Twitch</span>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
