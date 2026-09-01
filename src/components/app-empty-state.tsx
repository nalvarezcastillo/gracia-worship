import type { ReactNode } from "react";

export function AppEmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`py-7 text-center text-sm leading-6 text-zinc-500 sm:py-8 ${className}`}>{children}</div>;
}
