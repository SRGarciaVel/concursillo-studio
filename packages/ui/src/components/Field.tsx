import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";

/** Estilo común de los controles de formulario. */
const CONTROL = cn(
  "w-full rounded-xl border border-white/10 bg-zinc-950/60 px-3 text-sm text-zinc-100",
  "placeholder:text-zinc-500 shadow-inner shadow-black/30",
  "transition-[border-color,box-shadow,background-color] duration-150",
  "hover:border-white/20",
  "focus:border-brand-500 focus:bg-zinc-950 focus:outline-none focus:ring-4 focus:ring-brand-500/20",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-[invalid=true]:border-rose-500/70 aria-[invalid=true]:focus:ring-rose-500/20",
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(CONTROL, "h-10", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(CONTROL, "min-h-20 resize-y py-2.5 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className={cn("relative", className)}>
      <select ref={ref} className={cn(CONTROL, "h-10 cursor-pointer appearance-none pr-9 [&>option]:bg-zinc-900")} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
});

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Etiqueta + control + ayuda/error. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-xs font-medium tracking-wide text-zinc-400">{label}</span>
      {children}
      {error ? <span className="text-xs text-rose-300">{error}</span> : hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

/** Interruptor accesible (checkbox con aspecto de switch). */
export function Switch({
  checked,
  onChange,
  label,
  name,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  name?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer select-none items-center gap-2.5 text-sm text-zinc-200", disabled && "opacity-50")}>
      <input
        type="checkbox"
        name={name}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={cn(
          "relative h-6 w-10 rounded-full bg-zinc-700 transition-colors duration-200 peer-checked:bg-brand-500",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-brand-400 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas",
          "after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-200",
          "peer-checked:after:translate-x-4",
        )}
      />
      {label}
    </label>
  );
}
