"use client";

import { ArrowLeft, ArrowRight, CircleCheck, FileText, Headphones, Music2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppConfirmDialog } from "@/components/app-confirm-dialog";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import type { ActiveSetlistRow } from "@/lib/database.types";
import { parseAssignmentText } from "@/lib/assignment-text";
import { formatDuration, getActualRunSeconds, getServiceItemDurationSeconds, getSongDurationSeconds } from "@/lib/duration";
import type { ServiceItem, WorshipSongEntry } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LiveService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export type LiveSong = {
  audio_url: string;
  bpm: number;
  duration: string;
  id: string;
  key: string;
  lyrics: string;
  sheet_url: string;
  song_keys: {
    audio_url: string | null;
    key_name: string;
    sheet_url: string | null;
    song_stems: { id: string }[];
  }[];
  time_signature: string | null;
  title: string;
};

type LiveEntry =
  | { id: string; item: ServiceItem; kind: "item"; title: string }
  | { entry: WorshipSongEntry; id: string; item: ServiceItem; kind: "song"; song: LiveSong; title: string };

type LiveServiceState = {
  current_item_id: string;
  current_song_id: string | null;
  finished_at: string | null;
  service_id: number;
  started_at: string;
  updated_at: string;
};

export type LiveRun = { ended_at: string | null; started_at: string };

type LiveModeProps = {
  canControl: boolean;
  initialRuns: LiveRun[];
  initialState: LiveServiceState | null;
  items: ServiceItem[];
  loadError?: string;
  service: LiveService | null;
  serviceId: number | null;
  songs: LiveSong[];
};

export function LiveMode({ canControl, initialRuns, initialState, items, loadError, service, serviceId, songs }: LiveModeProps) {
  const entries = useMemo(() => buildLiveEntries(items, songs), [items, songs]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const initialIndex = resolveStateIndex(entries, initialState);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [startedAt, setStartedAt] = useState<string | null>(() => initialState?.started_at ?? null);
  const [finishedAt, setFinishedAt] = useState(() => initialState?.finished_at ?? null);
  const [hasLiveState, setHasLiveState] = useState(Boolean(initialState));
  const [runs, setRuns] = useState(initialRuns);
  const [elapsedSeconds, setElapsedSeconds] = useState(() => getElapsedSeconds(initialState?.started_at));
  const [currentTime, setCurrentTime] = useState("");
  const [clockTimestamp, setClockTimestamp] = useState(() => Date.now());
  const [syncStatus, setSyncStatus] = useState<"connected" | "reconnecting">("reconnecting");
  const [controlError, setControlError] = useState("");
  const [isChanging, setIsChanging] = useState(false);
  const [isFinishOpen, setIsFinishOpen] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isReopenOpen, setIsReopenOpen] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState("");
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const currentEntry = entries[currentIndex];
  const nextEntry = entries[currentIndex + 1];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= entries.length - 1;
  const livePhase = !hasLiveState ? "notStarted" : finishedAt ? "finished" : "live";
  const schedule = livePhase === "live" ? getScheduleSummary(service, entries, currentIndex, elapsedSeconds, clockTimestamp) : null;

  const refreshRuns = useCallback(async () => {
    if (serviceId === null) return;
    const { data, error } = await supabase
      .from("service_item_runs")
      .select("started_at, ended_at")
      .eq("service_id", serviceId)
      .order("started_at");
    if (!error) setRuns((data ?? []) as LiveRun[]);
  }, [serviceId, supabase]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(formatDeviceTime(now));
      setClockTimestamp(now.getTime());
    };
    updateClock();
    const interval = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (livePhase !== "live" || !startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const updateElapsed = () => setElapsedSeconds(getElapsedSeconds(startedAt));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(interval);
  }, [livePhase, startedAt]);

  useEffect(() => {
    if (serviceId === null) return;

    async function refreshState() {
      const { data, error } = await supabase
        .from("live_service_state")
        .select("service_id, current_item_id, current_song_id, started_at, finished_at, updated_at")
        .eq("service_id", serviceId)
        .maybeSingle();
      if (!error && data) {
        const state = data as LiveServiceState;
        applyAuthoritativeState(state, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
        if (state.finished_at) void refreshRuns();
      }
    }

    const channel = supabase
      .channel(`live-service-${serviceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_service_state", filter: `service_id=eq.${serviceId}` },
        (payload) => {
          const state = payload.new as LiveServiceState;
          if (state?.service_id === serviceId) {
            applyAuthoritativeState(state, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
            if (state.finished_at) void refreshRuns();
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setSyncStatus("connected");
          void refreshState();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setSyncStatus("reconnecting");
        }
      });

    return () => { void supabase.removeChannel(channel); };
  }, [entries, refreshRuns, serviceId, supabase]);

  async function selectEntry(index: number) {
    if (!canControl || serviceId === null || isChanging) return;
    const boundedIndex = Math.max(0, Math.min(entries.length - 1, index));
    const target = entries[boundedIndex];
    if (!target) return;

    setIsChanging(true);
    setControlError("");
    const { data, error } = await supabase.rpc("set_live_service_item", {
      p_service_id: serviceId,
      p_item_id: target.item.id,
      p_song_id: target.kind === "song" ? target.song.id : null,
    });
    if (error) {
      setControlError("No se pudo actualizar En Vivo. Intenta nuevamente.");
      const { data: authoritativeState } = await supabase
        .from("live_service_state")
        .select("service_id, current_item_id, current_song_id, started_at, finished_at, updated_at")
        .eq("service_id", serviceId)
        .maybeSingle();
      if (authoritativeState) applyAuthoritativeState(authoritativeState as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
    } else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
    }
    setIsChanging(false);
  }

  async function finishService() {
    if (!canControl || serviceId === null || isFinishing) return;
    setIsFinishing(true);
    setControlError("");
    const { data, error } = await supabase.rpc("finish_live_service", { p_service_id: serviceId });
    if (error) {
      setControlError("No se pudo finalizar el servicio. Intenta nuevamente.");
    } else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setIsFinishOpen(false);
      await refreshRuns();
    }
    setIsFinishing(false);
  }

  async function reopenService() {
    if (!canControl || serviceId === null || isReopening) return;
    setIsReopening(true);
    setReopenError("");
    const { data, error } = await supabase.rpc("reopen_live_service", { p_service_id: serviceId });
    if (error) {
      setReopenError("No se pudo reabrir el servicio. Intenta nuevamente.");
    } else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setIsReopenOpen(false);
      await refreshRuns();
    }
    setIsReopening(false);
  }

  async function startService() {
    if (!canControl || serviceId === null || isStarting) return;
    setIsStarting(true);
    setStartError("");
    const { data, error } = await supabase.rpc("start_live_service", { p_service_id: serviceId });
    if (error) {
      setStartError("No se pudo iniciar el servicio. Intenta nuevamente.");
    } else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setIsStartOpen(false);
      await refreshRuns();
    }
    setIsStarting(false);
  }

  if (livePhase === "finished" && finishedAt) {
    const serviceName = service ? localizeDefaultServiceName(service.service_name) : "Servicio actual";
    return <><FinishedService canControl={canControl} finishedAt={finishedAt} onReopen={() => { setReopenError(""); setIsReopenOpen(true); }} runs={runs} serviceId={serviceId} serviceName={serviceName} syncStatus={syncStatus} />{isReopenOpen ? <AppConfirmDialog title="Reabrir servicio" titleId="reopen-service-title" descriptionId="reopen-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsReopenOpen(false)} disabled={isReopening}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void reopenService()} disabled={isReopening}>{isReopening ? "Reabriendo..." : "Reabrir servicio"}</PrimaryButton></AppActionBar>}><p id="reopen-service-description" className="mt-3 text-sm leading-6 text-zinc-400">¿Quieres volver a iniciar “{serviceName}”?</p><p className="mt-2 text-sm leading-6 text-zinc-500">El historial anterior se conservará y se iniciará una nueva ejecución desde el primer elemento.</p>{reopenError ? <p role="alert" className="mt-3 text-sm text-rose-300">{reopenError}</p> : null}</AppConfirmDialog> : null}</>;
  }

  if (livePhase === "notStarted") {
    const serviceName = service ? localizeDefaultServiceName(service.service_name) : "Servicio actual";
    const plannedSeconds = getCompletePlannedDuration(entries);
    return <><NotStartedService canControl={canControl} entryCount={entries.length} onStart={() => { setStartError(""); setIsStartOpen(true); }} plannedSeconds={plannedSeconds} service={service} serviceName={serviceName} syncStatus={syncStatus} />{isStartOpen ? <AppConfirmDialog title="Iniciar servicio" titleId="start-service-title" descriptionId="start-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsStartOpen(false)} disabled={isStarting}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void startService()} disabled={isStarting}>{isStarting ? "Iniciando..." : "Iniciar servicio"}</PrimaryButton></AppActionBar>}><p id="start-service-description" className="mt-3 text-sm leading-6 text-zinc-400">¿Comenzar “{serviceName}”?</p><p className="mt-2 text-sm leading-6 text-zinc-500">El timer y la sincronización En Vivo comenzarán para todos los dispositivos.</p>{startError ? <p role="alert" className="mt-3 text-sm text-rose-300">{startError}</p> : null}</AppConfirmDialog> : null}</>;
  }

  return (
    <div className="pb-24 lg:pb-8">
      <header className="border-b border-white/[0.07] pb-4 sm:pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">En Vivo</p>
        <div className="mt-3 flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-[-0.03em] text-white sm:text-3xl">
              {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {service?.service_date ? formatServiceDate(service.service_date) : "Fecha no configurada"}
            </p>
            {schedule ? (
              <p className="mt-1 text-xs text-zinc-500">
                Duración {formatPlannedTotal(schedule.totalSeconds)} · Final planeado {schedule.plannedEnd} · Final estimado {schedule.estimatedEnd}
                {schedule.varianceMinutes !== 0 ? <span className={schedule.varianceMinutes > 0 ? "text-amber-400/80" : "text-emerald-400/80"}> · {schedule.varianceMinutes > 0 ? "+" : ""}{schedule.varianceMinutes} min</span> : null}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-zinc-400">
              {currentEntry ? `${currentIndex + 1} de ${entries.length}` : `0 de ${entries.length}`}
            </p>
            <time className="mt-1 block text-lg font-semibold tabular-nums text-white" suppressHydrationWarning>
              {currentTime || "--:--"}
            </time>
            <p className={`mt-1 text-[0.6875rem] ${syncStatus === "connected" ? "text-zinc-600" : "text-amber-400/70"}`}>
              {syncStatus === "connected" ? "Sincronizado" : "Reconectando..."}
            </p>
          </div>
        </div>
      </header>

      {loadError ? (
        <p role="alert" className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-6 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentEntry ? (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-8">
          <div className="min-w-0">
            <CurrentEntryCard entry={currentEntry} elapsedSeconds={elapsedSeconds} />

            <section className="mt-4 border-y border-white/[0.07] px-1 py-4" aria-labelledby="next-entry-title">
              <p id="next-entry-title" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Siguiente</p>
              {nextEntry ? (
                <div className="mt-2">
                  <p className="text-lg font-semibold text-zinc-100">{nextEntry.title}</p>
                  <EntrySupportingText entry={nextEntry} compact />
                  <EntryDuration entry={nextEntry} />
                </div>
              ) : (
                <p className="mt-2 text-base font-semibold text-zinc-400">Fin del servicio</p>
              )}
            </section>

            {!(isLast && !canControl) ? <nav aria-label="Navegación de elementos del servicio" className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" disabled={!canControl || isChanging || isFirst} onClick={() => void selectEntry(currentIndex - 1)} className={secondaryButtonStyles}>
                <ArrowLeft aria-hidden="true" className="size-5" /> Anterior
              </button>
              {isLast && canControl ? (
                <button type="button" disabled={isChanging || isFinishing} onClick={() => setIsFinishOpen(true)} className={primaryButtonStyles}>
                  <CircleCheck aria-hidden="true" className="size-5" /> Finalizar servicio
                </button>
              ) : (
                <button type="button" disabled={!canControl || isChanging || isLast} onClick={() => void selectEntry(currentIndex + 1)} className={primaryButtonStyles}>
                  Siguiente <ArrowRight aria-hidden="true" className="size-5" />
                </button>
              )}
            </nav> : null}
            {!canControl ? <p className="mt-2 text-center text-xs text-zinc-600">Modo solo lectura</p> : null}
            {controlError ? <p role="alert" className="mt-2 text-center text-sm text-rose-300">{controlError}</p> : null}
          </div>

          <RunSheet canControl={canControl && !isChanging} entries={entries} currentIndex={currentIndex} onSelect={(index) => void selectEntry(index)} />
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">
          No hay elementos en el servicio actual.
        </div>
      )}
      {isFinishOpen ? <AppConfirmDialog title="Finalizar servicio" titleId="finish-service-title" descriptionId="finish-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsFinishOpen(false)} disabled={isFinishing}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void finishService()} disabled={isFinishing}>{isFinishing ? "Finalizando..." : "Finalizar servicio"}</PrimaryButton></AppActionBar>}><p id="finish-service-description" className="mt-3 text-sm leading-6 text-zinc-400">¿Finalizar “{service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}”?</p><p className="mt-2 text-sm leading-6 text-zinc-500">Esto cerrará En Vivo en todos los dispositivos y guardará el historial del servicio.</p>{controlError ? <p role="alert" className="mt-3 text-sm text-rose-300">{controlError}</p> : null}</AppConfirmDialog> : null}
    </div>
  );
}

function NotStartedService({ canControl, entryCount, onStart, plannedSeconds, service, serviceName, syncStatus }: { canControl: boolean; entryCount: number; onStart: () => void; plannedSeconds: number | null; service: LiveService | null; serviceName: string; syncStatus: "connected" | "reconnecting" }) {
  return <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center pb-20 sm:pb-8"><section className="w-full max-w-xl rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 text-center shadow-xl shadow-black/20 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">En Vivo</p><h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">{serviceName}</h1>{service ? <p className="mt-2 text-sm text-zinc-400">{[service.service_date ? formatServiceDate(service.service_date) : "", service.service_time].filter(Boolean).join(" · ")}</p> : null}{canControl ? <><dl className="mt-8 grid grid-cols-2 gap-4 border-y border-white/[0.07] py-5"><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Elementos</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{entryCount}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Duración planeada</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{plannedSeconds === null ? "—" : formatDuration(plannedSeconds)}</dd></div></dl><button type="button" onClick={onStart} disabled={entryCount === 0} className={`${primaryButtonStyles} mt-7 w-full`}>▶ Iniciar servicio</button><p className="mt-3 text-xs text-zinc-500">El servicio comenzará en el primer elemento del Run Sheet.</p></> : <p className="mt-8 text-base text-zinc-400">El servicio aún no ha comenzado.</p>}<p className={`mt-5 text-[0.6875rem] ${syncStatus === "connected" ? "text-zinc-600" : "text-amber-400/70"}`}>{syncStatus === "connected" ? "Sincronizado" : "Reconectando..."}</p></section></div>;
}

function FinishedService({ canControl, finishedAt, onReopen, runs, serviceId, serviceName, syncStatus }: { canControl: boolean; finishedAt: string; onReopen: () => void; runs: LiveRun[]; serviceId: number | null; serviceName: string; syncStatus: "connected" | "reconnecting" }) {
  const actualSeconds = runs.reduce((total, run) => total + getActualRunSeconds(run, finishedAt), 0);
  return <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center pb-20 sm:pb-8"><section className="w-full max-w-xl rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 text-center shadow-xl shadow-black/20 sm:p-10"><CircleCheck aria-hidden="true" className="mx-auto size-10 text-emerald-400" /><p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Servicio finalizado</p><h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">{serviceName}</h1><dl className="mt-8 grid grid-cols-2 gap-4 border-y border-white/[0.07] py-5"><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Finalizado a las</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{formatDeviceTime(new Date(finishedAt))}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Duración real</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{formatDuration(actualSeconds)}</dd></div></dl><p className="mt-5 text-sm text-zinc-400">{runs.length} {runs.length === 1 ? "ejecución registrada" : "ejecuciones registradas"}</p>{canControl && serviceId !== null ? <div className="mt-7 grid gap-3"><Link href={`/service/${serviceId}/report`} className={`${primaryButtonStyles} w-full`}>Ver reporte del servicio</Link><button type="button" onClick={onReopen} className={`${secondaryButtonStyles} w-full`}>Reabrir servicio</button></div> : null}<p className={`mt-4 text-[0.6875rem] ${syncStatus === "connected" ? "text-zinc-600" : "text-amber-400/70"}`}>{syncStatus === "connected" ? "Sincronizado" : "Reconectando..."}</p></section></div>;
}

function CurrentEntryCard({ elapsedSeconds, entry }: { elapsedSeconds: number; entry: LiveEntry }) {
  const plannedSeconds = getEntryPlannedSeconds(entry);
  const remainingSeconds = plannedSeconds === null ? null : plannedSeconds - elapsedSeconds;
  const progress = plannedSeconds ? Math.min(100, (elapsedSeconds / plannedSeconds) * 100) : 0;
  const timingColor = remainingSeconds !== null && remainingSeconds <= -300 ? "text-rose-300" : remainingSeconds !== null && remainingSeconds < 0 ? "text-amber-300" : "text-emerald-400";
  const progressColor = remainingSeconds !== null && remainingSeconds <= -300 ? "bg-rose-400" : remainingSeconds !== null && remainingSeconds < 0 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <article className="rounded-3xl border border-white/[0.08] bg-zinc-900 p-5 shadow-xl shadow-black/20 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Ahora</p>
      <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">{entry.title}</h2>
      <EntrySupportingText entry={entry} />
      {entry.kind === "song" ? <SongResourceLinks entry={entry} /> : null}
      <div className="mt-8 border-t border-white/[0.07] pt-5 sm:mt-10">
        <p className="whitespace-nowrap text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">{remainingSeconds === null ? formatDuration(elapsedSeconds) : formatLiveTimer(remainingSeconds)}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{plannedSeconds ? "Tiempo restante" : "Tiempo transcurrido"}</p>
        {plannedSeconds ? (
          <>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true"><div className={`h-full ${progressColor} transition-[width] duration-200`} style={{ width: `${progress}%` }} /></div>
            <p className={`mt-2 text-xs font-semibold ${timingColor}`}>{remainingSeconds !== null && remainingSeconds < 0 ? "OVER RUN" : "A tiempo"}</p>
          </>
        ) : null}
      </div>
    </article>
  );
}

function formatLiveTimer(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const absoluteSeconds = Math.abs(seconds);
  const formatted = formatDuration(absoluteSeconds);
  return `${sign}${absoluteSeconds < 3_600 ? formatted.replace(/^0/, "") : formatted}`;
}

function EntryDuration({ entry }: { entry: LiveEntry }) {
  const duration = getEntryPlannedSeconds(entry);
  return duration ? <p className="mt-1 text-xs text-zinc-500">{formatDuration(duration)}</p> : null;
}

function EntrySupportingText({ compact = false, entry }: { compact?: boolean; entry: LiveEntry }) {
  if (entry.kind === "song") {
    const assignment = parseAssignmentText(entry.entry.notes);
    const metadata = getSongMetadata(entry);
    return (
      <div className={compact ? "mt-1" : "mt-4"}>
        {metadata ? <p className="text-sm font-medium text-zinc-400">{metadata}</p> : null}
        {!compact && assignment.name.trim() ? <p className="mt-3 text-sm font-medium text-zinc-300">{assignment.name.trim()}</p> : null}
        {!compact && assignment.role.trim() ? <p className="mt-1 text-sm text-zinc-500">{assignment.role.trim()}</p> : null}
      </div>
    );
  }

  if (!entry.item.details) return null;
  return <p className={`${compact ? "mt-1 line-clamp-2 text-sm leading-5" : "mt-4 whitespace-pre-wrap text-base leading-7"} text-zinc-400`}>{entry.item.details}</p>;
}

function SongResourceLinks({ entry }: { entry: Extract<LiveEntry, { kind: "song" }> }) {
  const resources = getSongResources(entry);
  if (!resources.audioUrl && !resources.sheetUrl && !resources.hasAdditionalResources) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-2" aria-label="Recursos de la canción">
      {resources.audioUrl ? <ResourceLink href={resources.audioUrl} label="Audio"><Headphones className="size-4" /></ResourceLink> : null}
      {resources.sheetUrl ? <ResourceLink href={resources.sheetUrl} label="Partitura"><FileText className="size-4" /></ResourceLink> : null}
      {resources.hasAdditionalResources ? <ResourceLink href={`/song/${entry.song.id}`} label="Recursos"><Music2 className="size-4" /></ResourceLink> : null}
    </div>
  );
}

function ResourceLink({ children, href, label }: { children: React.ReactNode; href: string; label: string }) {
  const external = href.startsWith("http");
  return (
    <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-300 transition-colors duration-200 hover:border-emerald-400/25 hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
      {children}{label}
    </Link>
  );
}

function RunSheet({ canControl, currentIndex, entries, onSelect }: { canControl: boolean; currentIndex: number; entries: LiveEntry[]; onSelect: (index: number) => void }) {
  return (
    <aside className="hidden overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/70 lg:block" aria-labelledby="run-sheet-title">
      <h2 id="run-sheet-title" className="border-b border-white/[0.07] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Run Sheet</h2>
      <ol className="max-h-[calc(100dvh-14rem)] overflow-y-auto p-2">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <button type="button" disabled={!canControl} aria-current={index === currentIndex ? "step" : undefined} onClick={() => onSelect(index)} className={`grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center rounded-xl px-3 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:cursor-default ${index === currentIndex ? "bg-emerald-400/[0.12] text-emerald-300" : index < currentIndex ? "text-zinc-600 hover:bg-white/[0.03] hover:text-zinc-400" : "text-zinc-300 hover:bg-white/[0.04]"}`}>
              <span className="text-xs font-semibold tabular-nums">{index + 1}</span>
              <span className={`truncate text-sm font-medium ${entry.kind === "item" && entry.item.type === "worship" ? "uppercase tracking-[0.08em]" : ""}`}>{entry.title}</span>
              {getEntryPlannedSeconds(entry) ? <span className="pl-2 text-xs tabular-nums text-zinc-500">{formatDuration(getEntryPlannedSeconds(entry) ?? 0)}</span> : null}
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function buildLiveEntries(items: ServiceItem[], songs: LiveSong[]) {
  const songById = new Map(songs.map((song) => [song.id, song]));
  return items.flatMap<LiveEntry>((item) => {
    const itemEntry: LiveEntry = { id: `item:${item.id}`, item, kind: "item", title: item.title };
    if (item.type !== "worship") return [itemEntry];
    const songEntries = (item.song_ids ?? []).flatMap<LiveEntry>((entry) => {
      const song = songById.get(entry.songId);
      return song ? [{ entry, id: `song:${item.id}:${song.id}`, item, kind: "song", song, title: song.title }] : [];
    });
    return songEntries;
  });
}

function resolveStateIndex(entries: LiveEntry[], state: LiveServiceState | null) {
  if (!state) return -1;
  const index = entries.findIndex((entry) => entry.item.id === state.current_item_id
    && (entry.kind === "song" ? entry.song.id === state.current_song_id : state.current_song_id === null));
  return index >= 0 ? index : 0;
}

function applyAuthoritativeState(
  state: LiveServiceState,
  entries: LiveEntry[],
  setCurrentIndex: React.Dispatch<React.SetStateAction<number>>,
  setStartedAt: React.Dispatch<React.SetStateAction<string | null>>,
  setFinishedAt: React.Dispatch<React.SetStateAction<string | null>>,
  setHasLiveState: React.Dispatch<React.SetStateAction<boolean>>,
) {
  const index = resolveStateIndex(entries, state);
  if (index < 0) return;
  setCurrentIndex(index);
  setStartedAt(state.started_at);
  setFinishedAt(state.finished_at);
  setHasLiveState(true);
}

function getCompletePlannedDuration(entries: LiveEntry[]) {
  if (!entries.length) return null;
  const durations = entries.map(getEntryPlannedSeconds);
  return durations.some((duration) => duration === null)
    ? null
    : durations.reduce<number>((total, duration) => total + (duration ?? 0), 0);
}

function getElapsedSeconds(startedAt?: string | null) {
  if (!startedAt) return 0;
  const timestamp = new Date(startedAt).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
}

function getEntryPlannedSeconds(entry: LiveEntry) {
  return entry.kind === "song"
    ? getSongDurationSeconds(entry.entry, entry.song.duration)
    : getServiceItemDurationSeconds(entry.item);
}

function getScheduleSummary(
  service: LiveService | null,
  entries: LiveEntry[],
  currentIndex: number,
  elapsedSeconds: number,
  nowTimestamp: number,
) {
  if (!service?.service_date || entries.length === 0) return null;
  const durations = entries.map(getEntryPlannedSeconds);
  if (durations.some((duration) => duration === null)) return null;
  const serviceStart = parseServiceStart(service.service_date, service.service_time);
  if (!serviceStart) return null;

  const totalSeconds = durations.reduce<number>((total, duration) => total + (duration ?? 0), 0);
  const currentPlannedSeconds = durations[currentIndex] ?? 0;
  const futureSeconds = durations.slice(currentIndex + 1).reduce<number>((total, duration) => total + (duration ?? 0), 0);
  const remainingSeconds = Math.max(0, currentPlannedSeconds - elapsedSeconds) + futureSeconds;
  const plannedEndTimestamp = serviceStart.getTime() + totalSeconds * 1_000;
  const estimatedEndTimestamp = nowTimestamp + remainingSeconds * 1_000;

  return {
    estimatedEnd: formatDeviceTime(new Date(estimatedEndTimestamp)),
    plannedEnd: formatDeviceTime(new Date(plannedEndTimestamp)),
    totalSeconds,
    varianceMinutes: Math.round((estimatedEndTimestamp - plannedEndTimestamp) / 60_000),
  };
}

function formatPlannedTotal(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours === 0) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return seconds ? `${hours}h ${minutes}m ${seconds}s` : `${hours}h ${minutes}m`;
}

function parseServiceStart(serviceDate: string, serviceTime: string) {
  const [year, month, day] = serviceDate.split("-").map(Number);
  const twentyFourHour = serviceTime.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/);
  const twelveHour = serviceTime.match(/(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)/i);
  let hour: number;
  let minute: number;
  if (twelveHour) {
    hour = Number(twelveHour[1]) % 12 + (twelveHour[3].toUpperCase() === "PM" ? 12 : 0);
    minute = Number(twelveHour[2]);
  } else if (twentyFourHour) {
    hour = Number(twentyFourHour[1]);
    minute = Number(twentyFourHour[2]);
  } else {
    return null;
  }
  const date = new Date(year, month - 1, day, hour, minute);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getSongMetadata(entry: Extract<LiveEntry, { kind: "song" }>) {
  const selectedKeyName = getSavedKeyName(entry.entry);
  return [selectedKeyName || entry.song.key, entry.song.bpm ? `${entry.song.bpm} BPM` : "", entry.song.time_signature].filter(Boolean).join(" • ");
}

function getSongResources(entry: Extract<LiveEntry, { kind: "song" }>) {
  const selectedKeyName = getSavedKeyName(entry.entry);
  const selectedKey = entry.song.song_keys.find((key) => key.key_name === selectedKeyName)
    ?? entry.song.song_keys.find((key) => key.key_name === entry.song.key)
    ?? entry.song.song_keys[0];
  return {
    audioUrl: selectedKey ? selectedKey.audio_url ?? "" : entry.song.audio_url,
    sheetUrl: selectedKey ? selectedKey.sheet_url ?? "" : entry.song.sheet_url,
    hasAdditionalResources: Boolean(entry.song.lyrics || selectedKey?.song_stems.length),
  };
}

function getSavedKeyName(entry: WorshipSongEntry) {
  const storedEntry = entry as unknown as Record<string, unknown>;
  const value = storedEntry.keyName ?? storedEntry.key_name ?? storedEntry.selectedKey ?? storedEntry.selected_key ?? storedEntry.key;
  return typeof value === "string" ? value : "";
}

function formatDeviceTime(date: Date) {
  return new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}

const secondaryButtonStyles = "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-zinc-200 transition-colors duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base";
const primaryButtonStyles = "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base";
