import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type BadgeVariant = "neutral" | "accent" | "success" | "danger" | "warning" | "info";

const VARIANTS: Record<BadgeVariant, string> = {
  neutral: "bg-zinc-800 text-zinc-300 ring-zinc-700",
  accent: "bg-brand-500/15 text-brand-400 ring-brand-500/30",
  success: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  danger: "bg-rose-500/15 text-rose-300 ring-rose-500/30",
  warning: "bg-amber-400/15 text-amber-300 ring-amber-400/30",
  info: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
};

const DOTS: Record<BadgeVariant, string> = {
  neutral: "bg-zinc-400",
  accent: "bg-brand-400",
  success: "bg-emerald-400",
  danger: "bg-rose-400",
  warning: "bg-amber-300",
  info: "bg-sky-400",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Punto de estado a la izquierda; `pulse` lo hace latir (p. ej. "en directo"). */
  dot?: boolean | "pulse";
  children?: ReactNode;
}

export function Badge({ variant = "neutral", dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {dot && (
        <span className="relative flex size-2">
          {dot === "pulse" && <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", DOTS[variant])} />}
          <span className={cn("relative inline-flex size-2 rounded-full", DOTS[variant])} />
        </span>
      )}
      {children}
    </span>
  );
}
