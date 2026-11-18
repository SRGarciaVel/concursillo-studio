import { useId, type ComponentType, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "./cn";

type IconType = ComponentType<{ className?: string }>;

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  icon?: IconType;
  /** Contador o aviso pequeño a la derecha de la etiqueta. */
  badge?: ReactNode;
}

/** Pestañas segmentadas (role=tablist), con la activa resaltada. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  // Id único por grupo de pestañas: la "píldora" activa se desliza entre ellas.
  const pillId = useId();
  return (
    <nav role="tablist" className={cn("inline-flex gap-1 rounded-2xl border border-line bg-zinc-900/80 p-1 shadow-lg shadow-black/20", className)}>
      {items.map(({ id, label, icon: Icon, badge }) => {
        const active = id === value;
        return (
          <button
            key={id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "relative inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors duration-150",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400",
              active ? "text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-pill-${pillId}`}
                className="absolute inset-0 rounded-xl bg-gradient-to-b from-brand-500 to-brand-600 shadow-glow-brand"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {Icon && <Icon className="size-4" />}
              {label}
              {badge}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
