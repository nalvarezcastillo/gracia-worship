import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ChevronRight, CircleUserRound, Clock3, FileText, Users } from "lucide-react";
import { ServiceContextPanel, ServiceOrderPreview, ServiceTeamPanel } from "@/components/service-dashboard";
import { SongCover } from "@/components/song-cover";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { formatDuration } from "@/lib/duration";
import { buildOperationalServiceEntries, type OperationalServiceEntry } from "@/lib/service-entries";
import { getServiceDashboardData, type ServiceDashboardSong } from "@/lib/service-dashboard-data";
import { getDashboardServiceSelection, type ActiveSetlist, type DashboardServiceSelection } from "@/lib/setlist";
import { getAppSettings } from "@/lib/app-settings";
import { getServiceTeam, groupCurrentServiceTeam, type CurrentServiceTeamGroup } from "@/lib/current-service-team";
import { hasAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const [serviceSelection, appSettings, authenticated] = await Promise.all([getDashboardServiceSelection(), getAppSettings(), hasAuthenticatedUser()]);
  const setlist = serviceSelection.state === "active" || serviceSelection.state === "planned" ? serviceSelection.service : null;
  const serviceTeam = setlist ? await getServiceTeam(setlist.id) : [];
  const operationalData = setlist ? await getServiceDashboardData(setlist.id) : { hasItemNotes: false, items: [], settings: [], songs: [] };
  const operationalEntries = buildOperationalServiceEntries(operationalData.items, operationalData.songs, operationalData.settings);
  const serviceTeamGroups = groupCurrentServiceTeam(serviceTeam);

  return (
    <main className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3 sm:py-12 lg:py-7">
      <MainContainer className="max-w-4xl lg:max-w-7xl">
        <div className="lg:hidden">
          <header className="flex items-center justify-between gap-4 border-b border-white/[0.055] pb-2.5">
            <div className="flex min-w-0 items-center gap-2.5"><Image src={appSettings.logo_url ?? "/branding/gracia-worship-logo.png"} alt="" width={1254} height={1254} priority className="size-8 shrink-0 object-contain" /><p className="truncate text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-zinc-300">{appSettings.ministry_name}</p></div>
            <Link href={authenticated ? "/profile" : "/login"} aria-label={authenticated ? "Cuenta" : "Iniciar sesión"} className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 focus-visible:outline-2 focus-visible:outline-emerald-400"><CircleUserRound aria-hidden="true" className="size-[1.125rem]" /></Link>
          </header>
          <p className="mt-3 text-xl font-semibold leading-7 tracking-[-0.035em] text-zinc-100">{formatGreeting(new Date())}</p>
          <MobileHomeContent authenticated={authenticated} entries={operationalEntries} hasItemNotes={operationalData.hasItemNotes} serviceSelection={serviceSelection} serviceTeamGroups={serviceTeamGroups} setlist={setlist} />
        </div>

        <div className="hidden lg:block">
          {setlist ? <DesktopHome authenticated={authenticated} entries={operationalEntries} hasItemNotes={operationalData.hasItemNotes} serviceSelection={serviceSelection} setlist={setlist} team={serviceTeamGroups} /> : serviceSelection.state === "error" ? <DashboardServiceError /> : <DashboardServiceEmpty />}
        </div>

        {(await searchParams).restored === "1" ? <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Servicio restaurado correctamente.</div> : null}
      </MainContainer>
    </main>
  );
}

function DesktopHome({ authenticated, entries, hasItemNotes, serviceSelection, setlist, team }: { authenticated: boolean; entries: OperationalServiceEntry<ServiceDashboardSong>[]; hasItemNotes: boolean; serviceSelection: DashboardServiceSelection; setlist: ActiveSetlist; team: CurrentServiceTeamGroup[] }) {
  const songs = entries.filter((entry) => entry.kind === "song");
  const plannedSeconds = entries.reduce((total, entry) => total + (entry.plannedDurationSeconds ?? 0), 0);
  const status = serviceSelection.state === "planned" ? "Planificado" : "Próximo";

  return (
    <div>
      <header className="flex items-start justify-between gap-8 pb-8">
        <div className="min-w-0">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.22em] text-emerald-400">Próximo servicio</p>
          <h1 className="mt-2 text-[clamp(2.5rem,4.5vw,4.75rem)] font-semibold leading-[1.01] tracking-[-0.055em] text-[var(--text-primary)]">{setlist.serviceDate ? formatServiceDate(setlist.serviceDate) : localizeDefaultServiceName(setlist.serviceName)}</h1>
          <p className="mt-3 text-sm font-medium text-zinc-500">{localizeDefaultServiceName(setlist.serviceName)}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {setlist.serviceDate ? <HomeMetadata icon={CalendarDays}>{formatCompactDate(setlist.serviceDate)}</HomeMetadata> : null}
            {setlist.serviceTime ? <HomeMetadata icon={Clock3}>{formatServiceTime(setlist.serviceTime)}</HomeMetadata> : null}
            <span className="inline-flex min-h-9 items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-3 text-[0.6875rem] font-bold uppercase tracking-[0.09em] text-emerald-300">✓ {status}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-3">
          <Link href={`/service/${setlist.id}`} className="inline-flex min-h-11 items-center rounded-[0.7rem] bg-emerald-400 px-4 text-sm font-semibold text-[#04110d] transition-colors hover:bg-emerald-300">Abrir servicio</Link>
          {serviceSelection.state === "active" ? <Link href="/live" className="inline-flex min-h-11 items-center rounded-[0.7rem] border border-white/[0.07] bg-white/[0.025] px-4 text-sm font-semibold text-zinc-300 hover:bg-white/[0.055] hover:text-white">En Vivo</Link> : <Link href={`/service/${setlist.id}/preflight`} className="inline-flex min-h-11 items-center rounded-[0.7rem] border border-white/[0.07] bg-white/[0.025] px-4 text-sm font-semibold text-zinc-300 hover:bg-white/[0.055] hover:text-white">Preparación</Link>}
        </div>
      </header>

      <section aria-label="Resumen del próximo servicio" className="grid grid-cols-4 border-y border-white/[0.055] py-4">
        <HomeMetric label="Elementos" value={String(entries.length)} />
        <HomeMetric label="Canciones" value={String(songs.length)} />
        <HomeMetric label="Equipo" value={String(team.length)} />
        <HomeMetric label="Duración estimada" value={plannedSeconds ? formatDuration(plannedSeconds) : "—"} />
      </section>

      <div className="mt-8 grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] 2xl:grid-cols-[minmax(0,1fr)_21rem]">
        <section className="min-w-0" aria-labelledby="home-order-title">
          <div className="flex items-end justify-between border-b border-white/[0.06] pb-4"><div><p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Vista rápida</p><div className="mt-1 flex items-baseline gap-3"><h2 id="home-order-title" className="text-xl font-semibold tracking-[-0.025em] text-zinc-100">Canciones del servicio</h2><span className="text-xs text-zinc-600">{songs.length} {songs.length === 1 ? "canción" : "canciones"}</span></div></div><Link href={`/service/${setlist.id}`} className="text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300">Ver servicio completo →</Link></div>
          {songs.length ? <ServiceOrderPreview entries={songs} serviceId={setlist.id} /> : <p className="border-b border-white/[0.06] py-12 text-center text-sm text-zinc-500">No hay canciones agregadas todavía.</p>}
        </section>

        <aside className="space-y-4">
          <ServiceContextPanel eyebrow="Equipo asignado" actionHref={`/admin/service-team?service=${setlist.id}`} actionLabel="Ver equipo"><ServiceTeamPanel groups={team.slice(0, 5)} /></ServiceContextPanel>
          {authenticated && setlist.leaderNotes?.trim() ? <ServiceContextPanel eyebrow="Notas del servicio" actionHref={`/service/${setlist.id}/notes`} actionLabel="Ver notas"><p className="line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{setlist.leaderNotes}</p></ServiceContextPanel> : hasItemNotes || Boolean(setlist.leaderNotes?.trim()) ? <ServiceContextPanel eyebrow="Notas del servicio" actionHref={`/service/${setlist.id}/notes`} actionLabel="Ver notas"><div className="flex items-center gap-3 text-sm text-zinc-400"><FileText className="size-4 text-emerald-400/70" />Hay notas de preparación disponibles.</div></ServiceContextPanel> : null}
          <section className="px-1 pt-2"><p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-zinc-600">Acciones rápidas</p><nav className="mt-2 divide-y divide-white/[0.05] border-y border-white/[0.05]"><QuickLink href="/service">Crear o planificar servicio</QuickLink><QuickLink href="/songs">Abrir canciones</QuickLink>{serviceSelection.state === "active" ? <QuickLink href="/live">Abrir En Vivo</QuickLink> : null}</nav></section>
        </aside>
      </div>
    </div>
  );
}

function HomeMetadata({ children, icon: Icon }: { children: React.ReactNode; icon: typeof CalendarDays }) { return <span className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.018] px-3 text-[0.72rem] font-medium uppercase tracking-[0.03em] text-zinc-400"><Icon aria-hidden="true" className="size-3.5 text-zinc-500" />{children}</span>; }
function HomeMetric({ label, value }: { label: string; value: string }) { return <div className="border-r border-white/[0.055] px-5 first:pl-0 last:border-r-0"><p className="text-[0.6rem] font-bold uppercase tracking-[0.16em] text-zinc-600">{label}</p><p className="mt-1 text-xl font-medium tracking-[-0.025em] tabular-nums text-zinc-200">{value}</p></div>; }
function QuickLink({ children, href }: { children: React.ReactNode; href: string }) { return <Link href={href} className="flex min-h-11 items-center justify-between text-sm font-medium text-zinc-400 transition-colors hover:text-emerald-300"><span>{children}</span><ChevronRight aria-hidden="true" className="size-3.5 text-zinc-700" /></Link>; }

function MobileHomeContent({ authenticated, entries, hasItemNotes, serviceSelection, serviceTeamGroups, setlist }: { authenticated: boolean; entries: OperationalServiceEntry<ServiceDashboardSong>[]; hasItemNotes: boolean; serviceSelection: DashboardServiceSelection; serviceTeamGroups: CurrentServiceTeamGroup[]; setlist: ActiveSetlist | null }) {
  if (!setlist) {
    return serviceSelection.state === "error" ? <DashboardServiceError mobile /> : <DashboardServiceEmpty mobile />;
  }

  const songEntries = entries.filter((entry): entry is Extract<OperationalServiceEntry<ServiceDashboardSong>, { kind: "song" }> => entry.kind === "song");
  const previewSongs = songEntries.slice(0, 5);
  const remainingSongs = Math.max(songEntries.length - previewSongs.length, 0);
  const date = setlist.serviceDate ? formatHeroDate(setlist.serviceDate) : null;

  return (
    <div className="mt-3.5 space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--surface-elevated)]/80 px-4 pb-5 pt-3.5 shadow-[0_18px_45px_rgba(0,0,0,0.16)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-40 rounded-full bg-emerald-400/[0.045] blur-3xl" />
        {serviceSelection.state === "planned" ? <div className="relative flex flex-wrap items-center gap-2"><p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-emerald-400/90">Próximo servicio</p><span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-zinc-500">Planificado</span></div> : <p className="relative text-[0.625rem] font-bold uppercase tracking-[0.2em] text-emerald-400/90">Próximo servicio</p>}
        <div className="relative mt-2 flex items-start justify-between gap-4">
          {date ? <p className="shrink-0 text-[0.6875rem] font-bold uppercase tracking-[0.13em] text-zinc-500"><span className="block">{date.weekday}</span><span className="mt-0.5 block text-[1.625rem] font-semibold leading-7 tabular-nums tracking-[-0.04em] text-zinc-100">{date.day}</span><span className="block text-zinc-600">{date.month}</span></p> : <p className="text-xs font-semibold text-zinc-500">Fecha pendiente</p>}
          <p className="pt-0.5 text-right text-[0.8125rem] font-semibold tabular-nums text-zinc-400">{formatServiceTime(setlist.serviceTime)}</p>
        </div>
        <h1 className="relative mt-2 line-clamp-2 break-words text-[1.375rem] font-semibold leading-7 tracking-[-0.035em] text-zinc-50">{localizeDefaultServiceName(setlist.serviceName)}</h1>
        <p className="relative mt-1 text-xs leading-5 text-zinc-500">{entries.length} {entries.length === 1 ? "elemento" : "elementos"} · {songEntries.length} {songEntries.length === 1 ? "canción" : "canciones"}</p>
        <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
          <Link href={serviceSelection.state === "planned" ? `/service/${setlist.id}` : "/live"} className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl bg-emerald-400 px-3 text-[0.8125rem] font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">{serviceSelection.state === "planned" ? "Continuar preparación" : "Abrir En Vivo"}</Link>
          <Link href={serviceSelection.state === "planned" ? `/service/${setlist.id}/preflight` : `/service/${setlist.id}`} className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-white/[0.09] bg-white/[0.018] px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.045] hover:text-zinc-200">{serviceSelection.state === "planned" ? "Revisar" : "Ver orden"}</Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4"><h2 className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-emerald-400/90">Repertorio</h2><Link href={`/service/${setlist.id}`} className="shrink-0 text-[0.6875rem] font-semibold text-zinc-500 transition-colors hover:text-emerald-300">Ver repertorio ›</Link></div>
        {previewSongs.length ? <ol className="mt-2 divide-y divide-white/[0.055] border-y border-white/[0.06]">{previewSongs.map((entry) => <li key={entry.id}><Link href={`/song/${entry.song.id}?service=${setlist.id}&serviceItem=${entry.item.id}`} className="flex min-h-[4.25rem] items-center gap-3 px-0.5 py-2.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400"><SongCover src={entry.song.cover_url} alt="" width={48} height={48} className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-white/[0.07]" /><span className="min-w-0 flex-1"><span className="block truncate text-[0.9375rem] font-semibold leading-5 text-zinc-100">{entry.title}</span><span className="mt-0.5 block truncate text-[0.6875rem] leading-4 text-zinc-500">{[entry.song.artist, entry.song.bpm ? `${entry.song.bpm} BPM` : null, entry.song.time_signature].filter(Boolean).join(" · ") || "Información musical pendiente"}</span></span>{entry.effectiveKey ? <span className="grid min-w-8 shrink-0 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.055] px-1.5 py-1 text-xs font-bold text-emerald-300">{entry.effectiveKey}</span> : null}</Link></li>)}</ol> : <p className="mt-2 border-y border-white/[0.06] py-5 text-center text-sm text-zinc-500">No hay canciones en este servicio.</p>}
        {remainingSongs > 0 ? <p className="mt-1.5 text-right text-xs text-zinc-600">+{remainingSongs} {remainingSongs === 1 ? "canción" : "canciones"}</p> : null}
      </section>

      {serviceTeamGroups.length ? <section className="border-y border-white/[0.06] py-3.5"><div className="flex min-h-10 items-center gap-3"><Users aria-hidden="true" className="size-4 shrink-0 text-emerald-400/65" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-zinc-200">Equipo del servicio</h2><p className="mt-0.5 text-xs text-zinc-500">{serviceTeamGroups.length} {serviceTeamGroups.length === 1 ? "persona sirviendo" : "personas sirviendo"}</p></div>{authenticated ? <Link href={`/admin/service-team?service=${setlist.id}`} aria-label="Ver equipo" className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-600 hover:bg-white/[0.04] hover:text-emerald-300"><ChevronRight aria-hidden="true" className="size-4" /></Link> : null}</div><div className="mt-2.5 space-y-2 pl-7">{serviceTeamGroups.slice(0, 3).map((person) => <p key={person.personName.toLocaleLowerCase("es")} className="min-w-0 text-xs leading-4"><span className="block truncate font-medium text-zinc-300">{person.personName}</span><span className="mt-0.5 block truncate text-zinc-600">{[...person.roles, ...person.resources].join(" · ") || "Sin función asignada"}</span></p>)}</div></section> : null}

      {hasItemNotes || Boolean(setlist.leaderNotes?.trim()) ? <Link href={`/service/${setlist.id}/notes`} className="flex min-h-12 items-center border-y border-white/[0.06] px-1 py-2.5 focus-visible:outline-2 focus-visible:outline-emerald-400"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-200">Notas del servicio</p><p className="mt-0.5 truncate text-xs text-zinc-500">Guía y notas de preparación</p></div><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-zinc-600" /></Link> : null}

      {authenticated && setlist.leaderNotes?.trim() ? <section><h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Preparación</h2><p className="mt-1.5 whitespace-pre-wrap border-y border-white/[0.07] py-3 text-sm leading-6 text-zinc-400">{setlist.leaderNotes}</p></section> : null}
    </div>
  );
}

function DashboardServiceError({ mobile = false }: { mobile?: boolean }) { return <section className={`${mobile ? "mt-4 rounded-2xl border border-rose-300/15 bg-rose-300/[0.035] px-4 py-5" : "mt-6 border-y border-rose-300/15 py-12 text-center"}`}><p className="text-sm font-semibold text-rose-200">No se pudo cargar el servicio.</p><p className="mt-1 text-sm text-zinc-500">Verifica tu conexión e inténtalo nuevamente.</p><SecondaryButton href="/" className="mt-4 min-h-10 rounded-xl px-4 text-sm">Reintentar</SecondaryButton></section>; }
function DashboardServiceEmpty({ mobile = false }: { mobile?: boolean }) { return <section className={`${mobile ? "mt-4 border-y border-white/[0.07] py-8" : "mt-6 border-y border-white/[0.07] py-14 text-center"}`}><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Próximo servicio</p><h1 className={`${mobile ? "mt-2 text-xl" : "mt-3 text-2xl"} font-bold tracking-[-0.025em] text-white`}>No hay servicios próximos.</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Planifica el próximo servicio para comenzar.</p><PrimaryButton href="/service" className="mt-5 min-h-11 rounded-xl px-5 text-sm shadow-none hover:translate-y-0">Planificar servicio</PrimaryButton></section>; }

function formatGreeting(value: Date) { const hour = value.getHours(); return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"; }
function formatHeroDate(value: string) { const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day); return { weekday: new Intl.DateTimeFormat("es-419", { weekday: "short" }).format(date).replaceAll(".", ""), day: String(day).padStart(2, "0"), month: new Intl.DateTimeFormat("es-419", { month: "short" }).format(date).replaceAll(".", "") }; }
function formatCompactDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("es-419", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)).replaceAll(".", ""); }
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", month: "long", day: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
