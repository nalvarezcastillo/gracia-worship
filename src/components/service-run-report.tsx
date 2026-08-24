"use client";

import { useEffect, useMemo, useState } from "react";
import type { ServiceStatus } from "@/lib/database.types";
import { formatDuration, getActualRunSeconds } from "@/lib/duration";

export type ServiceReportRun = {
  created_at: string;
  ended_at: string | null;
  id: string;
  occurrence_index: number | null;
  planned_duration_seconds: number | null;
  service_item_id: string;
  song_id: string | null;
  started_at: string;
};

export type ServiceRunReportRow = {
  effectiveKey: string | null;
  id: string;
  itemType: string;
  occurrenceIndex: number;
  plannedDurationSeconds: number | null;
  plannedStart: string;
  position: number;
  runs: ServiceReportRun[];
  title: string;
};

type ReportState = "completed" | "live" | "incomplete" | "none";
type DisplayRow = ServiceRunReportRow & { primaryRun: ServiceReportRun | null; sortedRuns: ServiceReportRun[] };

export function ServiceRunReport({ date, finishedAt, lifecycleStatus, plannedStart, rows, serviceName }: { date: string | null; finishedAt: string | null; lifecycleStatus: ServiceStatus; plannedStart: string; rows: ServiceRunReportRow[]; serviceName: string }) {
  const allRuns = useMemo(() => rows.flatMap((row) => row.runs), [rows]);
  const hasOpenRun = allRuns.some((run) => run.ended_at === null);
  const reportState: ReportState = hasOpenRun ? "live" : allRuns.length === 0 ? "none" : finishedAt ? "completed" : "incomplete";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (reportState !== "live") return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [reportState]);

  const displayRows = useMemo(() => rows.map<DisplayRow>((row) => {
    const sortedRuns = [...row.runs].sort((first, second) => new Date(first.started_at).getTime() - new Date(second.started_at).getTime() || first.created_at.localeCompare(second.created_at));
    const primaryRun = [...sortedRuns].reverse().find((run) => run.ended_at === null) ?? sortedRuns.at(-1) ?? null;
    return { ...row, primaryRun, sortedRuns };
  }), [rows]);
  const validStarts = allRuns.map((run) => new Date(run.started_at).getTime()).filter(Number.isFinite);
  const actualStartTimestamp = validStarts.length ? Math.min(...validStarts) : null;
  const actualEndTimestamp = reportState === "completed" && finishedAt ? new Date(finishedAt).getTime() : null;
  const actualElapsedSeconds = actualStartTimestamp !== null
    ? reportState === "completed" && Number.isFinite(actualEndTimestamp) ? Math.max(0, Math.floor(((actualEndTimestamp as number) - actualStartTimestamp) / 1_000))
      : reportState === "live" ? Math.max(0, Math.floor((now - actualStartTimestamp) / 1_000)) : null
    : null;
  const completePlan = rows.length > 0 && rows.every((row) => row.plannedDurationSeconds !== null);
  const plannedTotal = completePlan ? rows.reduce((total, row) => total + (row.plannedDurationSeconds ?? 0), 0) : null;
  const finalDifference = reportState === "completed" && actualElapsedSeconds !== null && plannedTotal !== null ? actualElapsedSeconds - plannedTotal : null;
  const summedItemSeconds = displayRows.reduce((total, row) => total + (row.primaryRun?.ended_at ? getActualRunSeconds(row.primaryRun) : 0), 0);
  const gapSeconds = reportState === "completed" && actualElapsedSeconds !== null ? actualElapsedSeconds - summedItemSeconds : null;
  const contributors = displayRows.flatMap((row) => {
    const run = row.primaryRun;
    if (!run?.ended_at || row.plannedDurationSeconds === null) return [];
    const difference = getActualRunSeconds(run) - row.plannedDurationSeconds;
    return difference > 0 ? [{ difference, position: row.position, title: row.title }] : [];
  }).sort((first, second) => second.difference - first.difference);

  return (
    <div className="mt-6">
      <header className="border-b border-white/[0.07] pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-2xl font-semibold tracking-[-0.025em] text-white sm:text-3xl">{serviceName}</h2><p className="mt-1 text-sm text-zinc-400">{formatServiceDate(date)}</p></div>
          <ReportStateBadge state={reportState} />
        </div>
        {reportState === "none" ? <p className="mt-4 text-sm text-zinc-500">{lifecycleStatus === "archived" ? "Archivo heredado · Sin datos de tiempo" : "Sin datos de tiempo"}</p> : null}
      </header>

      <section aria-label="Resumen del servicio" className="grid grid-cols-2 gap-x-5 gap-y-6 border-b border-white/[0.07] py-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Summary label="Inicio planificado" value={formatPlannedServiceTime(plannedStart)} />
        <Summary label="Inicio real" value={actualStartTimestamp === null ? "—" : formatClock(actualStartTimestamp)} />
        <Summary label="Duración plan" value={plannedTotal === null ? "—" : formatDuration(plannedTotal)} />
        <Summary label={reportState === "live" ? "Transcurrido" : "Duración real"} value={actualElapsedSeconds === null ? "—" : formatDuration(actualElapsedSeconds)} note={reportState === "live" ? "En curso" : undefined} />
        <Summary label="Final real" value={actualEndTimestamp === null || !Number.isFinite(actualEndTimestamp) ? "—" : formatClock(actualEndTimestamp)} />
        <Summary label="Diferencia final" value={finalDifference === null ? "—" : formatDifference(finalDifference)} tone={finalDifference === null ? undefined : getDifferenceTone(finalDifference)} />
        <Summary label="Tiempo entre elementos" value={gapSeconds === null ? "—" : formatDifference(gapSeconds)} note="Diagnóstico" />
      </section>

      <section className="pt-7" aria-labelledby="run-of-show-title">
        <div className="flex items-end justify-between gap-4"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Cronología</p><h3 id="run-of-show-title" className="mt-1 text-xl font-semibold text-white">Orden del servicio</h3></div><p className="text-sm tabular-nums text-zinc-500">{rows.length} {rows.length === 1 ? "elemento" : "elementos"}</p></div>
        {!rows.length ? <p className="mt-5 border-y border-white/[0.07] py-12 text-center text-sm text-zinc-500">Este servicio no tiene elementos operacionales.</p> : <>
          <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07] md:hidden">{displayRows.map((row) => <MobileOccurrence key={row.id} date={date} now={now} reportState={reportState} row={row} />)}</div>
          <div className="mt-5 hidden border-y border-white/[0.07] md:block"><table className="w-full table-fixed text-left"><thead><tr className="border-b border-white/[0.07] text-[0.6875rem] uppercase tracking-[0.12em] text-zinc-500"><th className="w-[32%] px-2 py-3 font-semibold">Elemento</th><th className="w-[17%] px-2 py-3 font-semibold">Inicio plan</th><th className="w-[20%] px-2 py-3 font-semibold">Inicio real</th><th className="px-2 py-3 font-semibold">Plan</th><th className="px-2 py-3 font-semibold">Real</th><th className="px-2 py-3 text-right font-semibold">Dif.</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{displayRows.map((row) => <DesktopOccurrence key={row.id} date={date} now={now} reportState={reportState} row={row} />)}</tbody></table></div>
        </>}
      </section>

      {contributors.length ? <section className="mt-8 border-t border-white/[0.07] pt-6" aria-labelledby="contributors-title"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Revisión operacional</p><h3 id="contributors-title" className="mt-1 text-lg font-semibold text-white">Mayores desviaciones</h3><ol className="mt-4 max-w-xl divide-y divide-white/[0.06] border-y border-white/[0.07]">{contributors.map((entry) => <li key={`${entry.position}:${entry.title}`} className="flex items-center justify-between gap-4 py-3 text-sm"><span className="min-w-0 truncate text-zinc-300"><span className="mr-3 tabular-nums text-zinc-600">{String(entry.position).padStart(2, "0")}</span>{entry.title}</span><span className="shrink-0 font-semibold tabular-nums text-amber-300">{formatDifference(entry.difference)}</span></li>)}</ol></section> : null}
    </div>
  );
}

function DesktopOccurrence({ date, now, reportState, row }: OccurrenceProps) {
  const metrics = getOccurrenceMetrics(row, date, now, reportState);
  return <tr className="align-top"><td className="px-2 py-4"><div className="flex gap-3"><span className="pt-0.5 text-xs tabular-nums text-zinc-600">{String(row.position).padStart(2, "0")}</span><div className="min-w-0"><p className="break-words font-semibold text-white">{row.title}{row.effectiveKey ? <span className="ml-2 text-emerald-300">{row.effectiveKey}</span> : null}</p><p className="mt-1 text-xs text-zinc-500">{row.itemType} · {metrics.stateLabel}</p><RunAttempts row={row} /></div></div></td><td className="px-2 py-4 tabular-nums text-zinc-400">{row.plannedStart}</td><td className="px-2 py-4"><p className="tabular-nums text-zinc-300">{metrics.actualStart}</p>{metrics.startDrift !== null ? <p className={`mt-1 text-xs tabular-nums ${getDifferenceTone(metrics.startDrift)}`}>{formatDrift(metrics.startDrift)}</p> : null}</td><td className="px-2 py-4 tabular-nums text-zinc-400">{formatOptionalDuration(row.plannedDurationSeconds)}</td><td className="px-2 py-4 tabular-nums text-zinc-300">{metrics.actualDuration}{metrics.isRunning ? <span className="mt-1 block text-xs text-emerald-400">En curso</span> : null}</td><td className={`px-2 py-4 text-right font-semibold tabular-nums ${metrics.difference === null ? "text-zinc-600" : getDifferenceTone(metrics.difference)}`}>{metrics.difference === null ? "—" : formatDifference(metrics.difference)}</td></tr>;
}

function MobileOccurrence({ date, now, reportState, row }: OccurrenceProps) {
  const metrics = getOccurrenceMetrics(row, date, now, reportState);
  return <article className="py-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs tabular-nums text-zinc-600">{String(row.position).padStart(2, "0")}</p><h3 className="mt-1 break-words text-lg font-semibold text-white">{row.title}</h3><p className="mt-1 text-xs text-zinc-500">{row.itemType} · {metrics.stateLabel}</p></div>{row.effectiveKey ? <span className="grid min-w-9 shrink-0 place-items-center rounded-full border border-emerald-400/30 px-2 py-1 text-sm font-bold text-emerald-300">{row.effectiveKey}</span> : null}</div><div className="mt-5 grid grid-cols-2 gap-5"><MetricGroup label="Inicio" rows={[["Plan", row.plannedStart], ["Real", metrics.actualStart], [metrics.startDrift !== null && metrics.startDrift < 0 ? "Adelanto" : "Atraso", metrics.startDrift === null ? "—" : formatDifference(metrics.startDrift)]]} /><MetricGroup label="Duración" rows={[["Plan", formatOptionalDuration(row.plannedDurationSeconds)], ["Real", metrics.actualDuration], ["Dif.", metrics.difference === null ? "—" : formatDifference(metrics.difference)]]} /></div><RunAttempts row={row} /></article>;
}

type OccurrenceProps = { date: string | null; now: number; reportState: ReportState; row: DisplayRow };

function getOccurrenceMetrics(row: DisplayRow, date: string | null, now: number, reportState: ReportState) {
  const run = row.primaryRun;
  const isRunning = Boolean(run && !run.ended_at);
  const actualSeconds = run ? getActualRunSeconds(run, now) : null;
  const completedSeconds = run?.ended_at ? actualSeconds : null;
  const difference = completedSeconds !== null && row.plannedDurationSeconds !== null ? completedSeconds - row.plannedDurationSeconds : null;
  const plannedTimestamp = parsePlannedTimestamp(date, row.plannedStart);
  const actualStartTimestamp = run ? new Date(run.started_at).getTime() : null;
  const startDrift = plannedTimestamp !== null && actualStartTimestamp !== null && Number.isFinite(actualStartTimestamp) ? Math.round((actualStartTimestamp - plannedTimestamp) / 1_000) : null;
  return {
    actualDuration: actualSeconds === null ? "—" : formatDuration(actualSeconds),
    actualStart: run ? formatClock(run.started_at) : "—",
    difference,
    isRunning,
    startDrift,
    stateLabel: isRunning ? "En curso" : run?.ended_at ? "Completado" : reportState === "live" ? "Pendiente" : "No registrado",
  };
}

function RunAttempts({ row }: { row: DisplayRow }) {
  if (row.sortedRuns.length <= 1) return null;
  return <p className="mt-2 text-xs text-zinc-600">{row.sortedRuns.length} ejecuciones registradas · última {formatClock(row.sortedRuns.at(-1)?.started_at ?? "")}</p>;
}

function MetricGroup({ label, rows }: { label: string; rows: [string, string][] }) {
  return <section><p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-zinc-600">{label}</p><dl className="mt-2 space-y-1.5">{rows.map(([name, value]) => <div key={name} className="flex items-baseline justify-between gap-2"><dt className="text-xs text-zinc-500">{name}</dt><dd className="text-sm font-medium tabular-nums text-zinc-300">{value}</dd></div>)}</dl></section>;
}

function Summary({ label, note, tone = "text-white", value }: { label: string; note?: string; tone?: string; value: string }) {
  return <div className="min-w-0"><p className="text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className={`mt-2 text-lg font-semibold tabular-nums sm:text-xl ${tone}`}>{value}</p>{note ? <p className="mt-1 text-xs text-zinc-600">{note}</p> : null}</div>;
}

function ReportStateBadge({ state }: { state: ReportState }) {
  const labels: Record<ReportState, string> = { completed: "Completado", incomplete: "Tiempo incompleto", live: "En Vivo", none: "Sin datos de tiempo" };
  return <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${state === "live" ? "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-300" : state === "completed" ? "border-white/10 text-zinc-300" : "border-amber-300/20 text-amber-200"}`}>{labels[state]}</span>;
}

function parsePlannedTimestamp(date: string | null, plannedStart: string) {
  if (!date || plannedStart === "—") return null;
  const time = plannedStart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(AM|PM)$/);
  if (!time) return null;
  const [year, month, day] = date.split("-").map(Number);
  const hour = Number(time[1]) % 12 + (time[4] === "PM" ? 12 : 0);
  const value = new Date(year, month - 1, day, hour, Number(time[2]), Number(time[3] ?? 0)).getTime();
  return Number.isFinite(value) ? value : null;
}

function formatOptionalDuration(seconds: number | null) { return seconds === null ? "—" : formatDuration(seconds); }
function formatDifference(seconds: number) { return `${seconds > 0 ? "+" : seconds < 0 ? "−" : ""}${formatDuration(Math.abs(seconds))}`; }
function formatDrift(seconds: number) { return `${formatDifference(seconds)} ${seconds > 0 ? "tarde" : seconds < 0 ? "antes" : "en plan"}`; }
function getDifferenceTone(seconds: number) { return seconds > 0 ? "text-amber-300" : seconds < 0 ? "text-emerald-400" : "text-zinc-300"; }
function formatClock(value: string | number) { const date = typeof value === "number" ? new Date(value) : new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date) : "—"; }
function formatPlannedServiceTime(value: string) { const match = value.match(/^(\d{2}):(\d{2})/); if (!match) return "—"; const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2])); return new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit" }).format(date); }
function formatServiceDate(value: string | null) { if (!value) return "Sin fecha"; const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
