import type { ComponentType, HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type IconType = ComponentType<{ className?: string }>;

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** Icono de lucide-react junto al título. */
  icon?: IconType;
  /** Elementos a la derecha de la cabecera (badges, botones…). */
  actions?: ReactNode;
  /** Resalta la tarjeta (por ejemplo, cuando hay algo en curso). */
  tone?: "default" | "accent" | "warning" | "danger";
  /** Cabecera y márgenes más ajustados (dashboards que no deben hacer scroll). */
  compact?: boolean;
  bodyClassName?: string;
  children?: ReactNode;
}

// Lo activo no se marca solo con un borde: brilla (glow difuso de su color).
const TONES = {
  default: "border-line shadow-xl shadow-black/30",
  accent: "border-brand-500/40 shadow-glow-brand",
  warning: "border-amber-400/40 shadow-glow-amber",
  danger: "border-rose-500/40 shadow-glow-rose",
};

/** Tarjeta con borde suave, sombra profunda y cabecera opcional. */
export function Card({ title, icon: Icon, actions, tone = "default", compact = false, className, bodyClassName, children, ...rest }: CardProps) {
  return (
    <section
      className={cn(
        "rounded-2xl border bg-surface backdrop-blur-md",
        "ring-1 ring-inset ring-white/[0.02] transition-[border-color,box-shadow] duration-500",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {(title || actions) && (
        <header className={cn("flex items-center justify-between gap-3 border-b border-line", compact ? "min-h-10 px-3 py-1.5" : "px-4 py-3")}>
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-wide text-zinc-200">
            {Icon && <Icon className="size-4 shrink-0 text-brand-400" />}
            <span className="truncate">{title}</span>
          </h2>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(compact ? "p-3" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
