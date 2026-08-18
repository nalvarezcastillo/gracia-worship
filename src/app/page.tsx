import Image from "next/image";
import Link from "next/link";
import { BarChart3, Cable, ListMusic, Music2, Plus, Users } from "lucide-react";
import { MusicIcon } from "@/components/icons";
import { AppSectionCard } from "@/components/app-section-card";
import { ServiceCountdownCard } from "@/components/service-countdown-card";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { formatDuration } from "@/lib/duration";
import type { ServiceItem } from "@/lib/service";
import { buildOperationalServiceEntries, type OperationalServiceEntry } from "@/lib/service-entries";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServiceSchedule, getOperationalEntryScheduleKey } from "@/lib/service-schedule";
import { getActiveSetlist } from "@/lib/setlist";
import { getAppSettings } from "@/lib/app-settings";
import { getServiceTeam, groupCurrentServiceTeam, type CurrentServiceTeamGroup } from "@/lib/current-service-team";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DashboardSong = { duration: string; id: string; title: string };

export default async function Home({ searchParams }: { searchParams: Promise<{ restored?: string }> }) {
  const [setlist, appSettings] = await Promise.all([getActiveSetlist(), getAppSettings()]);
  const serviceTeam = setlist ? await getServiceTeam(setlist.id) : [];
  const operationalData = setlist ? await getOperationalServiceData(setlist.id, setlist.songs) : { items: [], songs: [] };
  const operationalEntries = buildOperationalServiceEntries(operationalData.items, operationalData.songs);
  const schedule = buildServiceSchedule(operationalData.items, operationalData.songs, setlist?.serviceTime ?? null);
  const previewSongs = setlist?.songs.slice(0, 5) ?? [];
  const remainingSongs = Math.max((setlist?.songs.length ?? 0) - previewSongs.length, 0);
  const serviceTeamGroups = groupCurrentServiceTeam(serviceTeam);
  const serviceSchedule = setlist ? [setlist.serviceDate ? formatServiceDate(setlist.serviceDate) : null, setlist.serviceTime ? formatServiceTime(setlist.serviceTime) : null].filter(Boolean).join(" • ") : "";

  return (
    <main className="min-h-screen py-8 sm:py-12 lg:py-7">
      <MainContainer className="max-w-4xl lg:max-w-7xl">
        <div className="lg:hidden">
          <header className="flex flex-col items-center text-center">
            <Image src={appSettings.logo_url ?? "/branding/gracia-worship-logo.png"} alt="Logo de Gracia Worship" width={1254} height={1254} priority className="h-auto w-[170px] object-contain sm:w-[220px]" />
            <h1 className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-white sm:text-4xl">{appSettings.ministry_name}</h1>
          </header>
          <MobileHomeContent previewSongs={previewSongs} remainingSongs={remainingSongs} serviceSchedule={serviceSchedule} serviceTeamGroups={serviceTeamGroups} setlist={setlist} />
        </div>

        <div className="hidden lg:block">
          <header className="border-b border-white/[0.08] pb-5">
            <h1 className="text-[2rem] font-bold tracking-[-0.035em] text-white">Dashboard</h1>
            <p className="mt-1 text-sm capitalize text-zinc-400">{formatDashboardDate(new Date())}</p>
          </header>

          {setlist ? <>
            <section className="mt-5 grid items-center gap-6 rounded-2xl border border-white/[0.08] border-t-[3px] border-t-emerald-500 bg-zinc-900/60 px-6 py-5 shadow-xl shadow-black/10 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Próximo servicio</p><h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-white">{localizeDefaultServiceName(setlist.serviceName)}</h2><p className="mt-1 text-sm text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p><div className="mt-4 flex flex-wrap gap-2"><PrimaryButton href={`/service/${setlist.id}`} className="min-h-10 rounded-xl px-4 text-sm shadow-none hover:translate-y-0">Abrir servicio</PrimaryButton><SecondaryButton href={`/service/${setlist.id}/rehearsal`} className="min-h-10 rounded-xl px-4 text-sm shadow-none hover:translate-y-0">Ensayo</SecondaryButton><SecondaryButton href="/live" className="min-h-10 rounded-xl px-4 text-sm shadow-none hover:translate-y-0">En Vivo</SecondaryButton></div></div>
              <ServiceCountdownCard inline serviceDate={setlist.serviceDate} serviceTime={setlist.serviceTime} serviceName={localizeDefaultServiceName(setlist.serviceName)} serviceSchedule={serviceSchedule} />
            </section>

            <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.9fr)] xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.9fr)]">
              <DashboardCard label="Orden del servicio" aside={`${operationalEntries.length} ${operationalEntries.length === 1 ? "elemento" : "elementos"}`}><OperationalPreview entries={operationalEntries} times={schedule.times} /><DashboardFooterLink href={`/service/${setlist.id}`}>Ver servicio completo →</DashboardFooterLink></DashboardCard>
              <DashboardCard label="Equipo del servicio" aside={`${serviceTeamGroups.length} ${serviceTeamGroups.length === 1 ? "persona asignada" : "personas asignadas"}`}><TeamPreview groups={serviceTeamGroups} /><DashboardFooterLink href={`/admin/service-team?service=${setlist.id}`}>Ver equipo completo →</DashboardFooterLink></DashboardCard>
            </div>

            <section className="mt-5"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Accesos rápidos</p><div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-5"><QuickAccess href="/admin/song/new" icon={Plus} label="Canción" /><QuickAccess href={`/admin/setlist?service=${setlist.id}`} icon={ListMusic} label="Editar Setlist" /><QuickAccess href={`/admin/service-team?service=${setlist.id}`} icon={Users} label="Equipo" /><QuickAccess href={`/admin/resources?service=${setlist.id}`} icon={Cable} label="Recursos" /><QuickAccess href="/admin/reports" icon={BarChart3} label="Reportes" /></div></section>
          </> : <section className="mt-6 border-y border-white/[0.07] py-12 text-center"><p className="text-sm text-zinc-400">No hay un servicio preparado.</p><SecondaryButton href="/admin" className="mt-4 min-h-10 rounded-xl px-4 text-sm">Ir a Administración</SecondaryButton></section>}
        </div>

        {(await searchParams).restored === "1" ? <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Servicio restaurado correctamente.</div> : null}
      </MainContainer>
    </main>
  );
}

function MobileHomeContent({ previewSongs, remainingSongs, serviceSchedule, serviceTeamGroups, setlist }: { previewSongs: Array<{ id: string; title: string }>; remainingSongs: number; serviceSchedule: string; serviceTeamGroups: CurrentServiceTeamGroup[]; setlist: Awaited<ReturnType<typeof getActiveSetlist>> }) {
  return <><AppSectionCard eyebrow="Próximo servicio" title={setlist ? localizeDefaultServiceName(setlist.serviceName) : "Próximo servicio"} subtitle={setlist ? (setlist.serviceDate ? <><p>{formatServiceDate(setlist.serviceDate)}</p><p>{formatServiceTime(setlist.serviceTime)}</p></> : setlist.serviceTime) : "Next service is not configured."}><div className="px-4 py-3 sm:px-6 sm:py-4">{previewSongs.length ? <ol className="divide-y divide-white/[0.055]">{previewSongs.map((song, index) => <li key={song.id} className="flex min-h-10 items-center gap-3 px-1 py-1.5 text-sm font-semibold text-zinc-200 sm:text-base"><span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span><MusicIcon className="size-4 shrink-0 text-emerald-400/65" /><span className="truncate">{song.title}</span></li>)}</ol> : <p className="py-4 text-center text-sm text-zinc-500">No songs in the setlist.</p>}{remainingSongs > 0 ? <p className="mt-2 text-sm font-medium text-zinc-500">+{remainingSongs} more</p> : null}<div className="mt-4 flex flex-col gap-3 sm:flex-row"><PrimaryButton href={setlist ? `/service/${setlist.id}` : "/service"} className="w-full sm:w-auto">Abrir repertorio</PrimaryButton><SecondaryButton href="/archive" className="w-full sm:w-auto">Archivo</SecondaryButton></div></div></AppSectionCard><div>{serviceTeamGroups.length ? <AppSectionCard eyebrow="Equipo del servicio" title="Equipo del servicio" subtitle={`${serviceTeamGroups.length} ${serviceTeamGroups.length === 1 ? "persona sirviendo" : "personas sirviendo"}`}><div className="divide-y divide-white/[0.055] px-4 sm:px-6">{serviceTeamGroups.map((person) => <div key={person.personName.toLocaleLowerCase("es")} className="py-3 sm:py-4"><p className="text-base font-semibold text-white sm:text-lg">{person.personName}</p>{person.roles.length ? <p className="mt-1.5 text-sm text-zinc-400">{person.roles.join(" • ")}</p> : null}{person.resources.length ? <p className="mt-1 text-sm text-zinc-500">{person.resources.join(" • ")}</p> : null}</div>)}</div></AppSectionCard> : null}{setlist?.leaderNotes?.trim() ? <AppSectionCard eyebrow="Notas" title="Notas del líder"><div className="px-5 py-4 sm:px-6 sm:py-5"><p className="whitespace-pre-wrap break-words text-base leading-7 text-zinc-300">{setlist.leaderNotes}</p></div></AppSectionCard> : null}{setlist ? <ServiceCountdownCard serviceDate={setlist.serviceDate} serviceTime={setlist.serviceTime} serviceName={localizeDefaultServiceName(setlist.serviceName)} serviceSchedule={serviceSchedule} /> : null}</div></>;
}

function DashboardCard({ aside, children, label }: { aside: string; children: React.ReactNode; label: string }) { return <section className="overflow-hidden rounded-2xl border border-white/[0.08] border-t-[3px] border-t-emerald-500 bg-zinc-900/50 shadow-lg shadow-black/10"><header className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3"><h2 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">{label}</h2><p className="text-xs text-zinc-500">{aside}</p></header>{children}</section>; }

function OperationalPreview({ entries, times }: { entries: OperationalServiceEntry<DashboardSong>[]; times: Map<string, string> }) {
  const visibleEntries = entries.slice(0, 9);
  if (!visibleEntries.length) return <p className="px-4 py-8 text-center text-sm text-zinc-500">No hay elementos en el servicio actual.</p>;
  return <div><div className="grid grid-cols-[88px_minmax(0,1fr)_72px] gap-3 border-b border-white/[0.06] px-4 py-2 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-zinc-600"><span>Hora</span><span>Contenido</span><span className="text-right">Duración</span></div><ol className="divide-y divide-white/[0.06]">{visibleEntries.map((entry) => <li key={entry.id} className="grid min-h-11 grid-cols-[88px_minmax(0,1fr)_72px] items-center gap-3 px-4 py-2"><span className="whitespace-nowrap text-xs tabular-nums text-zinc-500">{times.get(getOperationalEntryScheduleKey(entry)) ?? "—"}</span><span className="flex min-w-0 items-center gap-2 text-sm font-medium text-zinc-200">{entry.kind === "song" ? <Music2 aria-hidden="true" className="size-3.5 shrink-0 text-emerald-400/70" /> : null}<span className="truncate">{entry.title}</span></span><span className="text-right text-xs tabular-nums text-zinc-400">{entry.plannedDurationSeconds ? formatDuration(entry.plannedDurationSeconds) : "—"}</span></li>)}</ol></div>;
}

function TeamPreview({ groups }: { groups: CurrentServiceTeamGroup[] }) { if (!groups.length) return <p className="px-4 py-8 text-center text-sm text-zinc-500">No hay personas asignadas.</p>; return <div className="divide-y divide-white/[0.06] px-4">{groups.slice(0, 7).map((person) => <div key={person.personName.toLocaleLowerCase("es")} className="py-2.5"><p className="truncate text-sm font-semibold text-zinc-100">{person.personName}</p><p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">{[...person.roles, ...person.resources].join(" · ") || "Sin función asignada"}</p></div>)}</div>; }
function DashboardFooterLink({ children, href }: { children: React.ReactNode; href: string }) { return <Link href={href} className="flex min-h-10 items-center justify-end border-t border-white/[0.07] px-4 text-xs font-semibold text-zinc-400 transition-colors hover:bg-white/[0.03] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400">{children}</Link>; }
function QuickAccess({ href, icon: Icon, label }: { href: string; icon: typeof Plus; label: string }) { return <Link href={href} className="flex min-h-12 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"><Icon aria-hidden="true" className="size-4 text-emerald-400" />{label}</Link>; }

async function getOperationalServiceData(serviceId: number, existingSongs: DashboardSong[]) {
  const supabase = await createSupabaseServerClient();
  const { data: itemData, error: itemError } = await supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position", { ascending: true });
  if (itemError) return { items: [] as ServiceItem[], songs: [] as DashboardSong[] };
  const items = (itemData ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const songIds = Array.from(new Set(items.flatMap((item) => [...(item.song_ids ?? []).map((entry) => entry.songId), ...(item.song_id ? [item.song_id] : [])])));
  if (!songIds.length) return { items, songs: [] as DashboardSong[] };
  const reusableSongs = existingSongs.filter((song) => songIds.includes(song.id));
  const reusableIds = new Set(reusableSongs.map((song) => song.id));
  const missingSongIds = songIds.filter((id) => !reusableIds.has(id));
  if (!missingSongIds.length) return { items, songs: reusableSongs };
  const { data: songData, error: songError } = await supabase.from("songs").select("id, title, duration").in("id", missingSongIds);
  return { items, songs: [...reusableSongs, ...(songError ? [] : (songData ?? []) as DashboardSong[])] };
}

function formatDashboardDate(value: Date) { const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(value); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", month: "long", day: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatServiceTime(value: string) { const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/); if (!match) return value; const hour = Number(match[1]); return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
