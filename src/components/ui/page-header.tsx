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
    <header className={`flex gap-5 ${centered ? "flex-col items-center text-center" : "items-end justify-between"}`}>
      <div>
        {eyebrow ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">{eyebrow}</p> : null}
        <h1 className="text-pretty text-4xl font-bold tracking-[-0.035em] text-white sm:text-5xl">{title}</h1>
        {description ? <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-400">{description}</p> : null}
      </div>
      {aside ? <div className="shrink-0">{aside}</div> : null}
    </header>
  );
}
