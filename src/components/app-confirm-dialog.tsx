import type { ReactNode } from "react";

export function AppConfirmDialog({ actions, children, descriptionId, title, titleId }: { actions: ReactNode; children: ReactNode; descriptionId?: string; title: string; titleId: string }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7"><h2 id={titleId} className="text-2xl font-bold tracking-tight text-white">{title}</h2>{children}<div className="mt-6">{actions}</div></section></div>;
}
