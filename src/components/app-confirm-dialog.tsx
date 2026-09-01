import type { ReactNode } from "react";

export function AppConfirmDialog({ actions, children, descriptionId, title, titleId }: { actions: ReactNode; children: ReactNode; descriptionId?: string; title: string; titleId: string }) {
  return <div className="fixed inset-0 z-[70] flex items-end justify-center overflow-y-auto bg-black/70 px-3 pt-10 backdrop-blur-sm sm:items-center sm:p-4" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/60 sm:rounded-3xl sm:p-7"><h2 id={titleId} className="text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>{children}<div className="mt-5 sm:mt-6">{actions}</div></section></div>;
}
