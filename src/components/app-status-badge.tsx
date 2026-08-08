import type { ReactNode } from "react";

const variants = { neutral: "bg-white/[0.05] text-zinc-400", success: "bg-emerald-400/[0.08] text-emerald-300", warning: "bg-amber-400/10 text-amber-200", danger: "bg-rose-400/[0.08] text-rose-300" };

export function AppStatusBadge({ children, variant = "neutral" }: { children: ReactNode; variant?: keyof typeof variants }) {
  return <span className={`inline-flex min-h-7 items-center rounded-xl px-2.5 text-xs font-medium ${variants[variant]}`}>{children}</span>;
}
