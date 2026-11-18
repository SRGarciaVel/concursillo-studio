import clasico from "./clasico.json";
import defaultTheme from "./default.json";
import neon from "./neon.json";

/**
 * Un tema es un JSON con variables CSS que el stage inyecta en `:root`.
 * Para añadir uno: crea `<id>.json` aquí y regístralo en `THEMES`.
 * El id debe cumplir `[a-z0-9_-]{1,32}` (lo valida el backend).
 */
export interface Theme {
  id: string;
  name: string;
  /** Hoja de estilos de fuentes (Google Fonts) o null. */
  fontUrl: string | null;
  vars: Record<`--${string}`, string>;
}

export const THEMES: Theme[] = [defaultTheme, clasico, neon] as Theme[];
export const DEFAULT_THEME_ID = "default";

export function getTheme(id: string | undefined | null): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

const FONT_LINK_ID = "concursillo-theme-font";

/** Inyecta las variables CSS del tema en `:root` y carga su fuente. */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  // Quitar variables del tema anterior que el nuevo no define.
  for (const t of THEMES) {
    for (const key of Object.keys(t.vars)) {
      if (!(key in theme.vars)) root.style.removeProperty(key);
    }
  }
  for (const [key, value] of Object.entries(theme.vars)) root.style.setProperty(key, value);
  root.dataset.theme = theme.id;

  let link = document.getElementById(FONT_LINK_ID) as HTMLLinkElement | null;
  if (!theme.fontUrl) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== theme.fontUrl) link.href = theme.fontUrl;
}
