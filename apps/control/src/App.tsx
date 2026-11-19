import { useState, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { FolderOpen, Gamepad2, Palette, SquarePen } from "lucide-react";
import { Badge, Button, Select, errorMessage, openEditor, openLogsFolder, useGameSocket, useToast } from "@concursillo/ui";
import { THEMES } from "@concursillo/themes";
import type { ClientCommand } from "@concursillo/shared-types";
import { ActionsCard } from "./ActionsCard";
import { ComodinesCard } from "./ComodinesCard";
import { ObsCard } from "./ObsCard";
import { PresetCard } from "./PresetCard";
import { StatusCard } from "./StatusCard";
import { TwitchCard } from "./TwitchCard";
import { ShortcutsHelp, useLiveShortcuts } from "./shortcuts";

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

export default function App() {
  const toast = useToast();
  // Los rechazos del backend (p. ej. "no hay pregunta cargada") se ven como aviso,
  // también si se repite el mismo. El detalle técnico queda en el log del backend.
  const { state, status, errorCount, sendCommand } = useGameSocket({ onError: (msg) => toast.error(msg) });

  /** Envía un comando; si no hay conexión con el motor, avisa en lugar de fallar en silencio. */
  const send = (cmd: ClientCommand) => {
    if (!sendCommand(cmd)) toast.error("Sin conexión con el motor: el comando no se ha enviado");
  };

  const showEditor = async () => {
    try {
      await openEditor();
    } catch (e) {
      toast.error(`No se pudo abrir el editor: ${errorMessage(e)}`);
    }
  };

  const showLogs = async () => {
    try {
      await openLogsFolder();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const conn = CONNECTION[status];
  const online = status === "open";

  // Atajos de teclado del directo (1–4/A–D, Enter, Espacio, N, R/F/P, Esc, ?).
  const [helpOpen, setHelpOpen] = useState(false);
  useLiveShortcuts({ state, online, send, helpOpen, setHelpOpen });

  // h-screen + overflow-hidden: la ventana nunca hace scroll; si algo no cabe, solo se desplaza su columna.
  return (
    <div className="mx-auto flex h-screen max-w-[1600px] flex-col gap-3 overflow-hidden p-3 pb-1.5 lg:px-4">
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
          <Button variant="secondary" icon={SquarePen} onClick={showEditor} title="Abrir el editor (o traerlo al frente)">
            Editor
          </Button>
        </div>
      </header>

      {/*
        Dashboard: juego a la izquierda, configuración y comodines a la derecha.
        LayoutGroup: cuando cambia el contenido de una tarjeta (Millonario ↔ Rosco,
        comodín abierto…) las demás se recolocan con un muelle en lugar de saltar.
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
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:-mr-1 lg:overflow-y-auto lg:pr-1">
            <Panel id="preset">
              <PresetCard state={state} errorCount={errorCount} online={online} send={send} onOpenEditor={showEditor} />
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
            {/* Al final: se configura antes del directo; durante un comodín puede quedar debajo. */}
            <Panel id="obs">
              <ObsCard state={state} online={online} send={send} />
            </Panel>
          </div>
        </main>
      </LayoutGroup>

      <ShortcutsHelp open={helpOpen} setOpen={setHelpOpen} />

      {/* Pie discreto: diagnóstico para cuando algo falla en directo. */}
      <footer className="flex items-center justify-end gap-3 text-[11px] text-zinc-600">
        <button
          type="button"
          onClick={() => void showLogs()}
          className="inline-flex items-center gap-1 rounded px-1 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          title="Abre %APPDATA%\com.concursillo.studio\logs (app.log)"
        >
          <FolderOpen className="size-3" /> Abrir carpeta de logs
        </button>
      </footer>
    </div>
  );
}
