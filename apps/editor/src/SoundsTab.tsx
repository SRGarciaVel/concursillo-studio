import { useEffect, useRef, useState } from "react";
import { DEFAULT_SOUNDS_URL, errorMessage, listSounds, resetSound, saveCustomSound } from "@concursillo/ui";
import type { SoundFileInfo } from "@concursillo/shared-types";

const LABELS: Record<string, { title: string; when: string }> = {
  play_tension: { title: "Tensión", when: "Al cargar una pregunta (en bucle)" },
  play_correct: { title: "Correcto", when: "Respuesta correcta" },
  play_wrong: { title: "Incorrecto", when: "Fallo o tiempo agotado" },
  play_win: { title: "Victoria", when: "Partida ganada" },
  play_pass: { title: "Pasapalabra", when: "Rosco: el concursante pasa" },
};

const MAX_MB = 10;
type Notice = { kind: "ok" | "error"; text: string } | null;

function SoundRow({ info, refresh, nonce, notify }: { info: SoundFileInfo; refresh: () => Promise<void>; nonce: number; notify: (n: Notice) => void }) {
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
    <li className={`sound-row${busy ? " is-busy-row" : ""}`} data-sound={info.name}>
      <div className="sound-info">
        <div className="q-text">
          {label.title} <code className="muted">{info.name}</code>
          {info.custom && <span className="badge">personalizado</span>}
        </div>
        <div className="hint">
          {label.when} · {info.file ? `${info.file} · ${(info.size_bytes / 1024).toFixed(0)} KB` : "sin archivo (no sonará)"}
        </div>
      </div>
      {info.file ? (
        // `nonce` evita que el reproductor use la versión antigua de la caché.
        <audio controls preload="none" src={`${DEFAULT_SOUNDS_URL}/${info.file}?t=${nonce}`} />
      ) : (
        <span className="muted">—</span>
      )}
      <div className="sound-actions">
        <input
          ref={input}
          type="file"
          name={`upload_${info.name}`}
          accept=".mp3,.wav,audio/mpeg,audio/wav"
          hidden
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        <button type="button" disabled={busy} className={busy ? "is-busy" : undefined} onClick={() => input.current?.click()}>
          Subir .mp3 / .wav
        </button>
        {info.custom && info.has_default && (
          <button type="button" className="secondary" disabled={busy} onClick={restore}>
            Restaurar original
          </button>
        )}
      </div>
    </li>
  );
}

/** Pestaña "Sonidos": sustituir los efectos del sistema por archivos propios. */
export function SoundsTab() {
  const [sounds, setSounds] = useState<SoundFileInfo[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
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
    <div className="tab-body">
      {notice && <p className={`notice notice-${notice.kind}`}>{notice.text}</p>}
      <section className="panel">
        <h2>Sonidos del sistema</h2>
        <p className="hint">
          Sube un .mp3 o .wav (máx. {MAX_MB} MB) para sustituir cada efecto. Se guarda en <code>data/sounds/</code> y el
          stage lo carga al momento, sin recargar OBS.
        </p>
        <ul className="sound-list">
          {sounds.map((s) => (
            <SoundRow key={s.name} info={s} refresh={refresh} nonce={nonce} notify={setNotice} />
          ))}
        </ul>
      </section>
    </div>
  );
}
