import type { ReactNode } from "react";

export function AppFormSection({ children, className = "", title }: { children: ReactNode; className?: string; title: string }) {
  return <section className={`rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-xl shadow-black/10 sm:p-6 ${className}`}><h2 className="text-xl font-semibold text-white">{title}</h2><div className="mt-5 space-y-4">{children}</div></section>;
}
