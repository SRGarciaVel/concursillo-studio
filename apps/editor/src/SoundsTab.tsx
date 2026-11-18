import { useEffect, useRef, useState } from "react";
import { Undo2, Upload, Volume2 } from "lucide-react";
import { Badge, Button, Card, Notice, cn, DEFAULT_SOUNDS_URL, errorMessage, listSounds, resetSound, saveCustomSound } from "@concursillo/ui";
import type { SoundFileInfo } from "@concursillo/shared-types";

const LABELS: Record<string, { title: string; when: string }> = {
  play_tension: { title: "Tensión", when: "Al cargar una pregunta (en bucle)" },
  play_correct: { title: "Correcto", when: "Respuesta correcta" },
  play_wrong: { title: "Incorrecto", when: "Fallo o tiempo agotado" },
  play_win: { title: "Victoria", when: "Partida ganada" },
  play_pass: { title: "Pasapalabra", when: "Rosco: el concursante pasa" },
  play_drumroll: { title: "Redoble", when: "Soundboard del Control" },
  play_applause: { title: "Aplausos", when: "Soundboard del Control" },
};

const MAX_MB = 10;
type NoticeState = { kind: "ok" | "error"; text: string } | null;

function SoundRow({ info, refresh, nonce, notify }: { info: SoundFileInfo; refresh: () => Promise<void>; nonce: number; notify: (n: NoticeState) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = LABELS[info.name] ?? { title: info.name, when: "" };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      notify({ kind: "error", text: `«${file.name}» pesa más de ${MAX_MB} MB` });
      return;
    }
    setBusy(true);
    try {
      await saveCustomSound(info.name, file);
      notify({ kind: "ok", text: `«${label.title}» sustituido por ${file.name}. El stage ya lo usa.` });
      await refresh();
    } catch (e) {
      notify({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      await resetSound(info.name);
      notify({ kind: "ok", text: `«${label.title}» vuelve a ser el original` });
      await refresh();
    } catch (e) {
      notify({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      data-sound={info.name}
      className={cn(
        "sound-row grid grid-cols-1 items-center gap-3 rounded-xl border border-line bg-zinc-950/40 p-3 transition-opacity lg:grid-cols-[minmax(0,1fr)_17rem_auto]",
        busy && "opacity-60",
      )}
    >
      <div className="sound-info flex min-w-0 items-center gap-3">
        <div className={cn("grid size-10 shrink-0 place-items-center rounded-xl", info.custom ? "bg-brand-500/20 text-brand-400" : "bg-zinc-800 text-zinc-400")}>
          <Volume2 className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{label.title}</span>
            <code className="font-mono text-xs text-zinc-500">{info.name}</code>
            {info.custom ? <Badge variant="accent">personalizado</Badge> : info.file ? <Badge>original</Badge> : <Badge variant="warning">sin archivo</Badge>}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {label.when} · {info.file ? `${info.file} · ${(info.size_bytes / 1024).toFixed(0)} KB` : "no sonará"}
          </div>
        </div>
      </div>
      {info.file ? (
        // `nonce` evita que el reproductor use la versión antigua de la caché.
        <audio controls preload="none" className="h-9 w-full [color-scheme:dark]" src={`${DEFAULT_SOUNDS_URL}/${info.file}?t=${nonce}`} />
      ) : (
        <span className="text-xs text-zinc-600">—</span>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <input
          ref={input}
          type="file"
          name={`upload_${info.name}`}
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <Button variant="primary" icon={Upload} loading={busy} onClick={() => input.current?.click()}>
          Subir .mp3 / .wav
        </Button>
        {info.custom && info.has_default && (
          <Button variant="ghost" icon={Undo2} disabled={busy} onClick={restore}>
            Restaurar original
          </Button>
        )}
      </div>
    </li>
  );
}

/** Pestaña "Sonidos": sustituir los efectos del sistema por archivos propios. */
export function SoundsTab() {
  const [sounds, setSounds] = useState<SoundFileInfo[]>([]);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [nonce, setNonce] = useState(() => Date.now());

  const refresh = async () => {
    try {
      setSounds(await listSounds());
      setNonce(Date.now());
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="sounds-tab flex flex-col gap-4">
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <Card title="Sonidos del sistema" icon={Volume2}>
        <p className="mb-4 text-sm text-zinc-400">
          Sube un .mp3 o .wav (máx. {MAX_MB} MB) para sustituir cada efecto. Se guarda en <code className="font-mono text-zinc-300">data/sounds/</code> y el
          stage lo carga al momento, sin recargar OBS.
        </p>
        <ul className="sound-list flex flex-col gap-2">
          {sounds.map((s) => (
            <SoundRow key={s.name} info={s} refresh={refresh} nonce={nonce} notify={setNotice} />
          ))}
        </ul>
      </Card>
    </div>
  );
}
