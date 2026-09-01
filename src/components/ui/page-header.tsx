import type { ReactNode } from "react";

export function PageHeader({
  title,
  eyebrow,
  description,
  aside,
  centered = false,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  aside?: ReactNode;
  centered?: boolean;
}) {
  return (
    <header className={`flex gap-3 sm:gap-6 ${centered ? "flex-col items-center text-center" : "flex-col items-start sm:flex-row sm:items-end sm:justify-between"}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-emerald-400 sm:mb-2.5 sm:text-xs sm:tracking-[0.22em]">{eyebrow}</p> : null}
        <h1 className="text-pretty text-[1.75rem] font-bold leading-tight tracking-[-0.035em] text-white sm:text-[2rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400 sm:mt-3 sm:text-base sm:leading-7">{description}</p> : null}
      </div>
      {aside ? <div className="w-full shrink-0 sm:w-auto">{aside}</div> : null}
    </header>
  );
}
