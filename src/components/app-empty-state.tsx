import type { ReactNode } from "react";

export function AppEmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`py-8 text-center text-sm text-zinc-500 ${className}`}>{children}</div>;
}
