"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDuration, getActualRunSeconds } from "@/lib/duration";

export type ServiceRunReportRow = {
  ended_at: string | null;
  id: string;
  planned_duration_seconds: number | null;
  songTitle: string | null;
  started_at: string;
  title: string;
};

export function ServiceRunReport({ date, rows, serviceName }: { date: string | null; rows: ServiceRunReportRow[]; serviceName: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!rows.some((row) => row.ended_at === null)) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [rows]);

  const reportRows = useMemo(() => addRepetitionLabels(rows), [rows]);
  const actualTotal = reportRows.reduce((total, row) => total + getActualRunSeconds(row, now), 0);
  const plannedTotal = reportRows.reduce((total, row) => total + (row.planned_duration_seconds ?? 0), 0);
  const isInProgress = reportRows.some((row) => row.ended_at === null);
  const hasCompletePlan = reportRows.length > 0 && reportRows.every((row) => row.planned_duration_seconds !== null);

  return (
    <div className="mt-6">
      <header className="border-b border-white/[0.07] pb-6">
        <h2 className="text-xl font-semibold text-white sm:text-2xl">{serviceName}</h2>
        <p className="mt-1 text-sm text-zinc-400">{formatServiceDate(date)}</p>
      </header>

      {!reportRows.length ? (
        <p className="border-b border-white/[0.07] py-12 text-center text-sm text-zinc-500">No hay historial de ejecución para este servicio.</p>
      ) : (
        <>
          <section aria-label="Resumen del servicio" className="grid grid-cols-3 gap-3 border-b border-white/[0.07] py-5">
            <Summary label="Planeado" value={plannedTotal > 0 ? formatDuration(plannedTotal) : "—"} />
            <Summary label="Real" value={isInProgress ? "En curso" : formatDuration(actualTotal)} />
            <Summary label="Diferencia" value={hasCompletePlan ? formatDifference(actualTotal - plannedTotal) : "—"} tone={hasCompletePlan ? getDifferenceTone(actualTotal - plannedTotal) : undefined} />
          </section>

          <div className="divide-y divide-white/[0.07] border-b border-white/[0.07] md:hidden">
            {reportRows.map((row) => <MobileRunRow key={row.id} row={row} now={now} />)}
          </div>

          <div className="hidden overflow-x-auto border-b border-white/[0.07] md:block">
            <table className="w-full table-fixed text-left">
              <thead><tr className="border-b border-white/[0.07] text-xs uppercase tracking-[0.12em] text-zinc-500"><th className="w-[46%] px-2 py-3 font-semibold">Elemento</th><th className="px-2 py-3 font-semibold">Planeado</th><th className="px-2 py-3 font-semibold">Real</th><th className="px-2 py-3 text-right font-semibold">Dif.</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">{reportRows.map((row) => <DesktopRunRow key={row.id} row={row} now={now} />)}</tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

type DisplayRow = ServiceRunReportRow & { displayTitle: string };

function MobileRunRow({ now, row }: { now: number; row: DisplayRow }) {
  const actual = getActualRunSeconds(row, now);
  const difference = row.planned_duration_seconds === null ? null : actual - row.planned_duration_seconds;
  return <article className="py-4"><h3 className="font-semibold text-white">{row.displayTitle}</h3><p className="mt-1 text-sm text-zinc-400">Planeado {row.planned_duration_seconds === null ? "—" : formatDuration(row.planned_duration_seconds)} · Real {formatDuration(actual)}</p><p className={`mt-1 text-sm font-semibold ${difference === null ? "text-zinc-600" : getDifferenceTone(difference)}`}>{row.ended_at === null ? "En curso" : difference === null ? "Sin duración planeada" : formatDifference(difference)}</p></article>;
}

function DesktopRunRow({ now, row }: { now: number; row: DisplayRow }) {
  const actual = getActualRunSeconds(row, now);
  const difference = row.planned_duration_seconds === null ? null : actual - row.planned_duration_seconds;
  return <tr><td className="px-2 py-4 font-semibold text-white">{row.displayTitle}</td><td className="px-2 py-4 tabular-nums text-zinc-400">{row.planned_duration_seconds === null ? "—" : formatDuration(row.planned_duration_seconds)}</td><td className="px-2 py-4 tabular-nums text-zinc-300">{formatDuration(actual)}{row.ended_at === null ? <span className="ml-2 text-xs text-emerald-400">En curso</span> : null}</td><td className={`px-2 py-4 text-right font-semibold tabular-nums ${difference === null ? "text-zinc-600" : getDifferenceTone(difference)}`}>{difference === null ? "—" : formatDifference(difference)}</td></tr>;
}

function Summary({ label, tone = "text-white", value }: { label: string; tone?: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</p><p className={`mt-2 truncate text-base font-semibold tabular-nums sm:text-xl ${tone}`}>{value}</p></div>;
}

function addRepetitionLabels(rows: ServiceRunReportRow[]) {
  const counts = new Map<string, number>();
  return rows.map((row) => {
    const key = `${row.title}\u0000${row.songTitle ?? ""}`;
    const count = (counts.get(key) ?? 0) + 1;
    counts.set(key, count);
    const title = row.songTitle ?? row.title;
    return { ...row, displayTitle: count > 1 ? `${title} · Repetición ${count}` : title };
  });
}

function formatDifference(seconds: number) {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "";
  return `${sign}${formatDuration(Math.abs(seconds))}`;
}

function getDifferenceTone(seconds: number) {
  return seconds > 0 ? "text-amber-300" : seconds < 0 ? "text-emerald-400" : "text-zinc-300";
}

function formatServiceDate(value: string | null) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}
