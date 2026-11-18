import { Clock, Layers, ListOrdered, Palette, Play, Radio, RefreshCw } from "lucide-react";
import { Badge, Button, Card, IconButton, Notice, Select } from "@concursillo/ui";
import { getTheme } from "@concursillo/themes";
import type { PresetSummary } from "@concursillo/shared-types";

interface Props {
  presets: PresetSummary[];
  selected: string;
  onSelect: (id: string) => void;
  onStart: () => void;
  onRefresh: () => void;
  starting: boolean;
  online: boolean;
  error: string | null;
}

/** Selector de preset con el botón de inicio destacado y un resumen visual. */
export function PresetCard({ presets, selected, onSelect, onStart, onRefresh, starting, online, error }: Props) {
  const chosen = presets.find((p) => p.id === selected);
  return (
    <Card
      compact
      title="Partida"
      icon={Layers}
      actions={<IconButton label="Recargar presets" icon={RefreshCw} variant="ghost" size="sm" onClick={onRefresh} />}
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <Select name="preset" className="min-w-0 flex-1" value={selected} onChange={(e) => onSelect(e.target.value)}>
          {presets.length === 0 && <option value="">Ningún preset: créalo en el editor</option>}
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Button variant="primary" icon={Play} loading={starting} disabled={!selected || !online} onClick={onStart} className="sm:w-40">
          {starting ? "Iniciando…" : "Iniciar"}
        </Button>
      </div>
      {chosen && (
        <div className="mt-2 flex flex-wrap gap-1.5">
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
        </div>
      )}
      {error && (
        <Notice kind="error" className="mt-3">
          {error}
        </Notice>
      )}
    </Card>
  );
}
