import { Check, Copy, MonitorPlay } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Card, Switch, STAGE_URL, copyText, errorMessage, useToast } from "@concursillo/ui";
import type { ClientCommand, GameState } from "@concursillo/shared-types";

interface Props {
  state: GameState | null;
  online: boolean;
  send: (cmd: ClientCommand) => void;
}

/** "Conectar con OBS": la URL del Stage lista para copiar y el fondo transparente. */
export function ObsCard({ state, online, send }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await copyText(STAGE_URL);
      setCopied(true);
      toast.success("¡URL copiada al portapapeles!");
    } catch (e) {
      toast.error(`No se pudo copiar la URL: ${errorMessage(e)}`);
    }
  };

  // Compacta (≈100 px): cabe en la columna derecha sin hacer scroll a 1280×720.
  return (
    <Card compact bodyClassName="flex flex-col gap-0.5 !py-1.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-zinc-200">
          <MonitorPlay className="size-4 text-brand-400" /> Conectar con OBS
        </h2>
        <Switch
          name="transparent_background"
          label="Fondo transparente"
          checked={state?.transparent_background ?? false}
          disabled={!online}
          onChange={(on) => send({ action: "set_transparent_background", payload: on })}
        />
      </div>
      <div className="flex items-center gap-2">
        {/* Seleccionable a mano por si el portapapeles fallara. */}
        <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-line bg-zinc-950/60 px-3 py-1 font-mono text-sm text-brand-200">
          {STAGE_URL}
        </code>
        <Button size="sm" variant={copied ? "success" : "primary"} icon={copied ? Check : Copy} onClick={copy} className="!h-7 w-32">
          {copied ? "Copiada" : "Copiar URL"}
        </Button>
      </div>
      <p className="truncate text-[11px] leading-4 text-zinc-500" title="Añade esta URL como «Fuente de navegador» en OBS (1920×1080). Para fondo transparente, activa el interruptor.">
        Añade esta URL como «Fuente de navegador» en OBS. Para fondo transparente, activa el interruptor.
      </p>
    </Card>
  );
}
