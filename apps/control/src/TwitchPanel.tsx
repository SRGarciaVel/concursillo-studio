import { useState, type FormEvent } from "react";
import type { ClientCommand, GameState, TwitchStatus } from "@concursillo/shared-types";

interface Props {
  state: GameState;
  send: (cmd: ClientCommand) => void;
}

const STATUS: Record<TwitchStatus, { label: string; cls: string }> = {
  Disconnected: { label: "Desconectado", cls: "closed" },
  Connecting: { label: "Conectando…", cls: "connecting" },
  Connected: { label: "Conectado", cls: "open" },
  Error: { label: "Error", cls: "closed" },
};

/** Conexión al chat de Twitch para el comodín del chat. */
export function TwitchPanel({ state, send }: Props) {
  const tw = state.twitch;
  const [channel, setChannel] = useState(tw.channel ?? "");
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  // En Error la tarea puede seguir reintentando: también hay que poder desconectar.
  const busy = tw.status !== "Disconnected";

  const connect = (e: FormEvent) => {
    e.preventDefault();
    const payload: Extract<ClientCommand, { action: "connect_twitch" }>["payload"] = { channel: channel.trim() };
    if (token.trim()) {
      payload.token = token.trim();
      payload.username = username.trim();
    }
    send({ action: "connect_twitch", payload });
    // El token no se queda en la pantalla ni en el estado del panel.
    setToken("");
  };

  return (
    <section className="panel twitch-panel">
      <h2>
        Conexión a Twitch{" "}
        <span className={`status status-${STATUS[tw.status].cls}`}>
          {STATUS[tw.status].label}
          {tw.channel && tw.status !== "Disconnected" ? ` · #${tw.channel}` : ""}
          {tw.status === "Connected" && (tw.authenticated ? " · con cuenta" : " · anónimo (solo lectura)")}
        </span>
      </h2>
      <form className="twitch-form" onSubmit={connect}>
        <label>
          Canal
          <input name="twitchChannel" value={channel} placeholder="tu_canal" onChange={(e) => setChannel(e.target.value)} disabled={busy} />
        </label>
        <label>
          Usuario <small>(solo con token)</small>
          <input name="twitchUser" value={username} autoComplete="off" onChange={(e) => setUsername(e.target.value)} disabled={busy} />
        </label>
        <label>
          Token OAuth <small>(opcional)</small>
          <input
            name="twitchToken"
            type="password"
            value={token}
            autoComplete="off"
            placeholder="vacío = anónimo"
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
          />
        </label>
        {busy ? (
          <button type="button" className="danger" onClick={() => send({ action: "disconnect_twitch" })}>
            Desconectar
          </button>
        ) : (
          <button type="submit" disabled={channel.trim().length < 3}>Conectar</button>
        )}
      </form>
      {tw.error && <p className="error">{tw.error}</p>}
      <p className="muted small">
        Para contar votos basta la conexión anónima. El token no se guarda ni se envía al stage.
      </p>
    </section>
  );
}
