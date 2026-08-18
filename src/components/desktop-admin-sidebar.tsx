"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/admin/service-team", label: "Equipo del servicio", matches: ["/admin/service-team"] },
  { href: "/admin/team", label: "Directorio de equipo", matches: ["/admin/team"] },
  { href: "/admin/resources", label: "Recursos", matches: ["/admin/resources", "/admin/microphones"] },
  { href: "/admin/reports", label: "Reportes", matches: ["/admin/reports", "/service/"] },
  { href: "/admin/settings", label: "Configuración", matches: ["/admin/settings"] },
];

export function DesktopAdminSidebar() {
  const pathname = usePathname();
  return <aside className="hidden border-r border-white/[0.07] bg-zinc-950/35 px-5 py-7 lg:block"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Administración</p><nav aria-label="Administración" className="mt-5 space-y-1 text-sm font-medium">{links.map((link) => { const active = link.matches.some((match) => match === "/service/" ? /^\/service\/\d+\/report$/.test(pathname) : pathname.startsWith(match)); return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`block rounded-lg px-3 py-2.5 transition-colors ${active ? "bg-emerald-400/[0.09] text-emerald-300" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"}`}>{link.label}</Link>; })}</nav><Link href="/admin" className="mt-7 block border-t border-white/[0.07] pt-5 text-xs font-medium text-zinc-500 hover:text-white">← Panel principal</Link></aside>;
}
