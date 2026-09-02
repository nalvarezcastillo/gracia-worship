import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppEmptyState } from "@/components/app-empty-state";
import { AppPage } from "@/components/app-page";
import { AppStatusBadge } from "@/components/app-status-badge";
import { DeleteHistoricalServiceAction } from "@/components/delete-historical-service-action";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceStatus } from "@/lib/database.types";
import { formatDuration } from "@/lib/duration";
import { buildHistoricalTrends, type HistoricalTrendRun, type HistoricalTrends } from "@/lib/historical-service-trends";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reportes de servicios | Gracia Worship" };
export const dynamic = "force-dynamic";

const REPORT_LIMIT = 100;
const TREND_LIMIT = 10;
type ReportState = "completed" | "live" | "incomplete" | "none";
type ServiceRun = HistoricalTrendRun;
type ServiceState = { finished_at: string | null; service_id: number };
type ServiceItemLabel = { id: string; title: string };
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
        supabase.from("service_item_runs").select("service_id, service_item_id, song_id, started_at, ended_at, planned_duration_seconds").in("service_id", serviceIds),
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
  const trendServices = reports
    .filter((report) => (report.service.status === "completed" || report.service.status === "archived") && report.state === "completed")
    .slice(0, TREND_LIMIT)
    .map((report) => report.service);
  const trendServiceIds = trendServices.map((service) => service.id);
  const { data: itemData, error: itemError } = trendServiceIds.length
    ? await supabase.from("service_items").select("id, title").in("service_id", trendServiceIds)
    : { data: [], error: null };
  if (itemError) throw new Error(itemError.message);
  const trends = buildHistoricalTrends({
    finishedAtByService: new Map(((stateData ?? []) as ServiceState[]).flatMap((state) => state.finished_at ? [[state.service_id, state.finished_at]] : [])),
    itemTitles: new Map(((itemData ?? []) as ServiceItemLabel[]).map((item) => [item.id, item.title])),
    runsByService,
    services: trendServices,
  });

  return (
    <AppPage breadcrumb={<><Link href="/admin" className="transition-colors duration-200 hover:text-emerald-300">Administración</Link><span aria-hidden="true"> &gt; </span><span className="text-zinc-300">Reportes</span></>} eyebrow="Analítica" description="Resumen de tiempos registrados y acceso al detalle de cada servicio." maxWidth="max-w-6xl" title="Historial de servicios">
      <HistoricalTrendsSection trends={trends} />
      <div className="mt-10 flex items-end justify-between gap-4 border-b border-white/[0.07] pb-3"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Reportes</p><h2 className="mt-1 text-xl font-bold tracking-tight text-white">Historial de servicios</h2></div><p className="text-xs text-zinc-600">Hasta {REPORT_LIMIT} servicios</p></div>
      {!reports.length ? (
        <AppEmptyState className="mt-6 border-y border-white/[0.07] py-12"><p>Aún no hay servicios con historial disponible.</p></AppEmptyState>
      ) : <>
        <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07] md:hidden">{reports.map((report) => <MobileReportCard key={report.service.id} report={report} />)}</div>
        <div className="mt-8 hidden border-y border-white/[0.07] md:block"><table className="w-full table-fixed text-left"><thead><tr className="border-b border-white/[0.07] text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-600"><th className="w-[15%] px-3 py-3">Fecha</th><th className="w-[29%] px-3 py-3">Servicio</th><th className="w-[12%] px-3 py-3">Hora</th><th className="w-[17%] px-3 py-3">Estado</th><th className="w-[13%] px-3 py-3">Actual</th><th className="w-[14%] px-3 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{reports.map((report) => <DesktopReportRow key={report.service.id} report={report} />)}</tbody></table></div>
        {services.length === REPORT_LIMIT ? <p className="mt-4 text-xs text-zinc-600">Mostrando los {REPORT_LIMIT} servicios históricos más recientes.</p> : null}
      </>}
    </AppPage>
  );
}

function HistoricalTrendsSection({ trends }: { trends: HistoricalTrends | null }) {
  if (!trends) return <section className="mt-8 border-y border-white/[0.07] py-8" aria-labelledby="historical-summary-title"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Resumen histórico</p><h2 id="historical-summary-title" className="mt-2 text-xl font-bold text-white">Tendencias recientes</h2><p className="mt-3 text-sm leading-6 text-zinc-400">Aún no hay suficientes servicios completados para mostrar tendencias.</p></section>;
  const varianceCount = trends.plannedServiceCount;
  const onTimePercent = varianceCount ? Math.round((trends.onTimeCount / varianceCount) * 100) : null;
  const maxDuration = Math.max(...trends.durationTrends.flatMap((trend) => [trend.actualSeconds, trend.plannedSeconds ?? 0]), 1);
  return <section className="mt-8" aria-labelledby="historical-summary-title"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Resumen histórico</p><h2 id="historical-summary-title" className="mt-1 text-xl font-bold tracking-tight text-white">Últimos {trends.durationTrends.length} servicios completados</h2><p className="mt-1 text-xs text-zinc-500">Solo servicios completados o archivados con tiempo En Vivo definitivo.</p></div><dl className="mt-5 grid gap-3 sm:grid-cols-3"><TrendMetric label="Promedio vs plan" value={trends.averageVarianceSeconds === null ? "—" : formatSignedDuration(trends.averageVarianceSeconds)} note={varianceCount ? `${varianceCount} con plan completo` : "Sin planes completos"} /><TrendMetric label="Servicios dentro del plan" value={onTimePercent === null ? "—" : `${onTimePercent}%`} note={varianceCount ? `${trends.onTimeCount} de ${varianceCount} · tolerancia ±5 min` : "Requiere plan completo"} /><TrendMetric label="Duración real promedio" value={formatDuration(trends.averageActualSeconds)} note={`${trends.durationTrends.length} servicios con tiempo definitivo`} /></dl><div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.8fr)]"><section aria-labelledby="duration-trend-title"><h3 id="duration-trend-title" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Plan vs duración real</h3><div className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.07]">{trends.durationTrends.map((trend) => <div key={trend.id} className="py-4"><div className="flex items-baseline justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-200">{localizeDefaultServiceName(trend.serviceName)}</p><p className="mt-0.5 text-xs text-zinc-600">{formatServiceDate(trend.serviceDate)}</p></div><p className="shrink-0 text-xs font-semibold tabular-nums text-zinc-400">{trend.varianceSeconds === null ? "Plan incompleto" : formatSignedDuration(trend.varianceSeconds)}</p></div><div className="mt-3 grid gap-2"><DurationBar label="Plan" seconds={trend.plannedSeconds} maxSeconds={maxDuration} tone="planned" /><DurationBar label="Real" seconds={trend.actualSeconds} maxSeconds={maxDuration} tone="actual" /></div></div>)}</div></section><section aria-labelledby="overtime-impact-title"><h3 id="overtime-impact-title" className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">Mayor impacto en tiempo</h3>{trends.contributors.length ? <ol className="mt-4 divide-y divide-white/[0.06] border-y border-white/[0.07]">{trends.contributors.map((entry, index) => <li key={entry.label} className="flex items-center gap-3 py-4"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.05] text-xs font-bold text-zinc-500">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-zinc-200">{entry.label}</p><p className="mt-0.5 text-xs text-zinc-600">{entry.occurrenceCount} ocurrencias · {formatSignedDuration(entry.averageDeviationSeconds)} promedio</p></div><p className="shrink-0 text-xs font-semibold tabular-nums text-amber-300">+{formatDuration(entry.totalPositiveOvertimeSeconds)}</p></li>)}</ol> : <p className="mt-4 border-y border-white/[0.07] py-6 text-sm leading-6 text-zinc-500">Aún no hay categorías con al menos dos ocurrencias válidas y tiempo excedido.</p>}<p className="mt-3 text-xs leading-5 text-zinc-600">Ordenado por tiempo positivo acumulado. No atribuye causa ni responsabilidad.</p></section></div></section>;
}

function TrendMetric({ label, note, value }: { label: string; note: string; value: string }) { return <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><dt className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</dt><dd className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-white">{value}</dd><p className="mt-2 text-xs leading-5 text-zinc-600">{note}</p></div>; }
function DurationBar({ label, maxSeconds, seconds, tone }: { label: string; maxSeconds: number; seconds: number | null; tone: "actual" | "planned" }) { const width = seconds === null ? 0 : Math.max(2, (seconds / maxSeconds) * 100); return <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_3.75rem] items-center gap-2"><span className="text-[0.6875rem] font-semibold text-zinc-600">{label}</span><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className={`h-full rounded-full ${tone === "actual" ? "bg-emerald-400" : "bg-zinc-600"}`} style={{ width: `${width}%` }} /></div><span className="text-right text-[0.6875rem] tabular-nums text-zinc-500">{seconds === null ? "—" : formatDuration(seconds)}</span></div>; }

function DesktopReportRow({ report }: { report: HistoricalReport }) {
  const { actualElapsedSeconds, runCount, service, state } = report;
  return <tr className="align-middle transition-colors hover:bg-white/[0.025]"><td className="px-3 py-4 text-sm text-zinc-400">{formatServiceDate(service.service_date)}</td><td className="px-3 py-4"><p className="break-words font-semibold text-white">{localizeDefaultServiceName(service.service_name)}</p>{state === "none" && service.status === "archived" ? <p className="mt-1 text-xs text-zinc-500">Archivo heredado · Sin datos de tiempo</p> : runCount > 0 ? <p className="mt-1 text-xs text-zinc-600">{formatRunSummary(report)}</p> : null}</td><td className="px-3 py-4 text-sm tabular-nums text-zinc-400">{formatPlannedServiceTime(service.service_time)}</td><td className="px-3 py-4"><ReportStateBadge state={state} /></td><td className="px-3 py-4 text-sm font-medium tabular-nums text-zinc-300">{actualElapsedSeconds === null ? "—" : formatDuration(actualElapsedSeconds)}</td><td className="px-3 py-4"><div className="flex items-center justify-end"><ReportLink serviceId={service.id} />{isHistoricallyDeletable(service.status) ? <DeleteHistoricalServiceAction serviceDate={formatServiceDate(service.service_date)} serviceId={service.id} serviceName={localizeDefaultServiceName(service.service_name)} serviceTime={formatPlannedServiceTime(service.service_time)} /> : null}</div></td></tr>;
}

function MobileReportCard({ report }: { report: HistoricalReport }) {
  const { actualElapsedSeconds, service, state } = report;
  return <article className="py-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-zinc-500">{formatServiceDate(service.service_date)}</p><h2 className="mt-1.5 break-words text-lg font-semibold text-white">{localizeDefaultServiceName(service.service_name)}</h2><p className="mt-0.5 text-sm tabular-nums text-zinc-400">{formatPlannedServiceTime(service.service_time)}</p></div><ReportStateBadge state={state} /></div>{state === "none" && service.status === "archived" ? <p className="mt-2 text-sm text-zinc-500">Archivo heredado · Sin datos de tiempo</p> : report.runCount > 0 ? <p className="mt-2 text-xs text-zinc-600">{formatRunSummary(report)}</p> : null}<div className="mt-3 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-3"><dl><div><dt className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-zinc-600">{state === "live" ? "Transcurrido" : "Duración real"}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{actualElapsedSeconds === null ? "—" : formatDuration(actualElapsedSeconds)}</dd></div></dl><div className="flex items-center"><ReportLink serviceId={service.id} />{isHistoricallyDeletable(service.status) ? <DeleteHistoricalServiceAction serviceDate={formatServiceDate(service.service_date)} serviceId={service.id} serviceName={localizeDefaultServiceName(service.service_name)} serviceTime={formatPlannedServiceTime(service.service_time)} /> : null}</div></div></article>;
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
function formatSignedDuration(seconds: number) { return `${seconds >= 0 ? "+" : "−"}${formatDuration(Math.abs(seconds))}`; }
function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }
function isHistoricallyDeletable(status: ServiceStatus) { return status === "completed" || status === "archived"; }
