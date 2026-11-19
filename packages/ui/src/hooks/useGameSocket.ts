import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientCommand, GameState, ServerMessage, Sound } from "@concursillo/shared-types";

export const DEFAULT_WS_URL = "ws://127.0.0.1:4322/ws";

const MIN_RETRY_MS = 500;
const MAX_RETRY_MS = 5000;

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface UseGameSocket {
  /** Último estado recibido del backend (null hasta el primer mensaje). */
  state: GameState | null;
  status: ConnectionStatus;
  /** Último error enviado por el servidor (comando inválido, etc.). */
  lastError: string | null;
  /** Sube con cada error, aunque el texto se repita (sirve como dependencia de efectos). */
  errorCount: number;
  /** Envía un comando. Devuelve false si el socket no está abierto. */
  sendCommand: (command: ClientCommand) => boolean;
}

/**
 * Conecta con el servidor WebSocket de Rust. El estado vive en el backend:
 * este hook solo refleja el último `GameState` emitido y reenvía comandos.
 * Reconecta automáticamente con backoff exponencial (0.5 s → 5 s).
 */
export interface UseGameSocketOptions {
  url?: string;
  /** Se llama con cada evento de audio. Solo el stage debería reproducirlos. */
  onAudio?: (sound: Sound) => void;
  /** Se llama con cada error del servidor, también si se repite el mismo texto. */
  onError?: (message: string) => void;
}

export function useGameSocket({ url = DEFAULT_WS_URL, onAudio, onError }: UseGameSocketOptions = {}): UseGameSocket {
  const [state, setState] = useState<GameState | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  // Ref para no reconectar cuando cambia la identidad del callback.
  const onAudioRef = useRef(onAudio);
  onAudioRef.current = onAudio;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let disposed = false;
    let retryMs = MIN_RETRY_MS;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        retryMs = MIN_RETRY_MS;
        setStatus("open");
        setLastError(null);
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          console.warn("[useGameSocket] mensaje no JSON:", event.data);
          return;
        }
        switch (msg.type) {
          case "state":
            setState(msg.payload);
            break;
          case "error":
            setLastError(msg.payload);
            setErrorCount((n) => n + 1);
            onErrorRef.current?.(msg.payload);
            break;
          case "audio":
            onAudioRef.current?.(msg.payload.sound);
            break;
        }
      };

      // onerror siempre va seguido de onclose; la reconexión se gestiona ahí.
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        setStatus("closed");
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [url]);

  const sendCommand = useCallback((command: ClientCommand) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(command));
    return true;
  }, []);

  return { state, status, lastError, errorCount, sendCommand };
}
