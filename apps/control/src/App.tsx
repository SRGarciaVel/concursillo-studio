import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Gamepad2, Palette, SquarePen } from "lucide-react";
import { Badge, Button, Select, Switch, errorMessage, listPresets, loadPreset, openEditor, useGameSocket } from "@concursillo/ui";
import { THEMES } from "@concursillo/themes";
import type { ClientCommand, PresetSummary } from "@concursillo/shared-types";
import { ActionsCard } from "./ActionsCard";
import { ComodinesCard } from "./ComodinesCard";
import { LogCard, type LogEntry } from "./LogCard";
import { PresetCard } from "./PresetCard";
import { StatusCard } from "./StatusCard";
import { TwitchCard } from "./TwitchCard";

/** Muelle elástico para recolocar paneles. */
const LAYOUT_SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;

/** Contenedor de tarjeta que se recoloca con animación (layout) y entra/sale con fundido. */
function Panel({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  return (
    <motion.div
      layout="position"
      layoutId={`panel-${id}`}
      transition={LAYOUT_SPRING}
      initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const CONNECTION = {
  open: { label: "Motor conectado", variant: "success" as const, dot: "pulse" as const },
  connecting: { label: "Conectando…", variant: "warning" as const, dot: true },
  closed: { label: "Motor desconectado", variant: "danger" as const, dot: true },
};

/** Resumen corto para el log (las listas de preguntas son demasiado largas). */
function describe(cmd: ClientCommand): string {
  if (cmd.action === "init_game") return `init_game (${cmd.payload.length} preguntas)`;
  if (cmd.action === "init_rosco") return `init_rosco (${cmd.payload.questions.length} letras)`;
  if (cmd.action === "start_preset") return `start_preset «${cmd.payload.preset.name}» (${cmd.payload.preset.mode})`;
  // Nunca escribir el token en el log.
  if (cmd.action === "connect_twitch") return `connect_twitch #${cmd.payload.channel}${cmd.payload.token ? " (con token)" : " (anónimo)"}`;
  return "payload" in cmd ? `${cmd.action} ${JSON.stringify(cmd.payload)}` : cmd.action;
}

export default function App() {
  const { state, status, lastError, sendCommand } = useGameSocket();
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [presetsError, setPresetsError] = useState<string | null>(null);

  const addLog = (kind: LogEntry["kind"], text: string) =>
    setLog((l) => [{ id: ++logId.current, time: new Date().toLocaleTimeString(), kind, text }, ...l].slice(0, 60));

  const send = (cmd: ClientCommand) => {
    const ok = sendCommand(cmd);
    addLog(ok ? "sent" : "fail", ok ? describe(cmd) : `sin conexión: ${describe(cmd)}`);
  };

  // Los errores del backend también quedan en el log (en rojo).
  useEffect(() => {
    if (lastError) addLog("error", lastError);
  }, [lastError]);

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

  // "Iniciando…" desde el clic hasta que llega el siguiente estado del backend.
  const [starting, setStarting] = useState(false);
  useEffect(() => setStarting(false), [state, lastError]);

  /** Un único comando: el backend aplica modo, preguntas, tiempo, tema y Twitch. */
  const startPreset = async () => {
    setStarting(true);
    try {
      const preset = await loadPreset(selectedPreset);
      addLog("info", `preset «${preset.name}» cargado`);
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
      addLog("error", `no se pudo abrir el editor: ${errorMessage(e)}`);
    }
  };

  const conn = CONNECTION[status];
  const online = status === "open";

  // h-screen + overflow-hidden: la ventana nunca hace scroll; si algo no cabe, solo se desplaza su columna.
  return (
    <div className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 overflow-hidden p-3 lg:px-4">
      {/* Cabecera: marca, conexión, tema y editor. */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-fuchsia-600 shadow-lg shadow-brand-600/30">
            <Gamepad2 className="size-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">Concursillo Studio</h1>
            <p className="text-xs text-zinc-500">Panel de control</p>
          </div>
          <Badge variant={conn.variant} dot={conn.dot} className="ml-2">
            {conn.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <Palette className="size-4" />
            <span className="sr-only sm:not-sr-only">Tema</span>
            <Select
              name="theme"
              className="w-36"
              value={state?.theme ?? ""}
              disabled={!online}
              onChange={(e) => send({ action: "change_theme", payload: e.target.value })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
          </label>
          {/* Fondo transparente: el stage se superpone limpio sobre el gameplay o la webcam en OBS. */}
          <div className="rounded-xl border border-line bg-white/[0.03] px-3 py-1.5" title="Quita el fondo del stage para superponerlo en OBS">
            <Switch
              name="transparent_background"
              label="Fondo transparente"
              checked={state?.transparent_background ?? false}
              disabled={!online}
              onChange={(on) => send({ action: "set_transparent_background", payload: on })}
            />
          </div>
          <Button variant="secondary" icon={SquarePen} onClick={showEditor} title="Abrir el editor (o traerlo al frente)">
            Editor
          </Button>
        </div>
      </header>

      {/* Dashboard: juego a la izquierda, configuración y comodines a la derecha. */}
      {/*
        LayoutGroup: cuando cambia el contenido de una tarjeta (Millonario ↔ Rosco,
        comodín abierto, log desplegado…) las demás se recolocan con un muelle
        en lugar de saltar de golpe.
      */}
      <LayoutGroup>
        <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:overflow-visible">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:-mr-1 lg:overflow-y-auto lg:pr-1">
            <Panel id="status">
              <StatusCard state={state} />
            </Panel>
            <Panel id="actions">
              <ActionsCard state={state} online={online} send={send} />
            </Panel>
            <Panel id="log" className="flex min-h-0 flex-1 flex-col">
              <LogCard entries={log} onClear={() => setLog([])} />
            </Panel>
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:-mr-1 lg:overflow-y-auto lg:pr-1">
            <Panel id="preset">
              <PresetCard
                presets={presets}
                selected={selectedPreset}
                onSelect={setSelectedPreset}
                onStart={startPreset}
                onRefresh={refreshPresets}
                starting={starting}
                online={online}
                error={presetsError}
              />
            </Panel>
            <AnimatePresence initial={false}>
              {state && (
                <Panel id="twitch" key="twitch">
                  <TwitchCard state={state} send={send} />
                </Panel>
              )}
              {state && (
                <Panel id="comodines" key="comodines">
                  <ComodinesCard state={state} send={send} />
                </Panel>
              )}
            </AnimatePresence>
          </div>
        </main>
      </LayoutGroup>
    </div>
  );
}
