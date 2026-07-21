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
    <header className={`flex gap-4 sm:gap-6 ${centered ? "flex-col items-center text-center" : "flex-col items-start sm:flex-row sm:items-end sm:justify-between"}`}>
      <div>
        {eyebrow ? <p className="mb-2.5 text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">{eyebrow}</p> : null}
        <h1 className="text-pretty text-3xl font-bold tracking-[-0.035em] text-white sm:text-5xl">{title}</h1>
        {description ? <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400 sm:mt-4 sm:text-lg sm:leading-8">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
