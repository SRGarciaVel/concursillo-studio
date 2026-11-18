import type { Comodin } from "@concursillo/shared-types";

/** Orden y textos de los comodines, compartidos por control y stage. */
export const COMODINES: Comodin[] = ["Chat", "Llamada", "Sacrificio", "Ruleta"];

export const COMODIN_INFO: Record<Comodin, { icon: string; label: string; title: string; subtitle: (seconds: number | null) => string }> = {
  Chat: { icon: "💬", label: "Chat", title: "Comodín del chat", subtitle: () => "Votad en el chat" },
  Llamada: {
    icon: "📞",
    label: "Llamada",
    title: "Comodín de la llamada",
    subtitle: (s) => `${s ?? 45} segundos para llamar`,
  },
  Sacrificio: { icon: "🎯", label: "Sacrificio", title: "Comodín del sacrificio", subtitle: () => "Un espectador responde" },
  Ruleta: { icon: "🎲", label: "Ruleta", title: "Comodín de la ruleta", subtitle: () => "¡Que gire la ruleta!" },
};
