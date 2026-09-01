"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminIcon, HomeIcon, LiveIcon, MusicIcon, ServiceIcon } from "@/components/icons";

const items = [
  { href: "/", label: "Inicio", icon: HomeIcon, active: (path: string) => path === "/" },
  { href: "/songs", label: "Canciones", icon: MusicIcon, active: (path: string) => path.startsWith("/songs") || path.startsWith("/song/") },
  { href: "/service", label: "Servicios", icon: ServiceIcon, active: (path: string) => path.startsWith("/service") },
  { href: "/live", label: "En Vivo", icon: LiveIcon, active: (path: string) => path.startsWith("/live") },
  { href: "/admin", label: "Más", icon: AdminIcon, active: (path: string) => path.startsWith("/admin") },
];

export function BottomNavigation() {
  const pathname = usePathname();

  if (pathname === "/viewer" || pathname === "/service/rehearsal" || /^\/service\/\d+\/rehearsal$/.test(pathname)) {
    return null;
  }

  return (
    <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.055] bg-[#050a0e]/94 pb-[env(safe-area-inset-bottom)] shadow-[0_-14px_36px_rgba(0,0,0,0.3)] backdrop-blur-2xl lg:hidden">
      <div className="mx-auto grid h-18 max-w-lg grid-cols-5 gap-0.5 px-2 py-1.5 sm:px-3">
        {items.map((item) => {
          const isActive = item.active(pathname);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.625rem] font-semibold transition-[background-color,color,transform] duration-200 ease-out active:scale-95 ${isActive ? "bg-white/[0.035] text-emerald-400" : "text-zinc-600 hover:bg-white/[0.025] hover:text-zinc-300"}`}
            >
              {isActive ? <span aria-hidden="true" className="absolute inset-x-5 top-0 h-px rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.45)]" /> : null}
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
