import type { ReactNode } from "react";
import { CircleCheck, Info, OctagonX } from "lucide-react";
import { cn } from "./cn";

export type NoticeKind = "ok" | "error" | "info";

const STYLES: Record<NoticeKind, string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-200",
};

const ICONS = { ok: CircleCheck, error: OctagonX, info: Info };

/** Mensaje de resultado (éxito / error / información) con icono. */
export function Notice({ kind, children, className }: { kind: NoticeKind; children: ReactNode; className?: string }) {
  const Icon = ICONS[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("flex animate-fade-in items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", STYLES[kind], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
