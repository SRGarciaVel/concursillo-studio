import type { Sound } from "@concursillo/shared-types";

/** Base desde la que el backend sirve `data/sounds/`. */
export const DEFAULT_SOUNDS_URL = "http://127.0.0.1:4322/sounds";

/** Formatos que se prueban, en orden: el `.mp3` del usuario gana al `.wav` de prueba. */
const EXTENSIONS = ["mp3", "wav"] as const;

/** Sonidos que suenan en bucle hasta que llega otro evento (o se para). */
const LOOPING: ReadonlySet<Sound> = new Set<Sound>(["play_tension"]);

export const ALL_SOUNDS: Sound[] = ["play_tension", "play_correct", "play_wrong", "play_win", "play_pass", "play_drumroll", "play_applause"];

type Logger = (message: string) => void;

/**
 * Reproductor de efectos para el stage.
 *
 * - Precarga cada sonido probando `<nombre>.mp3` y luego `<nombre>.wav`.
 * - Si no existe ninguno, el evento se ignora en silencio (solo se registra en el log).
 * - Los efectos puntuales suenan encima del bucle de tensión.
 */
export class SoundPlayer {
  private readonly elements = new Map<Sound, HTMLAudioElement | null>();
  private readonly ready = new Map<Sound, Promise<HTMLAudioElement | null>>();
  private loop: HTMLAudioElement | null = null;

  /**
   * @param version `GameState.sounds_version`: va en la URL (`?v=N`) para que,
   *   cuando el streamer cambia un sonido, el navegador no use el de la caché.
   */
  constructor(
    private readonly version: number = 0,
    private readonly baseUrl: string = DEFAULT_SOUNDS_URL,
    private readonly log: Logger = (m) => console.info(`[audio] ${m}`),
  ) {
    for (const sound of ALL_SOUNDS) this.ready.set(sound, this.load(sound));
  }

  private load(sound: Sound): Promise<HTMLAudioElement | null> {
    const tryExt = (i: number): Promise<HTMLAudioElement | null> =>
      new Promise((resolve) => {
        if (i >= EXTENSIONS.length) {
          this.log(`sin archivo para «${sound}» (busqué ${EXTENSIONS.map((e) => `${sound}.${e}`).join(", ")})`);
          resolve(null);
          return;
        }
        const audio = new Audio();
        audio.preload = "auto";
        audio.loop = LOOPING.has(sound);
        // loadedmetadata basta para saber que el archivo existe y es decodificable.
        audio.addEventListener("loadedmetadata", () => resolve(audio), { once: true });
        audio.addEventListener("error", () => resolve(tryExt(i + 1)), { once: true });
        audio.src = `${this.baseUrl}/${sound}.${EXTENSIONS[i]}?v=${this.version}`;
      });
    return tryExt(0).then((audio) => {
      this.elements.set(sound, audio);
      if (audio) this.log(`listo «${sound}» → ${audio.src}`);
      return audio;
    });
  }

  /** Para el bucle de tensión (p. ej. al reiniciar la partida). */
  stopLoop(): void {
    if (!this.loop) return;
    this.loop.pause();
    this.loop.currentTime = 0;
    this.loop = null;
  }

  /** Congela/reanuda el bucle sin reiniciarlo (pausa del reloj). */
  setLoopPaused(paused: boolean): void {
    if (!this.loop) return;
    if (paused) this.loop.pause();
    else void this.loop.play().catch(() => {});
  }

  /**
   * Los efectos puntuales suenan encima del bucle; solo otro bucle lo sustituye.
   * Cortar la tensión cuando la pregunta deja de estar en juego es cosa del
   * stage (según la fase), así en el rosco sigue sonando entre letras.
   */
  async play(sound: Sound): Promise<void> {
    if (LOOPING.has(sound)) this.stopLoop();
    const audio = await this.ready.get(sound);
    if (!audio) {
      this.log(`evento «${sound}» ignorado: no hay archivo`);
      return;
    }
    audio.currentTime = 0;
    if (LOOPING.has(sound)) this.loop = audio;
    try {
      await audio.play();
      this.log(`▶ ${sound}`);
    } catch (e) {
      // Navegadores bloquean audio sin interacción previa; OBS no.
      this.log(`no se pudo reproducir «${sound}»: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  dispose(): void {
    this.stopLoop();
    for (const audio of this.elements.values()) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.elements.clear();
  }
}
