import type { ReactNode } from "react";

export function AppFormSection({ children, className = "", title }: { children: ReactNode; className?: string; title: string }) {
  return <section className={`rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 sm:p-6 ${className}`}><h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-400 sm:text-xs">{title}</h2><div className="mt-4 space-y-4 sm:mt-5">{children}</div></section>;
}
