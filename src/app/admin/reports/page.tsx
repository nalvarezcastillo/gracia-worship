import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppEmptyState } from "@/components/app-empty-state";
import { AppPage } from "@/components/app-page";
import { AppStatusBadge } from "@/components/app-status-badge";
import { hasAuthenticatedUser } from "@/lib/auth";
import { formatDuration, getActualRunSeconds } from "@/lib/duration";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reportes de servicios | Gracia Worship" };
export const dynamic = "force-dynamic";

type ServiceRun = { ended_at: string | null; service_id: number; started_at: string };
type ServiceState = { finished_at: string | null; service_id: number };
type ServiceRecord = { id: number; service_date: string | null; service_name: string; status: "active" | "archived" };

export default async function ServiceReportsPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/reports");
  const supabase = await createSupabaseServerClient();
  const { data: runData } = await supabase
    .from("service_item_runs")
    .select("service_id, started_at, ended_at")
    .order("started_at", { ascending: false });
  const runs = (runData ?? []) as ServiceRun[];
  const serviceIds = Array.from(new Set(runs.map((run) => run.service_id)));

  const [{ data: serviceData }, { data: stateData }] = serviceIds.length
    ? await Promise.all([
        supabase.from("active_setlist").select("id, service_name, service_date, status").in("id", serviceIds),
        supabase.from("live_service_state").select("service_id, finished_at").in("service_id", serviceIds),
      ])
    : [{ data: [] }, { data: [] }];
  const states = new Map(((stateData ?? []) as ServiceState[]).map((state) => [state.service_id, state]));
  const now = Date.now();
  const reports = ((serviceData ?? []) as ServiceRecord[]).map((service) => {
    const serviceRuns = runs.filter((run) => run.service_id === service.id);
    const state = states.get(service.id);
    const hasOpenRun = serviceRuns.some((run) => run.ended_at === null);
    const isLive = service.status === "active" && (hasOpenRun || Boolean(state && !state.finished_at));
    const latestTimestamp = serviceRuns.reduce((latest, run) => Math.max(latest, new Date(run.ended_at ?? run.started_at).getTime()), 0);
    const finalTimestamp = state?.finished_at ?? serviceRuns.find((run) => run.ended_at)?.ended_at ?? null;
    return {
      durationSeconds: serviceRuns.reduce((total, run) => total + getActualRunSeconds(run, now), 0),
      finalTimestamp,
      isLive,
      latestTimestamp,
      runCount: serviceRuns.length,
      service,
    };
  }).sort((first, second) => second.latestTimestamp - first.latestTimestamp);

  return (
    <AppPage
      breadcrumb={<><Link href="/admin" className="transition-colors duration-200 hover:text-emerald-300">Administración</Link><span aria-hidden="true"> &gt; </span><span className="text-zinc-300">Reportes</span></>}
      description="Consulta el historial real registrado durante los servicios En Vivo."
      maxWidth="max-w-5xl"
      title="Reportes de servicios"
    >
      {!reports.length ? (
        <AppEmptyState className="mt-6 border-y border-white/[0.07] py-12"><p>Aún no hay reportes de servicios.</p><p className="mt-2">Los reportes aparecerán aquí después de usar En Vivo.</p></AppEmptyState>
      ) : (
        <div className="mt-6 grid gap-4 sm:mt-8 lg:grid-cols-2">
          {reports.map(({ durationSeconds, finalTimestamp, isLive, runCount, service }) => (
            <article key={service.id} className="overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/60 shadow-xl shadow-black/10">
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-white sm:text-xl">{localizeDefaultServiceName(service.service_name)}</h2>
                    <p className="mt-1 text-sm text-zinc-400">{formatServiceDate(service.service_date)}</p>
                  </div>
                  <AppStatusBadge variant={isLive ? "success" : "neutral"}>{isLive ? "En vivo" : "Finalizado"}</AppStatusBadge>
                </div>

                <p className="mt-5 text-sm text-zinc-400 sm:hidden">{formatDuration(durationSeconds)} · {runCount} {runCount === 1 ? "ejecución" : "ejecuciones"}</p>
                <dl className="mt-5 hidden grid-cols-3 gap-4 border-y border-white/[0.07] py-4 sm:grid">
                  <ReportMetric label="Duración real" value={formatDuration(durationSeconds)} />
                  <ReportMetric label="Ejecuciones" value={String(runCount)} />
                  <ReportMetric label="Finalizado" value={isLive ? "—" : formatServiceTime(finalTimestamp)} />
                </dl>
              </div>
              <Link href={`/service/${service.id}/report`} className="flex min-h-12 items-center justify-between border-t border-white/[0.07] px-5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/[0.045] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:px-6">Ver reporte <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
      )}
    </AppPage>
  );
}

function ReportMetric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">{label}</dt><dd className="mt-2 truncate text-base font-semibold tabular-nums text-zinc-200">{value}</dd></div>;
}

function formatServiceDate(value: string | null) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatServiceTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
