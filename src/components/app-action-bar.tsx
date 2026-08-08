import type { ReactNode } from "react";

export function AppActionBar({ children, className = "", separated = false }: { children: ReactNode; className?: string; separated?: boolean }) {
  return <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${separated ? "border-t border-white/[0.07] pt-4" : ""} ${className}`}>{children}</div>;
}
