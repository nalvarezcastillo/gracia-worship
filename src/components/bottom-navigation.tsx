"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, MusicIcon, UserIcon } from "@/components/icons";

const items = [
  { href: "/", label: "Home", icon: HomeIcon, active: (path: string) => path === "/" },
  { href: "/songs", label: "Songs", icon: MusicIcon, active: (path: string) => path.startsWith("/songs") || path.startsWith("/song/") },
  { href: "/profile", label: "Profile", icon: UserIcon, active: (path: string) => path.startsWith("/profile") },
];

export function BottomNavigation() {
  const pathname = usePathname();

  if (pathname === "/viewer") {
    return null;
  }

  return (
    <nav aria-label="Main navigation" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/8 bg-zinc-950/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl">
      <div className="mx-auto grid h-18 max-w-lg grid-cols-3 px-3">
        {items.map((item) => {
          const isActive = item.active(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl text-xs font-semibold transition duration-200 active:scale-95 ${isActive ? "text-emerald-400" : "text-zinc-500 hover:text-zinc-200"}`}
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
