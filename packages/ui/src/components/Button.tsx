import { forwardRef, type ButtonHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "warning" | "ghost";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

type IconType = ComponentType<{ className?: string; strokeWidth?: number }>;

/** Los manejadores de animación/arrastre nativos chocan con los de Motion. */
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onAnimationEnd" | "onAnimationIteration" | "onDrag" | "onDragStart" | "onDragEnd"
>;

export interface ButtonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icono de lucide-react a la izquierda del texto. */
  icon?: IconType;
  /** Muestra un spinner y bloquea el botón. */
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-lg shadow-brand-600/25 hover:from-brand-400 hover:to-brand-500 hover:shadow-glow-brand ring-1 ring-inset ring-white/10",
  secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ring-1 ring-inset ring-white/10",
  success:
    "bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:from-emerald-400 hover:to-emerald-500 hover:shadow-glow-emerald ring-1 ring-inset ring-white/10",
  danger:
    "bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-600/20 hover:from-rose-400 hover:to-rose-500 hover:shadow-glow-rose ring-1 ring-inset ring-white/10",
  warning:
    "bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 shadow-lg shadow-amber-500/20 hover:from-amber-300 hover:to-amber-400 hover:shadow-glow-amber ring-1 ring-inset ring-white/20",
  ghost: "bg-transparent text-zinc-300 hover:bg-white/5 hover:text-white",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs rounded-lg [&_svg]:size-3.5",
  md: "h-10 gap-2 px-4 text-sm rounded-xl [&_svg]:size-4",
  lg: "h-12 gap-2.5 px-5 text-base rounded-xl [&_svg]:size-5",
  xl: "min-h-16 gap-3 px-6 py-3 text-lg rounded-2xl [&_svg]:size-6",
};

/** Muelle del "clic físico": se hunde rápido y rebota al soltar. */
export const PRESS_SPRING = { type: "spring", stiffness: 520, damping: 22, mass: 0.6 } as const;

/**
 * Botón base. Efecto táctil con Motion: al pulsar se hunde (escala 0.95) y al
 * soltar rebota con un muelle. Hover con brillo de color y anillo de foco visible.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading = false, fullWidth, className, children, disabled, type = "button", ...rest },
  ref,
) {
  // Hook siempre en el mismo orden (nunca dentro de un cortocircuito).
  const reduceMotion = useReducedMotion() === true;
  const isDisabled = disabled || loading;
  // Sin "presión física" si está deshabilitado o el sistema pide reducir el movimiento.
  const inactive = isDisabled || reduceMotion;
  return (
    <motion.button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      whileHover={inactive ? undefined : { y: -1 }}
      whileTap={inactive ? undefined : { scale: 0.95, y: 1 }}
      transition={PRESS_SPRING}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold whitespace-nowrap",
        "transition-[background-color,box-shadow,color,opacity] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
        loading && "cursor-progress",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle className="animate-spin" /> : Icon ? <Icon strokeWidth={2.25} /> : null}
      {children}
    </motion.button>
  );
});

/** Botón cuadrado solo con icono (con etiqueta accesible obligatoria). */
export function IconButton({ label, ...props }: Omit<ButtonProps, "children"> & { label: string }) {
  return <Button aria-label={label} title={label} className={cn("!px-0 aspect-square", props.className)} {...props} />;
}
