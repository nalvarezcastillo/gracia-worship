import type { ReactNode } from "react";
import { appListStyles } from "@/components/ui/styles";

export function AppList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${appListStyles} ${className}`}>{children}</div>;
}

export function AppListRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-12 flex-col gap-3 py-3 sm:flex-row sm:items-center ${className}`}>{children}</div>;
}
