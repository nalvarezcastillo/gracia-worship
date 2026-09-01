"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNavigation } from "@/components/bottom-navigation";
import { DesktopTopNavigation } from "@/components/desktop-top-navigation";

export function ApplicationShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const showAppShell = pathname !== "/login" && pathname !== "/viewer";

  return (
    <>
      {showAppShell ? <DesktopTopNavigation /> : null}
      <div className={showAppShell ? "app-workspace" : "min-h-screen"}>{children}</div>
      {showAppShell ? <BottomNavigation /> : null}
    </>
  );
}
