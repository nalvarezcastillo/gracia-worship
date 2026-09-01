"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, FolderOpen, Music2, Radio, Settings, UserRound, UsersRound } from "lucide-react";

const navigationItems = [
  { href: "/service", label: "Servicios", icon: CalendarDays, active: (path: string) => path.startsWith("/service") || path === "/setlist" || path === "/archive" || path.startsWith("/admin/setlist") },
  { href: "/songs", label: "Canciones", icon: Music2, active: (path: string) => path.startsWith("/songs") || path.startsWith("/song/") || path.startsWith("/admin/song") },
  { href: "/admin/service-team", label: "Equipo", icon: UsersRound, active: (path: string) => path.startsWith("/admin/service-team") || path.startsWith("/admin/team") },
  { href: "/live", label: "En Vivo", icon: Radio, active: (path: string) => path.startsWith("/live") },
  { href: "/admin/reports", label: "Reportes", icon: BarChart3, active: (path: string) => path.startsWith("/admin/reports") },
  { href: "/admin/resources", label: "Recursos", icon: FolderOpen, active: (path: string) => path.startsWith("/admin/resources") || path.startsWith("/admin/microphones") },
  { href: "/admin/settings", label: "Ajustes", icon: Settings, active: (path: string) => path.startsWith("/admin/settings") || path === "/admin" },
];

export function DesktopTopNavigation() {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar" aria-label="Navegación de escritorio">
      <Link href="/" className="group flex items-center gap-3 px-3" aria-label="Gracia Worship — Inicio">
        <span className="grid size-10 shrink-0 place-items-center rounded-[0.7rem] bg-emerald-400 text-[1.35rem] font-black tracking-[-0.08em] text-[#04110d] shadow-[0_10px_28px_rgba(34,211,153,0.12)] transition-colors group-hover:bg-emerald-300">G</span>
        <span className="leading-none"><span className="block text-[0.78rem] font-extrabold tracking-[0.17em] text-zinc-100">GRACIA</span><span className="mt-1 block text-[0.55rem] font-bold tracking-[0.24em] text-emerald-400">WORSHIP</span></span>
      </Link>
      <nav aria-label="Navegación principal" className="mt-10 space-y-1">
        {navigationItems.map((item) => {
          const isActive = item.active(pathname);
          const Icon = item.icon;
          return <Link key={item.href} href={item.href} aria-current={isActive ? "page" : undefined} className={`group relative flex min-h-12 items-center gap-3 rounded-[0.65rem] px-3 text-sm font-medium transition-[background-color,color] duration-200 ${isActive ? "bg-emerald-400/[0.09] text-zinc-50" : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200"}`}>{isActive ? <span aria-hidden="true" className="absolute -right-px inset-y-2 w-0.5 rounded-l-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.42)]" /> : null}<Icon aria-hidden="true" strokeWidth={1.65} className={`size-[1.1rem] shrink-0 transition-colors ${isActive ? "text-emerald-400" : "text-zinc-600 group-hover:text-zinc-400"}`} /><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="mt-auto border-t border-white/[0.055] pt-4"><Link href="/profile" aria-current={pathname.startsWith("/profile") ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-[0.65rem] px-3 transition-colors ${pathname.startsWith("/profile") ? "bg-white/[0.045] text-zinc-100" : "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"}`}><span className="grid size-8 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.035]"><UserRound aria-hidden="true" strokeWidth={1.6} className="size-4" /></span><span className="min-w-0"><span className="block text-xs font-semibold">Perfil</span><span className="mt-0.5 block text-[0.625rem] text-zinc-600">Cuenta de Gracia</span></span></Link></div>
    </aside>
  );
}
