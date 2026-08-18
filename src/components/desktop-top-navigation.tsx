"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserRound } from "lucide-react";

const navigationItems = [
  { href: "/service", label: "Servicio", active: (path: string) => path.startsWith("/service") || path === "/setlist" || path === "/archive" },
  { href: "/songs", label: "Canciones", active: (path: string) => path.startsWith("/songs") || path.startsWith("/song/") || path.startsWith("/admin/song") },
  { href: "/admin/service-team", label: "Equipo", active: (path: string) => path.startsWith("/admin/service-team") || path.startsWith("/admin/team") },
  { href: "/admin/resources", label: "Recursos", active: (path: string) => path.startsWith("/admin/resources") || path.startsWith("/admin/microphones") },
  { href: "/live", label: "En Vivo", active: (path: string) => path.startsWith("/live") },
  { href: "/admin/reports", label: "Reportes", active: (path: string) => path.startsWith("/admin/reports") || /^\/service\/\d+\/report$/.test(path) },
  { href: "/admin", label: "Admin", active: (path: string) => path.startsWith("/admin") && !path.startsWith("/admin/song") && !path.startsWith("/admin/team") && !path.startsWith("/admin/service-team") && !path.startsWith("/admin/resources") && !path.startsWith("/admin/microphones") && !path.startsWith("/admin/reports") },
];

export function DesktopTopNavigation() {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/viewer") return null;

  return (
    <nav aria-label="Navegación principal" className="sticky top-0 z-[60] hidden h-16 items-center border-b border-white/[0.08] bg-zinc-950/90 px-6 backdrop-blur-xl lg:flex xl:px-8">
      <Link href="/" className="mr-8 shrink-0 text-sm font-extrabold tracking-[0.14em] text-white xl:mr-10">GRACIA <span className="text-emerald-400">WORSHIP</span></Link>
      <div className="flex h-full min-w-0 items-center gap-0.5 text-sm font-medium">
        {navigationItems.map((item) => {
          const isActive = item.active(pathname);
          return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className={`relative flex h-full items-center px-3 transition-colors xl:px-4 ${isActive ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-emerald-400 xl:after:inset-x-4" : "text-zinc-500 hover:text-zinc-200"}`}>{item.label}</Link>;
        })}
      </div>
      <Link href="/profile" aria-label="Perfil" className={`ml-auto grid size-9 shrink-0 place-items-center rounded-full border transition-colors ${pathname.startsWith("/profile") ? "border-emerald-400/40 bg-emerald-400/[0.09] text-emerald-300" : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white"}`}><UserRound aria-hidden="true" className="size-4" /></Link>
    </nav>
  );
}
