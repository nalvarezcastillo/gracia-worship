import type { ServiceStatus } from "@/lib/database.types";

export type HistoricalTrendRun = {
  ended_at: string | null;
  planned_duration_seconds: number | null;
  service_id: number;
  service_item_id: string;
  song_id: string | null;
  started_at: string;
};

export type HistoricalTrendService = {
  id: number;
  service_date: string | null;
  service_name: string;
  status: ServiceStatus;
};

export type ServiceDurationTrend = {
  actualSeconds: number;
  id: number;
  plannedSeconds: number | null;
  serviceDate: string | null;
  serviceName: string;
  varianceSeconds: number | null;
};

export type OvertimeContributor = {
  averageDeviationSeconds: number;
  label: string;
  occurrenceCount: number;
  totalPositiveOvertimeSeconds: number;
};

export type HistoricalTrends = {
  averageActualSeconds: number;
  averageVarianceSeconds: number | null;
  contributors: OvertimeContributor[];
  durationTrends: ServiceDurationTrend[];
  onTimeCount: number;
  plannedServiceCount: number;
};

const ON_TIME_TOLERANCE_SECONDS = 5 * 60;
const MIN_CONTRIBUTOR_OCCURRENCES = 2;

export function buildHistoricalTrends({ finishedAtByService, itemTitles, runsByService, services }: {
  finishedAtByService: Map<number, string>;
  itemTitles: Map<string, string>;
  runsByService: Map<number, HistoricalTrendRun[]>;
  services: HistoricalTrendService[];
}): HistoricalTrends | null {
  const durationTrends = services.flatMap<ServiceDurationTrend>((service) => {
    if (service.status !== "completed" && service.status !== "archived") return [];
    const runs = runsByService.get(service.id) ?? [];
    const finishedAt = finishedAtByService.get(service.id);
    if (!finishedAt || runs.length === 0 || runs.some((run) => run.ended_at === null)) return [];
    const actualSeconds = getElapsedSeconds(runs, finishedAt);
    if (actualSeconds === null) return [];
    const plannedSeconds = runs.every((run) => isKnownDuration(run.planned_duration_seconds))
      ? runs.reduce((total, run) => total + (run.planned_duration_seconds ?? 0), 0)
      : null;
    return [{ actualSeconds, id: service.id, plannedSeconds, serviceDate: service.service_date, serviceName: service.service_name, varianceSeconds: plannedSeconds === null ? null : actualSeconds - plannedSeconds }];
  });

  if (durationTrends.length < 2) return null;
  const plannedTrends = durationTrends.filter((trend) => trend.varianceSeconds !== null);
  const averageActualSeconds = Math.round(durationTrends.reduce((total, trend) => total + trend.actualSeconds, 0) / durationTrends.length);
  const averageVarianceSeconds = plannedTrends.length
    ? Math.round(plannedTrends.reduce((total, trend) => total + (trend.varianceSeconds ?? 0), 0) / plannedTrends.length)
    : null;
  const onTimeCount = plannedTrends.filter((trend) => Math.abs(trend.varianceSeconds ?? 0) <= ON_TIME_TOLERANCE_SECONDS).length;

  return {
    averageActualSeconds,
    averageVarianceSeconds,
    contributors: buildContributors(durationTrends, runsByService, itemTitles),
    durationTrends,
    onTimeCount,
    plannedServiceCount: plannedTrends.length,
  };
}

function buildContributors(trends: ServiceDurationTrend[], runsByService: Map<number, HistoricalTrendRun[]>, itemTitles: Map<string, string>) {
  const totals = new Map<string, { deviation: number; occurrences: number; positiveOvertime: number }>();
  for (const trend of trends) {
    for (const run of runsByService.get(trend.id) ?? []) {
      if (!run.ended_at || !isKnownDuration(run.planned_duration_seconds)) continue;
      const actualSeconds = getRunSeconds(run.started_at, run.ended_at);
      if (actualSeconds === null) continue;
      const label = run.song_id ? "Canciones" : itemTitles.get(run.service_item_id)?.trim() || "Otros elementos";
      const deviation = actualSeconds - (run.planned_duration_seconds ?? 0);
      const current = totals.get(label) ?? { deviation: 0, occurrences: 0, positiveOvertime: 0 };
      current.deviation += deviation;
      current.occurrences += 1;
      current.positiveOvertime += Math.max(0, deviation);
      totals.set(label, current);
    }
  }

  return Array.from(totals, ([label, total]) => ({
    averageDeviationSeconds: Math.round(total.deviation / total.occurrences),
    label,
    occurrenceCount: total.occurrences,
    totalPositiveOvertimeSeconds: total.positiveOvertime,
  }))
    .filter((entry) => entry.occurrenceCount >= MIN_CONTRIBUTOR_OCCURRENCES && entry.totalPositiveOvertimeSeconds > 0)
    .sort((a, b) => b.totalPositiveOvertimeSeconds - a.totalPositiveOvertimeSeconds || b.averageDeviationSeconds - a.averageDeviationSeconds)
    .slice(0, 5);
}

function getElapsedSeconds(runs: HistoricalTrendRun[], finishedAt: string) {
  const starts = runs.map((run) => new Date(run.started_at).getTime()).filter(Number.isFinite);
  const end = new Date(finishedAt).getTime();
  if (!starts.length || !Number.isFinite(end)) return null;
  const start = Math.min(...starts);
  return end >= start ? Math.floor((end - start) / 1_000) : null;
}

function getRunSeconds(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? Math.floor((end - start) / 1_000) : null;
}

function isKnownDuration(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}
