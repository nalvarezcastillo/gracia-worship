import Image from "next/image";
import Link from "next/link";
import { ChevronRight, CircleUserRound, Music2, Users } from "lucide-react";
import { MusicIcon } from "@/components/icons";
import { ServiceCountdownCard } from "@/components/service-countdown-card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { formatDuration } from "@/lib/duration";
import type { ServiceItem, ServiceSongSetting } from "@/lib/service";
import { buildOperationalServiceEntries, type OperationalServiceEntry } from "@/lib/service-entries";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServiceSchedule, getOperationalEntryScheduleKey } from "@/lib/service-schedule";
import { getDashboardServiceSelection, type ActiveSetlist, type DashboardServiceSelection } from "@/lib/setlist";
import { getAppSettings } from "@/lib/app-settings";
import { getServiceTeam, groupCurrentServiceTeam, type CurrentServiceTeamGroup } from "@/lib/current-service-team";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAuthenticatedUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type DashboardSong = { duration: string; id: string; key?: string | null; title: string };

export default async function Home({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const [serviceSelection, appSettings, authenticated] = await Promise.all([getDashboardServiceSelection(), getAppSettings(), hasAuthenticatedUser()]);
  const setlist = serviceSelection.state === "active" || serviceSelection.state === "planned" ? serviceSelection.service : null;
  const serviceTeam = setlist ? await getServiceTeam(setlist.id) : [];
  const operationalData = setlist ? await getOperationalServiceData(setlist.id, setlist.songs) : { hasItemNotes: false, items: [], settings: [], songs: [] };
  const operationalEntries = buildOperationalServiceEntries(operationalData.items, operationalData.songs, operationalData.settings);
  const schedule = buildServiceSchedule(operationalData.items, operationalData.songs, setlist?.serviceTime ?? null);
  const serviceTeamGroups = groupCurrentServiceTeam(serviceTeam);
  const serviceSchedule = setlist ? [setlist.serviceDate ? formatServiceDate(setlist.serviceDate) : null, setlist.serviceTime ? formatServiceTime(setlist.serviceTime) : null].filter(Boolean).join(" • ") : "";

  return (
    <main className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:py-12 lg:py-7">
      <MainContainer className="max-w-4xl lg:max-w-7xl">
        <div className="lg:hidden">
          <header className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3">
            <div className="flex min-w-0 items-center gap-2.5"><Image src={appSettings.logo_url ?? "/branding/gracia-worship-logo.png"} alt="" width={1254} height={1254} priority className="size-9 shrink-0 object-contain" /><p className="truncate text-sm font-semibold text-zinc-200">{appSettings.ministry_name}</p></div>
            <Link href={authenticated ? "/profile" : "/login"} aria-label={authenticated ? "Cuenta" : "Iniciar sesión"} className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"><CircleUserRound aria-hidden="true" className="size-5" /></Link>
          </header>
          <p className="mt-2.5 text-[1.375rem] font-semibold tracking-[-0.025em] text-white">{formatGreeting(new Date())}</p>
          <MobileHomeContent authenticated={authenticated} entries={operationalEntries} hasItemNotes={operationalData.hasItemNotes} serviceSelection={serviceSelection} serviceTeamGroups={serviceTeamGroups} setlist={setlist} />
        </div>

        <div className="hidden lg:block">
          <header className="border-b border-white/[0.08] pb-5">
            <h1 className="text-[2rem] font-bold tracking-[-0.035em] text-white">Dashboard</h1>
            <p className="mt-1 text-sm capitalize text-zinc-400">{formatDashboardDate(new Date())}</p>
          </header>

          {setlist ? <>
            <section className="mt-5 grid items-center gap-6 rounded-2xl border border-white/[0.08] border-t-[3px] border-t-emerald-500 bg-zinc-900/60 px-6 py-5 shadow-xl shadow-black/10 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">{serviceSelection.state === "planned" ? <div className="flex flex-wrap items-center gap-2"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Próximo servicio</p><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.12em] text-zinc-400">Planificado</span></div> : <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Próximo servicio</p>}<h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-white">{localizeDefaultServiceName(setlist.serviceName)}</h2><p className="mt-1 text-sm text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p>{serviceSelection.state === "planned" ? <div className="mt-5 flex flex-wrap gap-2"><PrimaryButton href={`/service/${setlist.id}`} className="min-h-11 rounded-xl px-5 text-sm shadow-none hover:translate-y-0">Continuar preparación</PrimaryButton><SecondaryButton href={`/service/${setlist.id}/preflight`} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0">Revisar preparación</SecondaryButton></div> : <div className="mt-5 flex flex-wrap gap-2"><PrimaryButton href="/live" className="min-h-11 rounded-xl px-5 text-sm shadow-none hover:translate-y-0">Abrir En Vivo</PrimaryButton><SecondaryButton href={`/service/${setlist.id}`} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0">Ver orden</SecondaryButton></div>}</div>
              <ServiceCountdownCard inline serviceDate={setlist.serviceDate} serviceTime={setlist.serviceTime} serviceName={localizeDefaultServiceName(setlist.serviceName)} serviceSchedule={serviceSchedule} />
            </section>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.9fr)] xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
              <DashboardCard label="Orden del servicio" aside={`${operationalEntries.length} ${operationalEntries.length === 1 ? "elemento" : "elementos"}`}><OperationalPreview entries={operationalEntries} times={schedule.times} /><DashboardFooterLink href={`/service/${setlist.id}`}>Ver servicio completo →</DashboardFooterLink></DashboardCard>
              <DashboardCard label="Equipo del servicio" aside={`${serviceTeamGroups.length} ${serviceTeamGroups.length === 1 ? "persona asignada" : "personas asignadas"}`}><TeamPreview groups={serviceTeamGroups} /><DashboardFooterLink href={`/admin/service-team?service=${setlist.id}`}>Ver equipo completo →</DashboardFooterLink></DashboardCard>
            </div>

          </> : serviceSelection.state === "error" ? <DashboardServiceError /> : <DashboardServiceEmpty />}
        </div>

        {(await searchParams).restored === "1" ? <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Servicio restaurado correctamente.</div> : null}
      </MainContainer>
    </main>
  );
}

function MobileHomeContent({ authenticated, entries, hasItemNotes, serviceSelection, serviceTeamGroups, setlist }: { authenticated: boolean; entries: OperationalServiceEntry<DashboardSong>[]; hasItemNotes: boolean; serviceSelection: DashboardServiceSelection; serviceTeamGroups: CurrentServiceTeamGroup[]; setlist: ActiveSetlist | null }) {
  if (!setlist) {
    return serviceSelection.state === "error" ? <DashboardServiceError mobile /> : <DashboardServiceEmpty mobile />;
  }

  const songEntries = entries.filter((entry): entry is Extract<OperationalServiceEntry<DashboardSong>, { kind: "song" }> => entry.kind === "song");
  const previewSongs = songEntries.slice(0, 5);
  const remainingSongs = Math.max(songEntries.length - previewSongs.length, 0);
  const date = setlist.serviceDate ? formatHeroDate(setlist.serviceDate) : null;

  return (
    <div className="mt-4 space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.045] bg-zinc-900/65 px-4 pb-5 pt-3 shadow-lg shadow-black/10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 size-40 rounded-full bg-emerald-400/[0.055] blur-3xl" />
        {serviceSelection.state === "planned" ? <div className="relative flex flex-wrap items-center gap-2"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Próximo servicio</p><span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-zinc-400">Planificado</span></div> : <p className="relative text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Próximo servicio</p>}
        <div className="relative mt-1.5 flex items-start justify-between gap-4">
          {date ? <p className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-zinc-400"><span className="block">{date.weekday}</span><span className="mt-0.5 block text-2xl leading-7 tabular-nums text-white">{date.day}</span><span className="block text-zinc-500">{date.month}</span></p> : <p className="text-xs font-semibold text-zinc-500">Fecha pendiente</p>}
          <p className="pt-1 text-right text-sm font-semibold tabular-nums text-zinc-300">{formatServiceTime(setlist.serviceTime)}</p>
        </div>
        <h1 className="relative mt-1.5 truncate text-[1.375rem] font-bold leading-7 tracking-[-0.025em] text-white">{localizeDefaultServiceName(setlist.serviceName)}</h1>
        <p className="relative mt-1 text-[0.8125rem] text-zinc-500">{entries.length} {entries.length === 1 ? "elemento" : "elementos"} · {songEntries.length} {songEntries.length === 1 ? "canción" : "canciones"}</p>
        <div className="relative mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5">
          <Link href={serviceSelection.state === "planned" ? `/service/${setlist.id}` : "/live"} className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-xl bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">{serviceSelection.state === "planned" ? "Continuar preparación" : "Abrir En Vivo"}</Link>
          <Link href={serviceSelection.state === "planned" ? `/service/${setlist.id}/preflight` : `/service/${setlist.id}`} className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-xl border border-white/10 px-3 text-[0.8125rem] font-semibold text-zinc-300 hover:bg-white/[0.05]">{serviceSelection.state === "planned" ? "Revisar" : "Ver orden"}</Link>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between gap-4"><h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Repertorio</h2><Link href={`/service/${setlist.id}`} className="text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300">Ver repertorio ›</Link></div>
        {previewSongs.length ? <ol className="mt-1.5 divide-y divide-white/[0.07] border-y border-white/[0.07]">{previewSongs.map((entry) => <li key={entry.id}><Link href={`/song/${entry.song.id}?service=${setlist.id}&serviceItem=${entry.item.id}`} className="flex min-h-12 items-center gap-2.5 px-1 py-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400"><MusicIcon className="size-3.5 shrink-0 text-emerald-400/60" /><span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-zinc-200">{entry.title}</span>{entry.effectiveKey ? <span className="shrink-0 text-sm font-bold text-emerald-300">{entry.effectiveKey}</span> : null}</Link></li>)}</ol> : <p className="mt-1.5 border-y border-white/[0.07] py-5 text-center text-sm text-zinc-500">No hay canciones en este servicio.</p>}
        {remainingSongs > 0 ? <p className="mt-1.5 text-right text-xs text-zinc-600">+{remainingSongs} {remainingSongs === 1 ? "canción" : "canciones"}</p> : null}
      </section>

      {serviceTeamGroups.length ? <section className="border-y border-white/[0.07] py-3"><div className="flex min-h-10 items-center gap-3"><Users aria-hidden="true" className="size-4 shrink-0 text-emerald-400/70" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-zinc-200">Equipo del servicio</h2><p className="mt-0.5 text-xs text-zinc-500">{serviceTeamGroups.length} {serviceTeamGroups.length === 1 ? "persona sirviendo" : "personas sirviendo"}</p></div>{authenticated ? <Link href={`/admin/service-team?service=${setlist.id}`} aria-label="Ver equipo" className="grid size-10 shrink-0 place-items-center rounded-xl text-zinc-600 hover:bg-white/[0.04] hover:text-emerald-300"><ChevronRight aria-hidden="true" className="size-4" /></Link> : null}</div></section> : null}

      {hasItemNotes || Boolean(setlist.leaderNotes?.trim()) ? <Link href={`/service/${setlist.id}/notes`} className="flex min-h-12 items-center border-y border-white/[0.07] px-1 py-2.5 focus-visible:outline-2 focus-visible:outline-emerald-400"><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-zinc-200">Notas del servicio</p><p className="mt-0.5 text-xs text-zinc-500">Guía para el servicio</p></div><ChevronRight aria-hidden="true" className="size-4 shrink-0 text-zinc-600" /></Link> : null}

      {authenticated && setlist.leaderNotes?.trim() ? <section><h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Preparación</h2><p className="mt-1.5 whitespace-pre-wrap border-y border-white/[0.07] py-3 text-sm leading-6 text-zinc-400">{setlist.leaderNotes}</p></section> : null}
    </div>
  );
}

function DashboardServiceError({ mobile = false }: { mobile?: boolean }) { return <section className={`${mobile ? "mt-4 rounded-2xl border border-rose-300/15 bg-rose-300/[0.035] px-4 py-5" : "mt-6 border-y border-rose-300/15 py-12 text-center"}`}><p className="text-sm font-semibold text-rose-200">No se pudo cargar el servicio.</p><p className="mt-1 text-sm text-zinc-500">Verifica tu conexión e inténtalo nuevamente.</p><SecondaryButton href="/" className="mt-4 min-h-10 rounded-xl px-4 text-sm">Reintentar</SecondaryButton></section>; }
function DashboardServiceEmpty({ mobile = false }: { mobile?: boolean }) { return <section className={`${mobile ? "mt-4 border-y border-white/[0.07] py-8" : "mt-6 border-y border-white/[0.07] py-14 text-center"}`}><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Próximo servicio</p><h1 className={`${mobile ? "mt-2 text-xl" : "mt-3 text-2xl"} font-bold tracking-[-0.025em] text-white`}>No hay servicios próximos.</h1><p className="mt-2 text-sm leading-6 text-zinc-500">Planifica el próximo servicio para comenzar.</p><PrimaryButton href="/service" className="mt-5 min-h-11 rounded-xl px-5 text-sm shadow-none hover:translate-y-0">Planificar servicio</PrimaryButton></section>; }

function DashboardCard({ aside, children, label }: { aside: string; children: React.ReactNode; label: string }) { return <section className="overflow-hidden rounded-2xl border border-white/[0.08] border-t-[3px] border-t-emerald-500 bg-zinc-900/50 shadow-lg shadow-black/10"><header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">{label}</h2><p className="text-xs text-zinc-500">{aside}</p></header>{children}</section>; }

function OperationalPreview({ entries, times }: { entries: OperationalServiceEntry<DashboardSong>[]; times: Map<string, string> }) {
  const visibleEntries = entries.slice(0, 9);
  if (!visibleEntries.length) return <p className="px-4 py-8 text-center text-sm text-zinc-500">No hay elementos en el servicio actual.</p>;
  return <div><div className="grid grid-cols-[88px_minmax(0,1fr)_72px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-zinc-600"><span>Hora</span><span>Contenido</span><span className="text-right">Duración</span></div><ol className="divide-y divide-white/[0.06]">{visibleEntries.map((entry) => <li key={entry.id} className="grid min-h-11 grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 px-4 py-2"><span className="whitespace-nowrap text-xs tabular-nums text-zinc-500">{times.get(getOperationalEntryScheduleKey(entry)) ?? "—"}</span><span className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-200">{entry.kind === "song" ? <Music2 aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400/70" /> : null}<span className="truncate">{entry.title}</span></span><span className="text-right text-xs tabular-nums text-zinc-400">{entry.plannedDurationSeconds ? formatDuration(entry.plannedDurationSeconds) : "—"}</span></li>)}</ol></div>;
}

function TeamPreview({ groups }: { groups: CurrentServiceTeamGroup[] }) { if (!groups.length) return <p className="px-4 py-8 text-center text-sm text-zinc-500">No hay personas asignadas.</p>; return <div className="divide-y divide-white/[0.06] px-4">{groups.slice(0, 7).map((person) => <div key={person.personName.toLocaleLowerCase("es")} className="py-2.5"><p className="truncate text-sm font-semibold text-zinc-100">{person.personName}</p><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">{[...person.roles, ...person.resources].join(" · ") || "Sin función asignada"}</p></div>)}</div>; }
function DashboardFooterLink({ children, href }: { children: React.ReactNode; href: string }) { return <Link href={href} className="flex min-h-10 items-center justify-end border-t border-white/[0.07] px-4 text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/[0.03] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400">{children}</Link>; }

async function getOperationalServiceData(serviceId: number, existingSongs: DashboardSong[]) {
  const supabase = await createSupabaseServerClient();
  const [{ data: itemData, error: itemError }, { data: settingsData, error: settingsError }, { data: noteData }] = await Promise.all([
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position", { ascending: true }),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
    supabase.from("service_item_notes").select("service_item_id").eq("service_id", serviceId).limit(1),
  ]);
  if (itemError) return { hasItemNotes: false, items: [] as ServiceItem[], settings: [] as ServiceSongSetting[], songs: [] as DashboardSong[] };
  const hasItemNotes = Boolean(noteData?.length);
  const items = (itemData ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const settings = settingsError ? [] : (settingsData ?? []) as ServiceSongSetting[];
  const songIds = Array.from(new Set(items.flatMap((item) => [...(item.song_ids ?? []).map((entry) => entry.songId), ...(item.song_id ? [item.song_id] : [])])));
  if (!songIds.length) return { hasItemNotes, items, settings, songs: [] as DashboardSong[] };
  const reusableSongs = existingSongs.filter((song) => songIds.includes(song.id));
  const reusableIds = new Set(reusableSongs.map((song) => song.id));
  const missingSongIds = songIds.filter((id) => !reusableIds.has(id));
  if (!missingSongIds.length) return { hasItemNotes, items, settings, songs: reusableSongs };
  const { data: songData, error: songError } = await supabase.from("songs").select("id, title, key, duration").in("id", missingSongIds);
  return { hasItemNotes, items, settings, songs: [...reusableSongs, ...(songError ? [] : (songData ?? []) as DashboardSong[])] };
}

function formatDashboardDate(value: Date) { const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(value); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatGreeting(value: Date) { const hour = value.getHours(); return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"; }
function formatHeroDate(value: string) { const [year, month, day] = value.split("-").map(Number); const date = new Date(year, month - 1, day); return { weekday: new Intl.DateTimeFormat("es-419", { weekday: "short" }).format(date).replaceAll(".", ""), day: String(day).padStart(2, "0"), month: new Intl.DateTimeFormat("es-419", { month: "short" }).format(date).replaceAll(".", "") }; }
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", month: "long", day: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
