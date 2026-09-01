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
    <section className={`mt-6 overflow-hidden rounded-xl border border-white/[0.07] ${accent ? "border-t-emerald-400/40" : ""} bg-white/[0.025] transition-colors duration-200 hover:border-white/[0.11] sm:mt-8 ${compactDesktop ? "lg:mt-5" : ""} ${className}`}>
      <div className={`border-b border-white/[0.06] px-5 py-4 sm:px-6 sm:py-5 ${compactDesktop ? "lg:px-5 lg:py-3" : ""}`}>
        {eyebrow ? <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">{eyebrow}</p> : null}
        <h2 className={`${eyebrow ? "mt-2" : ""} text-2xl font-bold tracking-tight text-white ${compactDesktop ? "lg:mt-1 lg:text-lg" : ""}`}>{title}</h2>
        {subtitle ? <div className="mt-1.5 text-sm font-medium text-zinc-400">{subtitle}</div> : null}
      </div>
      {children}
    </section>
  );
}
