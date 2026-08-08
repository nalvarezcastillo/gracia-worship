import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage } from "@/components/app-page";
import { ServiceRunReport, type ServiceRunReportRow } from "@/components/service-run-report";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reporte del servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServiceReportPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data: service, error: serviceError }, { data: runs, error: runsError }] = await Promise.all([
    supabase.from("active_setlist").select("service_name, service_date").eq("id", serviceId).maybeSingle(),
    supabase.from("service_item_runs").select("id, service_item_id, song_id, started_at, ended_at, planned_duration_seconds, created_at").eq("service_id", serviceId).order("started_at").order("created_at"),
  ]);
  if (serviceError || !service) notFound();

  const runRows = runsError ? [] : runs ?? [];
  const itemIds = Array.from(new Set(runRows.map((run) => run.service_item_id)));
  const songIds = Array.from(new Set(runRows.flatMap((run) => run.song_id ? [run.song_id] : [])));
  const [{ data: items }, { data: songs }] = await Promise.all([
    itemIds.length ? supabase.from("service_items").select("id, title").in("id", itemIds) : Promise.resolve({ data: [] }),
    songIds.length ? supabase.from("songs").select("id, title").in("id", songIds) : Promise.resolve({ data: [] }),
  ]);
  const itemTitles = new Map((items ?? []).map((item) => [item.id, item.title]));
  const songTitles = new Map((songs ?? []).map((song) => [song.id, song.title]));
  const reportRows: ServiceRunReportRow[] = runRows.map((run) => ({
    ended_at: run.ended_at,
    id: run.id,
    planned_duration_seconds: run.planned_duration_seconds,
    songTitle: run.song_id ? songTitles.get(run.song_id) ?? "Canción" : null,
    started_at: run.started_at,
    title: itemTitles.get(run.service_item_id) ?? "Elemento del servicio",
  }));

  return <AppPage title="Reporte del servicio" maxWidth="max-w-5xl"><ServiceRunReport date={service.service_date} rows={reportRows} serviceName={localizeDefaultServiceName(service.service_name)} /></AppPage>;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
