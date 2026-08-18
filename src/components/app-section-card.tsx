import type { ReactNode } from "react";

type AppSectionCardProps = {
  accent?: boolean;
  children: ReactNode;
  className?: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  title: string;
  compactDesktop?: boolean;
};

export function AppSectionCard({ accent = true, children, className = "", eyebrow, subtitle, title, compactDesktop = false }: AppSectionCardProps) {
  return (
    <section className={`mt-6 overflow-hidden rounded-3xl border border-white/[0.07] ${accent ? "border-t-[4px] border-t-emerald-500 hover:border-t-emerald-400" : ""} bg-zinc-900/60 shadow-xl shadow-black/10 transition-[border-color,box-shadow] duration-200 hover:border-white/[0.11] hover:shadow-2xl hover:shadow-black/15 sm:mt-8 ${compactDesktop ? "lg:mt-5 lg:rounded-2xl" : ""} ${className}`}>
      <div className={`border-b border-white/[0.06] bg-gradient-to-br from-emerald-400/[0.07] to-transparent px-5 py-4 sm:px-6 sm:py-5 ${compactDesktop ? "lg:px-5 lg:py-3" : ""}`}>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">{eyebrow}</p> : null}
        <h2 className={`${eyebrow ? "mt-2" : ""} text-2xl font-bold tracking-tight text-white ${compactDesktop ? "lg:mt-1 lg:text-lg" : ""}`}>{title}</h2>
        {subtitle ? <div className="mt-1.5 text-sm font-medium text-zinc-400">{subtitle}</div> : null}
      </div>
      {children}
    </section>
  );
}
