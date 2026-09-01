import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, FileText } from "lucide-react";
import { ServicePlanCreator } from "@/components/service-plan-creator";
import { SongCover } from "@/components/song-cover";
import type { CurrentServiceTeamGroup } from "@/lib/current-service-team";
import { formatDuration } from "@/lib/duration";
import type { OperationalServiceEntry } from "@/lib/service-entries";
import type { ActiveSetlist, DashboardServiceSelection } from "@/lib/setlist";
import type { ServiceDashboardSong } from "@/lib/service-dashboard-data";
import type { ServiceHubData } from "@/lib/services";

const accents = ["#2dd4bf", "#818cf8", "#fbbf24", "#fb7185", "#38bdf8", "#c084fc"];

export function ServiceDashboard({ authenticated, entries, hasItemNotes, hubData, selection, service, team }: {
  authenticated: boolean;
  entries: OperationalServiceEntry<ServiceDashboardSong>[];
  hasItemNotes: boolean;
  hubData: ServiceHubData;
  selection: DashboardServiceSelection;
  service: ActiveSetlist;
  team: CurrentServiceTeamGroup[];
}) {
  const title = service.serviceDate ? formatEditorialDate(service.serviceDate) : localizeServiceName(service.serviceName);
  const status = selection.state === "planned" ? "Planificado" : "Próximo";

  return (
    <div className="hidden lg:block">
      <header className="flex items-start justify-between gap-8 pb-7">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-emerald-400">Servicio</p>
          <h1 className="mt-2 text-[clamp(2.35rem,4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.052em] text-[var(--text-primary)]">{title}</h1>
          <p className="mt-3 text-sm font-medium text-zinc-500">{localizeServiceName(service.serviceName)}</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            {service.serviceDate ? <MetadataPill icon={CalendarDays}>{formatCompactDate(service.serviceDate)}</MetadataPill> : null}
            {service.serviceTime ? <MetadataPill icon={Clock3}>{formatServiceTime(service.serviceTime)}</MetadataPill> : null}
            <span className="inline-flex min-h-9 items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-emerald-300">✓ {status}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-3">
          {authenticated ? <ServicePlanCreator services={hubData.services} /> : null}
          <Link href={`/service/${service.id}`} className="inline-flex min-h-11 items-center rounded-[0.7rem] border border-white/[0.07] bg-white/[0.025] px-4 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.055] hover:text-white">Abrir servicio</Link>
        </div>
      </header>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section aria-labelledby="service-order-title" className="min-w-0">
          <div className="flex items-center justify-between border-b border-white/[0.065] pb-4">
            <div><p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Orden del servicio</p><h2 id="service-order-title" className="mt-1 text-lg font-semibold tracking-[-0.02em] text-zinc-100">{entries.length} {entries.length === 1 ? "elemento" : "elementos"}</h2></div>
            <Link href={`/service/${service.id}`} className="text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300">Ver orden completo →</Link>
          </div>
          <ServiceOrderPreview entries={entries} serviceId={service.id} />
        </section>

        <aside className="space-y-4">
          {authenticated && service.leaderNotes?.trim() ? <ServiceContextPanel eyebrow="Notas del servicio" actionHref={`/service/${service.id}/notes`} actionLabel="Ver notas"><p className="line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{service.leaderNotes}</p></ServiceContextPanel> : hasItemNotes || Boolean(service.leaderNotes?.trim()) ? <ServiceContextPanel eyebrow="Notas del servicio" actionHref={`/service/${service.id}/notes`} actionLabel="Ver notas"><div className="flex items-center gap-3 text-sm text-zinc-400"><FileText className="size-4 text-emerald-400/70" />Este servicio contiene notas de preparación.</div></ServiceContextPanel> : null}
          <ServiceContextPanel eyebrow="Equipo asignado" actionHref={`/admin/service-team?service=${service.id}`} actionLabel="Ver todos"><ServiceTeamPanel groups={team} /></ServiceContextPanel>
        </aside>
      </div>
    </div>
  );
}

export function ServiceOrderPreview({ entries, limit, serviceId }: { entries: OperationalServiceEntry<ServiceDashboardSong>[]; limit?: number; serviceId: number }) {
  if (!entries.length) return <p className="border-b border-white/[0.06] py-12 text-center text-sm text-zinc-500">No hay elementos en este servicio.</p>;
  return <ol className="mt-3 space-y-1.5">{entries.slice(0, limit).map((entry, index) => <ServiceOrderRow key={entry.id} accent={accents[index % accents.length]} entry={entry} index={index} serviceId={serviceId} />)}</ol>;
}

function ServiceOrderRow({ accent, entry, index, serviceId }: { accent: string; entry: OperationalServiceEntry<ServiceDashboardSong>; index: number; serviceId: number }) {
  const isSong = entry.kind === "song";
  const href = isSong ? `/song/${entry.song.id}?service=${serviceId}&serviceItem=${entry.item.id}` : `/service/${serviceId}`;
  return (
    <li className="group relative overflow-hidden rounded-[0.8rem] border border-white/[0.045] bg-[linear-gradient(90deg,rgba(255,255,255,0.027),rgba(255,255,255,0.012))] transition-[border-color,background-color,transform] duration-200 hover:-translate-y-px hover:border-white/[0.09] hover:bg-white/[0.035]">
      <span aria-hidden="true" className="absolute inset-y-4 left-1 w-0.5 rounded-full" style={{ backgroundColor: accent, boxShadow: `0 0 16px ${accent}55` }} />
      <Link href={href} className="grid min-h-[5.15rem] grid-cols-[4.25rem_3.6rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 focus-visible:outline-2 focus-visible:outline-emerald-400 xl:grid-cols-[4.25rem_3.6rem_minmax(0,1fr)_minmax(10rem,auto)_2.5rem]">
        <span className="text-center"><span className="block text-[1.45rem] font-medium leading-6 tabular-nums tracking-[-0.04em] text-zinc-300">{String(index + 1).padStart(2, "0")}</span><span className="mt-1 block text-[0.55rem] font-bold uppercase tracking-[0.13em] text-zinc-600">{isSong ? "Canción" : entry.item.type === "worship" ? "Adoración" : "Momento"}</span></span>
        {isSong ? <SongCover src={entry.song.cover_url} alt="" width={64} height={64} className="size-[3.6rem] rounded-[0.55rem] object-cover opacity-90 shadow-lg shadow-black/25" /> : <span className="grid size-[3.6rem] place-items-center rounded-[0.55rem] bg-white/[0.035] text-lg font-semibold" style={{ color: accent }}>{entry.title.slice(0, 1).toUpperCase()}</span>}
        <span className="min-w-0"><span className="block truncate text-base font-semibold tracking-[-0.015em] text-zinc-100 xl:text-[1.05rem]">{entry.title}</span><span className="mt-1 block truncate text-sm text-zinc-500">{isSong ? entry.song.artist || entry.assignmentText || "Canción" : entry.item.details || "Elemento del servicio"}</span></span>
        <span className="hidden items-center justify-end gap-3 xl:flex">{isSong && entry.effectiveKey ? <span className="grid min-w-8 place-items-center rounded-[0.45rem] border px-2 py-1 text-sm font-bold" style={{ borderColor: `${accent}2e`, backgroundColor: `${accent}16`, color: accent }}>{entry.effectiveKey}</span> : null}{isSong && entry.song.bpm ? <span className="text-xs tabular-nums text-zinc-500">{entry.song.bpm} BPM</span> : null}{isSong && entry.song.time_signature ? <span className="text-xs tabular-nums text-zinc-500">{entry.song.time_signature}</span> : null}{entry.plannedDurationSeconds ? <span className="text-xs tabular-nums text-zinc-400">{formatDuration(entry.plannedDurationSeconds)}</span> : null}</span>
        <span className="grid size-9 place-items-center rounded-[0.55rem] border border-white/[0.04] bg-black/10 text-zinc-600 transition-colors group-hover:text-emerald-300"><ChevronRight aria-hidden="true" className="size-4" /></span>
      </Link>
    </li>
  );
}

export function ServiceContextPanel({ actionHref, actionLabel, children, eyebrow }: { actionHref: string; actionLabel: string; children: React.ReactNode; eyebrow: string }) {
  return <section className="rounded-[0.85rem] border border-white/[0.055] bg-[var(--surface-elevated)]/70 p-4 shadow-[0_18px_50px_rgba(0,0,0,0.12)]"><header className="mb-4 flex items-center justify-between gap-3"><h2 className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-zinc-500">{eyebrow}</h2><Link href={actionHref} className="text-[0.6875rem] font-semibold text-emerald-400/80 hover:text-emerald-300">{actionLabel}</Link></header>{children}</section>;
}

export function ServiceTeamPanel({ groups }: { groups: CurrentServiceTeamGroup[] }) {
  if (!groups.length) return <p className="py-3 text-sm text-zinc-500">No hay personas asignadas.</p>;
  return <div className="space-y-3">{groups.slice(0, 7).map((person) => <div key={person.personName.toLocaleLowerCase("es")} className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.045] text-[0.65rem] font-bold text-zinc-400">{initials(person.personName)}</span><span className="min-w-0"><span className="block truncate text-sm font-medium text-zinc-200">{person.personName}</span><span className="mt-0.5 block truncate text-[0.6875rem] text-zinc-600">{[...person.roles, ...person.resources].join(" · ") || "Sin función asignada"}</span></span></div>)}</div>;
}

function MetadataPill({ children, icon: Icon }: { children: React.ReactNode; icon: typeof CalendarDays }) { return <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.018] px-3 text-[0.72rem] font-medium uppercase tracking-[0.03em] text-zinc-400"><Icon aria-hidden="true" className="size-3.5 text-zinc-500" />{children}</span>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join(""); }
function formatEditorialDate(value: string) { const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatCompactDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("es-419", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)).replaceAll(".", ""); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
function localizeServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
