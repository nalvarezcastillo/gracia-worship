"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminIcon, HomeIcon, MusicIcon } from "@/components/icons";

const items = [
  { href: "/", label: "Home", icon: HomeIcon, active: (path: string) => path === "/" },
  { href: "/songs", label: "Songs", icon: MusicIcon, active: (path: string) => path.startsWith("/songs") || path.startsWith("/song/") },
  { href: "/admin", label: "Admin", icon: AdminIcon, active: (path: string) => path.startsWith("/admin") },
];

export function BottomNavigation() {
  const pathname = usePathname();

  if (pathname === "/viewer") {
    return null;
  }

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-zinc-950/85 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_32px_rgba(0,0,0,0.28)] backdrop-blur-2xl">
      <div className="mx-auto grid h-18 max-w-lg grid-cols-3 gap-1 px-3 py-1.5">
        {items.map((item) => {
          const isActive = item.active(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition-all duration-200 ease-out active:scale-95 ${isActive ? "bg-emerald-400/[0.08] text-emerald-400" : "text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200"}`}
            >
              <Icon className="size-6" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
