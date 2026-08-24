import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppPage } from "@/components/app-page";
import { ServiceRunReport, type ServiceReportRun, type ServiceRunReportRow } from "@/components/service-run-report";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceItem, ServiceSong, ServiceSongSetting } from "@/lib/service";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServiceSchedule, getOperationalEntryScheduleKey } from "@/lib/service-schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reporte del servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();
  const returnPath = `/service/${serviceId}/report`;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  const supabase = await createSupabaseServerClient();
  const [{ data: service, error: serviceError }, { data: itemData }, { data: settingData }, { data: runData }, { data: liveState }] = await Promise.all([
    supabase.from("active_setlist").select("service_name, service_date, service_time, status").eq("id", serviceId).maybeSingle(),
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position").order("created_at"),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
    supabase.from("service_item_runs").select("id, service_item_id, song_id, occurrence_index, started_at, ended_at, planned_duration_seconds, created_at").eq("service_id", serviceId).order("started_at").order("created_at"),
    supabase.from("live_service_state").select("finished_at").eq("service_id", serviceId).maybeSingle(),
  ]);
  if (serviceError || !service) notFound();

  const items = (itemData ?? []).map(normalizeServiceItemSongIds) as ServiceItem[];
  const songIds = Array.from(new Set(items.flatMap((item) => [
    ...(item.song_id ? [item.song_id] : []),
    ...(item.song_ids ?? []).map((entry) => entry.songId),
  ])));
  const { data: songData } = songIds.length
    ? await supabase.from("songs").select("id, title, artist, key, bpm, duration, time_signature, audio_url, sheet_url").in("id", songIds)
    : { data: [] };
  const songs = (songData ?? []) as ServiceSong[];
  const entries = buildOperationalServiceEntries(items, songs, (settingData ?? []) as ServiceSongSetting[]);
  const schedule = buildServiceSchedule(items, songs, service.service_time);
  const runs = (runData ?? []) as ServiceReportRun[];

  const rows: ServiceRunReportRow[] = entries.map((entry, index) => ({
    effectiveKey: entry.kind === "song" ? entry.effectiveKey : null,
    id: entry.id,
    itemType: entry.kind === "song" ? "Canción" : getItemTypeLabel(entry.item.type),
    occurrenceIndex: entry.occurrenceIndex,
    plannedDurationSeconds: entry.plannedDurationSeconds,
    plannedStart: schedule.times.get(getOperationalEntryScheduleKey(entry)) ?? "—",
    position: index + 1,
    runs: runs.filter((run) => run.service_item_id === entry.item.id
      && run.song_id === (entry.kind === "song" ? entry.song.id : null)
      && run.occurrence_index === entry.occurrenceIndex),
    title: entry.title,
  }));

  return <AppPage title="Reporte del servicio" maxWidth="max-w-6xl" desktopAdminSidebar><ServiceRunReport date={service.service_date} finishedAt={liveState?.finished_at ?? null} lifecycleStatus={service.status} plannedStart={service.service_time} rows={rows} serviceName={localizeDefaultServiceName(service.service_name)} /></AppPage>;
}

function getItemTypeLabel(type: ServiceItem["type"]) {
  return type === "worship" ? "Adoración" : type === "song" ? "Canción" : "Elemento";
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
