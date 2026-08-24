import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppEmptyState } from "@/components/app-empty-state";
import { AppPage } from "@/components/app-page";
import { AppStatusBadge } from "@/components/app-status-badge";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceStatus } from "@/lib/database.types";
import { formatDuration } from "@/lib/duration";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reportes de servicios | Gracia Worship" };
export const dynamic = "force-dynamic";

const REPORT_LIMIT = 100;
type ReportState = "completed" | "live" | "incomplete" | "none";
type ServiceRun = { ended_at: string | null; service_id: number; started_at: string };
type ServiceState = { finished_at: string | null; service_id: number };
type ServiceRecord = { id: number; service_date: string | null; service_name: string; service_time: string; status: ServiceStatus };
type HistoricalReport = { actualElapsedSeconds: number | null; completedRunCount: number; runCount: number; service: ServiceRecord; state: ReportState };

export default async function ServiceReportsPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/reports");
  const supabase = await createSupabaseServerClient();
  const { data: serviceData, error: serviceError } = await supabase
    .from("active_setlist")
    .select("id, service_name, service_date, service_time, status")
    .in("status", ["active", "completed", "archived"])
    .order("service_date", { ascending: false, nullsFirst: false })
    .order("service_time", { ascending: false })
    .order("id", { ascending: false })
    .limit(REPORT_LIMIT);
  if (serviceError) throw new Error(serviceError.message);

  const services = (serviceData ?? []) as ServiceRecord[];
  const serviceIds = services.map((service) => service.id);
  const [{ data: runData, error: runError }, { data: stateData, error: stateError }] = serviceIds.length
    ? await Promise.all([
        supabase.from("service_item_runs").select("service_id, started_at, ended_at").in("service_id", serviceIds),
        supabase.from("live_service_state").select("service_id, finished_at").in("service_id", serviceIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  if (runError) throw new Error(runError.message);
  if (stateError) throw new Error(stateError.message);

  const runsByService = groupRunsByService((runData ?? []) as ServiceRun[]);
  const states = new Map(((stateData ?? []) as ServiceState[]).map((state) => [state.service_id, state]));
  const displayNow = Date.now();
  const reports = services.flatMap<HistoricalReport>((service) => {
    const runs = runsByService.get(service.id) ?? [];
    if (service.status === "active" && runs.length === 0) return [];
    const finishedAt = states.get(service.id)?.finished_at ?? null;
    const state = deriveReportState(runs, finishedAt);
    return [{ actualElapsedSeconds: getActualElapsedSeconds(runs, finishedAt, state, displayNow), completedRunCount: runs.filter((run) => run.ended_at !== null).length, runCount: runs.length, service, state }];
  });

  return (
    <AppPage breadcrumb={<><Link href="/admin" className="transition-colors duration-200 hover:text-emerald-300">Administración</Link><span aria-hidden="true"> &gt; </span><span className="text-zinc-300">Reportes</span></>} description="Resumen de tiempos registrados y acceso al detalle de cada servicio." desktopAdminSidebar maxWidth="max-w-6xl" title="Historial de servicios">
      {!reports.length ? (
        <AppEmptyState className="mt-6 border-y border-white/[0.07] py-12"><p>Aún no hay servicios con historial disponible.</p></AppEmptyState>
      ) : <>
        <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07] md:hidden">{reports.map((report) => <MobileReportCard key={report.service.id} report={report} />)}</div>
        <div className="mt-8 hidden overflow-hidden border-y border-white/[0.07] md:block"><table className="w-full table-fixed text-left"><thead><tr className="border-b border-white/[0.07] text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-600"><th className="w-[15%] px-3 py-3">Fecha</th><th className="w-[29%] px-3 py-3">Servicio</th><th className="w-[12%] px-3 py-3">Hora</th><th className="w-[17%] px-3 py-3">Estado</th><th className="w-[13%] px-3 py-3">Actual</th><th className="w-[14%] px-3 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{reports.map((report) => <DesktopReportRow key={report.service.id} report={report} />)}</tbody></table></div>
        {services.length === REPORT_LIMIT ? <p className="mt-4 text-xs text-zinc-600">Mostrando los {REPORT_LIMIT} servicios históricos más recientes.</p> : null}
      </>}
    </AppPage>
  );
}

function DesktopReportRow({ report }: { report: HistoricalReport }) {
  const { actualElapsedSeconds, runCount, service, state } = report;
  return <tr className="align-middle transition-colors hover:bg-white/[0.025]"><td className="px-3 py-4 text-sm text-zinc-400">{formatServiceDate(service.service_date)}</td><td className="px-3 py-4"><p className="break-words font-semibold text-white">{localizeDefaultServiceName(service.service_name)}</p>{state === "none" && service.status === "archived" ? <p className="mt-1 text-xs text-zinc-500">Archivo heredado · Sin datos de tiempo</p> : runCount > 0 ? <p className="mt-1 text-xs text-zinc-600">{formatRunSummary(report)}</p> : null}</td><td className="px-3 py-4 text-sm tabular-nums text-zinc-400">{formatPlannedServiceTime(service.service_time)}</td><td className="px-3 py-4"><ReportStateBadge state={state} /></td><td className="px-3 py-4 text-sm font-medium tabular-nums text-zinc-300">{actualElapsedSeconds === null ? "—" : formatDuration(actualElapsedSeconds)}</td><td className="px-3 py-4 text-right"><ReportLink serviceId={service.id} /></td></tr>;
}

function MobileReportCard({ report }: { report: HistoricalReport }) {
  const { actualElapsedSeconds, service, state } = report;
  return <article className="py-6"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-zinc-500">{formatServiceDate(service.service_date)}</p><h2 className="mt-2 break-words text-xl font-semibold text-white">{localizeDefaultServiceName(service.service_name)}</h2><p className="mt-1 text-sm tabular-nums text-zinc-400">{formatPlannedServiceTime(service.service_time)}</p><div className="mt-4"><ReportStateBadge state={state} /></div>{state === "none" && service.status === "archived" ? <p className="mt-3 text-sm text-zinc-500">Archivo heredado · Sin datos de tiempo</p> : report.runCount > 0 ? <p className="mt-3 text-xs text-zinc-600">{formatRunSummary(report)}</p> : null}<dl className="mt-5 border-y border-white/[0.07] py-4"><div><dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">{state === "live" ? "Transcurrido" : "Duración real"}</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-zinc-200">{actualElapsedSeconds === null ? "—" : formatDuration(actualElapsedSeconds)}</dd></div></dl><div className="mt-3 flex justify-end"><ReportLink serviceId={service.id} /></div></article>;
}

function ReportLink({ serviceId }: { serviceId: number }) { return <Link href={`/service/${serviceId}/report`} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-white transition-colors hover:bg-white/[0.045] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400">Ver reporte <span aria-hidden="true" className="ml-2">→</span></Link>; }
function ReportStateBadge({ state }: { state: ReportState }) { const labels: Record<ReportState, string> = { completed: "Completado", incomplete: "Tiempo incompleto", live: "En Vivo", none: "Sin datos de tiempo" }; const variants: Record<ReportState, "neutral" | "success" | "warning"> = { completed: "neutral", incomplete: "warning", live: "success", none: "warning" }; return <AppStatusBadge variant={variants[state]}>{labels[state]}</AppStatusBadge>; }

function deriveReportState(runs: ServiceRun[], finishedAt: string | null): ReportState {
  if (runs.some((run) => run.ended_at === null)) return "live";
  if (runs.length === 0) return "none";
  return finishedAt ? "completed" : "incomplete";
}

function getActualElapsedSeconds(runs: ServiceRun[], finishedAt: string | null, state: ReportState, displayNow: number) {
  if (state !== "completed" && state !== "live") return null;
  const validStarts = runs.map((run) => new Date(run.started_at).getTime()).filter(Number.isFinite);
  if (!validStarts.length) return null;
  const startedAt = Math.min(...validStarts);
  const endedAt = state === "completed" && finishedAt ? new Date(finishedAt).getTime() : displayNow;
  return Number.isFinite(endedAt) && endedAt >= startedAt ? Math.floor((endedAt - startedAt) / 1_000) : null;
}

function groupRunsByService(runs: ServiceRun[]) { const grouped = new Map<number, ServiceRun[]>(); for (const run of runs) grouped.set(run.service_id, [...(grouped.get(run.service_id) ?? []), run]); return grouped; }
function formatRunSummary({ completedRunCount, runCount }: Pick<HistoricalReport, "completedRunCount" | "runCount">) { return `${runCount} ${runCount === 1 ? "ejecución" : "ejecuciones"} · ${completedRunCount} ${completedRunCount === 1 ? "completada" : "completadas"}`; }
function formatServiceDate(value: string | null) { if (!value) return "Sin fecha"; const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "short", year: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
function formatPlannedServiceTime(value: string) { const match = value.match(/^(\d{2}):(\d{2})/); if (!match) return "—"; return new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, Number(match[1]), Number(match[2]))); }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
