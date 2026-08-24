import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceItem, ServiceSongSetting } from "@/lib/service";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServicePreflight, type PreflightCheck, type PreflightOccurrence, type PreflightSeverity, type PreflightSongKey } from "@/lib/service-preflight";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Preparación del servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

type PreflightSong = { duration: string | null; id: string; key: string | null; title: string };
type SongKeyRow = { grid_beat_unit: number | null; grid_beats_per_bar: number | null; grid_bpm: number | null; grid_offset_seconds: number | null; id: string; key_name: string; song_id: string };

export default async function ServicePreflightPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();
  const returnPath = `/service/${serviceId}/preflight`;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  const supabase = await createSupabaseServerClient();
  const [{ data: service, error: serviceError }, { data: itemRows, error: itemError }, { data: settingRows, error: settingError }, { data: mixRows, error: mixError }, { count: teamAssignmentCount, error: teamError }] = await Promise.all([
    supabase.from("active_setlist").select("service_name, service_date, service_time, status").eq("id", serviceId).maybeSingle(),
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position"),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
    supabase.from("service_playback_stem_settings").select("service_item_id, song_id").eq("service_id", serviceId),
    supabase.from("service_team_assignments").select("id", { count: "exact", head: true }).eq("service_id", serviceId),
  ]);
  if (serviceError || !service) notFound();
  if (itemError || settingError || mixError || teamError) throw new Error(itemError?.message ?? settingError?.message ?? mixError?.message ?? teamError?.message);

  const items = (itemRows ?? []).map(normalizeServiceItemSongIds) as ServiceItem[];
  const songIds = [...new Set(items.flatMap((item) => [...(item.song_ids ?? []).map((entry) => entry.songId), ...(item.song_id ? [item.song_id] : [])]))];
  const [{ data: songRows, error: songError }, { data: keyRows, error: keyError }] = songIds.length ? await Promise.all([
    supabase.from("songs").select("id, title, key, duration").in("id", songIds),
    supabase.from("song_keys").select("id, song_id, key_name, grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds").in("song_id", songIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (songError || keyError) throw new Error(songError?.message ?? keyError?.message);

  const songs = (songRows ?? []) as PreflightSong[];
  const keys = (keyRows ?? []) as SongKeyRow[];
  const keyIds = keys.map((key) => key.id);
  const [{ data: stemRows, error: stemError }, { data: sectionRows, error: sectionError }] = keyIds.length ? await Promise.all([
    supabase.from("song_stems").select("song_key_id, name").in("song_key_id", keyIds),
    supabase.from("song_sections").select("song_key_id").in("song_key_id", keyIds),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  if (stemError || sectionError) throw new Error(stemError?.message ?? sectionError?.message);

  const keyAssets = new Map(keys.map((key) => [key.id, {
    gridBeatUnit: key.grid_beat_unit,
    gridBeatsPerBar: key.grid_beats_per_bar,
    gridBpm: key.grid_bpm === null ? null : Number(key.grid_bpm),
    gridOffsetSeconds: key.grid_offset_seconds === null ? null : Number(key.grid_offset_seconds),
    id: key.id,
    sections: (sectionRows ?? []).filter((section) => section.song_key_id === key.id).length,
    stems: (stemRows ?? []).filter((stem) => stem.song_key_id === key.id).map((stem) => ({ name: stem.name })),
  } satisfies PreflightSongKey]));
  const keysBySongAndName = new Map(keys.map((key) => [`${key.song_id}:${key.key_name.trim()}`, keyAssets.get(key.id) ?? null]));
  const entries = buildOperationalServiceEntries(items, songs, (settingRows ?? []) as ServiceSongSetting[]);
  const occurrences = entries.flatMap<PreflightOccurrence>((entry) => entry.kind === "song" ? [{
    effectiveKey: entry.effectiveKey,
    id: entry.id,
    itemId: entry.item.id,
    keyVariant: entry.effectiveKey ? keysBySongAndName.get(`${entry.song.id}:${entry.effectiveKey.trim()}`) ?? null : null,
    plannedDurationSeconds: entry.plannedDurationSeconds,
    songId: entry.song.id,
    title: getOccurrenceLabel(entry.title, entry.item.title, entry.occurrenceIndex, entry.source),
  }] : []);
  const result = buildServicePreflight({
    mixOccurrenceKeys: new Set((mixRows ?? []).map((mix) => `${mix.service_item_id}:${mix.song_id}`)),
    occurrences,
    operationalEntries: entries.map((entry) => ({ label: entry.kind === "song" ? getOccurrenceLabel(entry.title, entry.item.title, entry.occurrenceIndex, entry.source) : entry.title, plannedDurationSeconds: entry.plannedDurationSeconds })),
    serviceDate: service.service_date,
    serviceTime: service.service_time,
    teamAssignmentCount: teamAssignmentCount ?? 0,
  });
  const serviceSchedule = [service.service_date ? formatServiceDate(service.service_date) : null, service.service_time ? formatServiceTime(service.service_time) : null].filter(Boolean).join(" · ");

  return <main className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 sm:py-10"><MainContainer className="max-w-5xl"><header className="border-b border-white/[0.08] pb-5"><Link href={`/service/${serviceId}`} className="text-xs font-semibold text-zinc-500 hover:text-emerald-300">← Orden del servicio</Link><p className="mt-5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-emerald-400">Preparación del servicio</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">{localizeDefaultServiceName(service.service_name)}</h1><p className="mt-2 text-sm text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p></header><section className="py-6" aria-labelledby="preflight-summary-title"><div className={`rounded-2xl border p-5 ${result.summary.warning ? "border-amber-300/20 bg-amber-300/[0.045]" : "border-emerald-400/20 bg-emerald-400/[0.045]"}`}><p id="preflight-summary-title" className={`text-sm font-semibold ${result.summary.warning ? "text-amber-200" : "text-emerald-300"}`}>{result.summary.warning ? `Hay ${result.summary.warning} ${result.summary.warning === 1 ? "elemento" : "elementos"} por revisar` : "Servicio listo para operar"}</p><p className="mt-1 text-xs text-zinc-500">Preflight es informativo y no bloquea Ensayo, Playback ni En Vivo.</p></div><dl className="mt-4 grid grid-cols-3 gap-3"><SummaryCount label="Listo" value={result.summary.ready} tone="ready" /><SummaryCount label="Revisar" value={result.summary.warning} tone="warning" /><SummaryCount label="Info" value={result.summary.info} tone="info" /></dl></section><div className="grid gap-8 lg:grid-cols-2">{result.sections.map((section) => <section key={section.id} aria-labelledby={`preflight-${section.id}`}><h2 id={`preflight-${section.id}`} className="border-b border-white/[0.07] pb-3 text-xs font-bold uppercase tracking-[0.17em] text-zinc-500">{section.label}</h2><div className="divide-y divide-white/[0.06]">{section.checks.map((check) => <CheckRow key={check.id} check={check} serviceId={serviceId} />)}</div></section>)}</div><nav aria-label="Acciones del servicio" className="mt-10 flex flex-col gap-3 border-t border-white/[0.07] pt-6 sm:flex-row sm:flex-wrap"><QuickLink href={`/service/${serviceId}`}>Abrir orden</QuickLink><QuickLink href={`/service/${serviceId}/rehearsal`}>Abrir ensayo</QuickLink><QuickLink href={`/service/${serviceId}/playback`}>Abrir Playback</QuickLink>{service.status === "active" ? <QuickLink href="/live" primary>Abrir En Vivo</QuickLink> : null}</nav></MainContainer></main>;
}

function CheckRow({ check, serviceId }: { check: PreflightCheck; serviceId: number }) { const presentation = severityPresentation[check.severity]; return <article className="py-4"><div className="flex items-start gap-3"><span aria-hidden="true" className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${presentation.badge}`}>{presentation.icon}</span><div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-2"><h3 className="text-sm font-semibold text-zinc-200">{check.label}</h3><span className={`text-[0.625rem] font-bold uppercase tracking-[0.12em] ${presentation.text}`}>{presentation.label}</span></div><p className="mt-1 text-sm leading-6 text-zinc-400">{check.message}</p></div></div>{check.details?.length ? <ul className="ml-9 mt-3 space-y-2 border-l border-white/[0.07] pl-3">{check.details.map((detail, index) => <li key={`${detail.label}:${detail.message}:${index}`} className="text-xs leading-5 text-zinc-500"><span className="font-semibold text-zinc-300">{detail.label}</span><span className="mx-1.5 text-zinc-700">·</span>{detail.message}{detail.href ? <Link href={`${detail.href}?service=${serviceId}`} className="ml-2 font-semibold text-emerald-400/80 hover:text-emerald-300">Abrir →</Link> : null}</li>)}</ul> : null}</article>; }
function SummaryCount({ label, tone, value }: { label: string; tone: PreflightSeverity; value: number }) { const presentation = severityPresentation[tone]; return <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3 text-center"><dt className={`text-[0.625rem] font-bold uppercase tracking-[0.13em] ${presentation.text}`}>{label}</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-white">{value}</dd></div>; }
function QuickLink({ children, href, primary = false }: { children: React.ReactNode; href: string; primary?: boolean }) { return <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold ${primary ? "bg-emerald-400 text-zinc-950 hover:bg-emerald-300" : "border border-white/10 text-zinc-200 hover:bg-white/[0.05]"}`}>{children}</Link>; }
const severityPresentation: Record<PreflightSeverity, { badge: string; icon: string; label: string; text: string }> = { ready: { badge: "bg-emerald-400/10 text-emerald-300", icon: "✓", label: "Listo", text: "text-emerald-400" }, warning: { badge: "bg-amber-300/10 text-amber-200", icon: "!", label: "Revisar", text: "text-amber-300" }, info: { badge: "bg-sky-300/10 text-sky-200", icon: "i", label: "Info", text: "text-sky-300" } };
function getOccurrenceLabel(songTitle: string, itemTitle: string, occurrenceIndex: number, source: "legacy-worship" | "song-item") { return source === "legacy-worship" ? `${songTitle} · ${itemTitle} #${occurrenceIndex}` : songTitle; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
function formatServiceDate(value: string) { const [year, month, day] = value.split("-").map(Number); return new Intl.DateTimeFormat("es-419", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)).replaceAll(".", ""); }
function formatServiceTime(value: string) { const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
