import { useState, type FormEvent } from "react";
import { KeyRound, Link, Radio, Unlink } from "lucide-react";
import { Badge, Button, Card, Input, Notice, Switch, type BadgeVariant } from "@concursillo/ui";
import type { ClientCommand, GameState, TwitchStatus } from "@concursillo/shared-types";

interface Props {
  state: GameState;
  send: (cmd: ClientCommand) => void;
}

const STATUS: Record<TwitchStatus, { label: string; variant: BadgeVariant; dot: boolean | "pulse" }> = {
  Disconnected: { label: "Desconectado", variant: "neutral", dot: true },
  Connecting: { label: "Conectando…", variant: "warning", dot: "pulse" },
  Connected: { label: "En directo", variant: "success", dot: "pulse" },
  Error: { label: "Error", variant: "danger", dot: true },
};

/** Conexión al chat de Twitch (compacta: canal en línea; credenciales opcionales plegadas). */
export function TwitchCard({ state, send }: Props) {
  const tw = state.twitch;
  const [channel, setChannel] = useState(tw.channel ?? "");
  const [withAccount, setWithAccount] = useState(false);
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  // En Error la tarea puede seguir reintentando: también hay que poder desconectar.
  const busy = tw.status !== "Disconnected";
  const st = STATUS[tw.status];

  const connect = (e: FormEvent) => {
    e.preventDefault();
    const payload: Extract<ClientCommand, { action: "connect_twitch" }>["payload"] = { channel: channel.trim() };
    if (withAccount && token.trim()) {
      payload.token = token.trim();
      payload.username = username.trim();
    }
    send({ action: "connect_twitch", payload });
    // El token no se queda en la pantalla ni en el estado del panel.
    setToken("");
  };

  return (
    <Card
      compact
      title="Twitch"
      icon={Radio}
      actions={
        <Badge variant={st.variant} dot={st.dot}>
          {st.label}
          {tw.channel && busy ? ` · #${tw.channel}` : ""}
        </Badge>
      }
    >
      <form onSubmit={connect} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">#</span>
            <Input
              name="twitchChannel"
              value={channel}
              placeholder="tu_canal"
              className="pl-7"
              onChange={(e) => setChannel(e.target.value)}
              disabled={busy}
              aria-label="Canal de Twitch"
            />
          </div>
          {busy ? (
            <Button variant="secondary" icon={Unlink} onClick={() => send({ action: "disconnect_twitch" })}>
              Desconectar
            </Button>
          ) : (
            <Button type="submit" variant="primary" icon={Link} disabled={channel.trim().length < 3}>
              Conectar
            </Button>
          )}
        </div>

        {!busy && (
          <Switch
            name="twitchWithAccount"
            checked={withAccount}
            onChange={setWithAccount}
            label={<span className="text-xs text-zinc-400">Usar cuenta (usuario + token). Para contar votos no hace falta.</span>}
          />
        )}
        {!busy && withAccount && (
          <div className="grid animate-fade-in grid-cols-2 gap-2">
            <Input name="twitchUser" value={username} placeholder="Usuario" autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                name="twitchToken"
                type="password"
                value={token}
                placeholder="Token OAuth"
                autoComplete="off"
                className="pl-9"
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
          </div>
        )}
        {tw.status === "Connected" && (
          <p className="text-xs text-zinc-500">{tw.authenticated ? "Conectado con cuenta." : "Conexión anónima de solo lectura."} El token nunca se guarda ni llega al stage.</p>
        )}
        {tw.error && <Notice kind="error">{tw.error}</Notice>}
      </form>
    </Card>
  );
}
