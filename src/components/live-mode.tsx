"use client";

import { ArrowLeft, ArrowRight, CircleCheck, FileText, Headphones, Music2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppConfirmDialog } from "@/components/app-confirm-dialog";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import type { ActiveSetlistRow, CompleteLiveServiceAndAdvanceResult, ServiceItemRunRow } from "@/lib/database.types";
import { parseAssignmentText } from "@/lib/assignment-text";
import { formatDuration, getActualRunSeconds, getServiceItemDurationSeconds, getSongDurationSeconds } from "@/lib/duration";
import type { ServiceItem, ServiceItemNote, ServiceSongSetting, WorshipSongEntry } from "@/lib/service";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { buildServiceSchedule } from "@/lib/service-schedule";
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
    song_stems: { id: string; name: string }[];
  }[];
  time_signature: string | null;
  title: string;
};

type LiveEntry =
  | { id: string; item: ServiceItem; kind: "item"; occurrenceIndex: number; title: string }
  | { effectiveKey: string | null; entry: WorshipSongEntry; id: string; item: ServiceItem; kind: "song"; occurrenceIndex: number; song: LiveSong; title: string };

type LiveServiceState = {
  current_item_id: string;
  current_song_id: string | null;
  occurrence_index: number;
  finished_at: string | null;
  service_id: number;
  started_at: string;
  updated_at: string;
};

export type LiveRun = ServiceItemRunRow;

type LiveModeProps = {
  canControl: boolean;
  initialRuns: LiveRun[];
  initialState: LiveServiceState | null;
  itemNotes: ServiceItemNote[];
  items: ServiceItem[];
  loadError?: string;
  service: LiveService | null;
  serviceId: number | null;
  savedMixes: { service_id: number; service_item_id: string; song_id: string; stem_id: string; muted: boolean }[];
  songSettings: ServiceSongSetting[];
  songs: LiveSong[];
};

export function LiveMode({ canControl, initialRuns, initialState, itemNotes, items, loadError, savedMixes, service, serviceId, songSettings, songs }: LiveModeProps) {
  const entries = useMemo(() => buildLiveEntries(items, songs, songSettings), [items, songSettings, songs]);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const initialIndex = resolveStateIndex(entries, initialState);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [inspectionIndex, setInspectionIndex] = useState<number | null>(null);
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
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [isFinishOpen, setIsFinishOpen] = useState(false);
  const [finishError, setFinishError] = useState("");
  const [promotionResult, setPromotionResult] = useState<CompleteLiveServiceAndAdvanceResult | null>(null);
  const displayIndex = inspectionIndex ?? currentIndex;
  const currentEntry = entries[displayIndex];
  const liveEntry = entries[currentIndex];
  const nextEntry = entries[currentIndex + 1];
  const isInspecting = inspectionIndex !== null && inspectionIndex !== currentIndex;
  const isFirst = displayIndex === 0;
  const isLast = currentIndex >= entries.length - 1;
  const livePhase = !hasLiveState ? "notStarted" : finishedAt ? "finished" : "live";
  const schedule = livePhase === "live" ? getScheduleSummary(service, entries, currentIndex, elapsedSeconds, clockTimestamp) : null;
  const serviceSchedule = useMemo(() => buildServiceSchedule(items, songs, service?.service_time ?? null), [items, service?.service_time, songs]);
  const currentPlannedStart = currentEntry ? getLiveEntryScheduleTime(currentEntry, serviceSchedule.times) : "—";
  const nextPlannedStart = nextEntry ? getLiveEntryScheduleTime(nextEntry, serviceSchedule.times) : "—";
  const currentPlannedEnd = nextEntry ? nextPlannedStart : schedule?.plannedEnd ?? "—";
  const currentNote = currentEntry ? itemNotes.find((note) => note.service_item_id === currentEntry.item.id)?.notes.trim() ?? "" : "";
  const mutedStemNames = currentEntry?.kind === "song" ? getMutedStemNames(currentEntry, savedMixes) : [];
  const currentRun = currentEntry ? findLatestEntryRun(runs, currentEntry) : null;
  const timing = getEntryTimingSummary(service, entries, displayIndex, currentRun, clockTimestamp);
  const liveTiming = getEntryTimingSummary(service, entries, currentIndex, liveEntry ? findLatestEntryRun(runs, liveEntry) : null, clockTimestamp);

  const refreshRuns = useCallback(async () => {
    if (serviceId === null) return;
    const { data, error } = await supabase
      .from("service_item_runs")
      .select("id, service_id, service_item_id, song_id, occurrence_index, started_at, ended_at, planned_duration_seconds, created_at")
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
        .select("service_id, current_item_id, current_song_id, occurrence_index, started_at, finished_at, updated_at")
        .eq("service_id", serviceId)
        .maybeSingle();
      if (!error && data) {
        const state = data as LiveServiceState;
        applyAuthoritativeState(state, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
        void refreshRuns();
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
            setInspectionIndex(null);
            void refreshRuns();
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

  function inspectEntry(index: number) {
    const boundedIndex = Math.max(0, Math.min(entries.length - 1, index));
    setInspectionIndex(boundedIndex === currentIndex ? null : boundedIndex);
  }

  async function advanceLive() {
    if (!canControl || serviceId === null || !liveEntry || isChanging || isLast) return;
    setIsChanging(true);
    setControlError("");
    const { data, error } = await supabase.rpc("advance_service_live", {
      p_service_id: serviceId,
      p_current_service_item_id: liveEntry.item.id,
      p_current_song_id: liveEntry.kind === "song" ? liveEntry.song.id : null,
      p_current_occurrence_index: liveEntry.occurrenceIndex,
    });
    if (error) setControlError(`No se pudo completar y avanzar: ${error.message}`);
    else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setInspectionIndex(null);
      await refreshRuns();
    }
    setIsChanging(false);
  }

  async function finishService() {
    if (!canControl || serviceId === null || !liveEntry || isChanging || !isLast) return;
    setIsChanging(true);
    setControlError("");
    setFinishError("");

    const { data, error } = await supabase.rpc("complete_live_service_and_advance", { p_service_id: serviceId });
    if (error) {
      setFinishError(`No se pudo finalizar el servicio: ${error.message}`);
      setIsChanging(false);
      return;
    }

    const result = (Array.isArray(data) ? data[0] : data) as CompleteLiveServiceAndAdvanceResult | null;
    setPromotionResult(result);
    const { data: state, error: stateError } = await supabase
      .from("live_service_state")
      .select("service_id, current_item_id, current_song_id, occurrence_index, started_at, finished_at, updated_at")
      .eq("service_id", serviceId)
      .maybeSingle();
    if (stateError || !state) {
      setFinishError("El servicio se completó, pero no se pudo actualizar esta pantalla. Recarga la página para ver el resumen final.");
    } else {
      applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setInspectionIndex(null);
      setIsFinishOpen(false);
      await refreshRuns();
    }
    setIsChanging(false);
  }

  async function undoAdvance() {
    if (!canControl || serviceId === null || isChanging) return;
    setIsChanging(true);
    setControlError("");
    const { data, error } = await supabase.rpc("undo_last_live_advance", { p_service_id: serviceId });
    if (error) setControlError(`No se pudo deshacer el último avance: ${error.message}`);
    else {
      const state = Array.isArray(data) ? data[0] : data;
      if (state) applyAuthoritativeState(state as LiveServiceState, entries, setCurrentIndex, setStartedAt, setFinishedAt, setHasLiveState);
      setInspectionIndex(null);
      await refreshRuns();
    }
    setIsChanging(false);
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
    return <FinishedService finishedAt={finishedAt} plannedSeconds={getCompletePlannedDuration(entries)} promotionResult={promotionResult} runs={runs} serviceId={serviceId} serviceName={serviceName} syncStatus={syncStatus} />;
  }

  if (livePhase === "notStarted") {
    if (!service || serviceId === null) return <EmptyLiveService />;
    const serviceName = service ? localizeDefaultServiceName(service.service_name) : "Servicio actual";
    const plannedSeconds = getCompletePlannedDuration(entries);
    return <><NotStartedService canControl={canControl} entryCount={entries.length} onStart={() => { setStartError(""); setIsStartOpen(true); }} plannedSeconds={plannedSeconds} service={service} serviceName={serviceName} syncStatus={syncStatus} />{isStartOpen ? <AppConfirmDialog title="Iniciar servicio" titleId="start-service-title" descriptionId="start-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsStartOpen(false)} disabled={isStarting}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void startService()} disabled={isStarting}>{isStarting ? "Iniciando..." : "Iniciar servicio"}</PrimaryButton></AppActionBar>}><p id="start-service-description" className="mt-3 text-sm leading-6 text-zinc-400">¿Comenzar “{serviceName}”?</p><p className="mt-2 text-sm leading-6 text-zinc-500">El timer y la sincronización En Vivo comenzarán para todos los dispositivos.</p>{startError ? <p role="alert" className="mt-3 text-sm text-rose-300">{startError}</p> : null}</AppConfirmDialog> : null}</>;
  }

  return (
    <div className="pb-24 lg:pb-8">
      <header className="border-b border-white/[0.07] pb-4 sm:pb-6">
        <div className="flex items-center justify-between gap-4"><p className="text-xs font-bold uppercase tracking-[0.22em] text-zinc-500 lg:text-zinc-300">Gracia Worship</p><p className="shrink-0 text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">● En Vivo</p></div>
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
                Plan {formatPlannedTotal(schedule.totalSeconds)} · Final planificado {schedule.plannedEnd}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-zinc-400">
              {currentEntry ? `${displayIndex + 1} de ${entries.length}` : `0 de ${entries.length}`}
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
            <CurrentEntryCard currentIndex={displayIndex} elapsedSeconds={isInspecting ? timing.actualSeconds ?? 0 : elapsedSeconds} entry={currentEntry} isInspecting={isInspecting} mutedStemNames={mutedStemNames} note={currentNote} plannedEnd={currentPlannedEnd} plannedStart={currentPlannedStart} run={currentRun} serviceId={serviceId} timing={timing} totalEntries={entries.length} />

            <section className="mt-4 border-y border-white/[0.07] px-1 py-4" aria-labelledby="next-entry-title">
              <p id="next-entry-title" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Siguiente</p>
              {nextEntry ? (
                <div className="mt-2 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-5">
                  <div className="min-w-0"><p className="hidden text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-zinc-600 lg:block">{getEntryTypeLabel(nextEntry)}</p><p className="truncate text-lg font-semibold text-zinc-100 lg:mt-1 lg:text-2xl">{nextEntry.title}</p>
                  <EntrySupportingText entry={nextEntry} compact />
                  </div><div className="mt-2 shrink-0 text-left lg:mt-0 lg:text-right"><EntryDuration entry={nextEntry} /><p className="mt-1 text-xs text-zinc-500">Planificado {nextPlannedStart}</p>{liveTiming.estimatedNextStart ? <p className="mt-1 text-xs font-semibold text-emerald-300">Estimado ahora {liveTiming.estimatedNextStart}</p> : null}</div>
                </div>
              ) : (
                <p className="mt-2 text-base font-semibold text-zinc-400">Fin del servicio</p>
              )}
            </section>

            {!(isLast && !canControl) ? <nav aria-label="Navegación de elementos del servicio" className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" disabled={isChanging || isFirst} onClick={() => inspectEntry(displayIndex - 1)} className={secondaryButtonStyles}>
                <ArrowLeft aria-hidden="true" className="size-5" /><span className="min-w-0"><span className="block">Anterior</span><span className="hidden truncate text-xs font-normal text-zinc-500 lg:block">{entries[displayIndex - 1]?.title ?? "—"}</span></span>
              </button>
              {isInspecting ? (
                <button type="button" onClick={() => setInspectionIndex(null)} className={primaryButtonStyles}>Volver a Ahora</button>
              ) : (
                <button type="button" disabled={!canControl || isChanging} onClick={() => { if (isLast) { setFinishError(""); setIsFinishOpen(true); } else { void advanceLive(); } }} className={primaryButtonStyles}>
                  <span className="min-w-0"><span className="block">{isLast ? "Finalizar servicio" : "Completar y avanzar"}</span><span className="hidden truncate text-xs font-normal opacity-70 lg:block">{nextEntry?.title ?? "Cierre definitivo"}</span></span>{isLast ? <CircleCheck className="size-5" /> : <ArrowRight aria-hidden="true" className="size-5" />}
                </button>
              )}
            </nav> : null}
            {canControl && runs.length > 1 && !isInspecting ? <button type="button" disabled={isChanging} onClick={() => void undoAdvance()} className="mt-3 text-sm font-medium text-zinc-500 hover:text-zinc-300 disabled:opacity-40">Deshacer último avance</button> : null}
            {!canControl ? <p className="mt-2 text-center text-xs text-zinc-600">Modo solo lectura</p> : null}
            {controlError ? <p role="alert" className="mt-2 text-center text-sm text-rose-300">{controlError}</p> : null}
          </div>

          <RunSheet entries={entries} currentIndex={currentIndex} inspectionIndex={inspectionIndex} onSelect={inspectEntry} runs={runs} />
        </div>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">
          No hay elementos en el servicio actual.
        </div>
      )}
      {isFinishOpen ? <AppConfirmDialog title="Finalizar servicio" titleId="finish-service-title" descriptionId="finish-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsFinishOpen(false)} disabled={isChanging}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void finishService()} disabled={isChanging}>{isChanging ? "Finalizando..." : "Finalizar servicio"}</PrimaryButton></AppActionBar>}><p id="finish-service-description" className="mt-3 text-sm leading-6 text-zinc-400">Esto marcará el servicio como completado y cerrará el modo En Vivo.</p><p className="mt-2 text-sm leading-6 text-zinc-500">Si existe un único próximo servicio elegible, quedará preparado automáticamente.</p>{finishError ? <p role="alert" className="mt-3 text-sm leading-6 text-rose-300">{finishError}</p> : null}</AppConfirmDialog> : null}
    </div>
  );
}

function NotStartedService({ canControl, entryCount, onStart, plannedSeconds, service, serviceName, syncStatus }: { canControl: boolean; entryCount: number; onStart: () => void; plannedSeconds: number | null; service: LiveService | null; serviceName: string; syncStatus: "connected" | "reconnecting" }) {
  return <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center pb-20 sm:pb-8"><section className="w-full max-w-xl rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 text-center shadow-xl shadow-black/20 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">En Vivo</p><h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">{serviceName}</h1>{service ? <p className="mt-2 text-sm text-zinc-400">{[service.service_date ? formatServiceDate(service.service_date) : "", service.service_time].filter(Boolean).join(" · ")}</p> : null}{canControl ? <><dl className="mt-8 grid grid-cols-2 gap-4 border-y border-white/[0.07] py-5"><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Elementos</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{entryCount}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Duración planeada</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{plannedSeconds === null ? "—" : formatDuration(plannedSeconds)}</dd></div></dl><button type="button" onClick={onStart} disabled={entryCount === 0} className={`${primaryButtonStyles} mt-7 w-full`}>▶ Iniciar servicio</button><p className="mt-3 text-xs text-zinc-500">El servicio comenzará en el primer elemento del Run Sheet.</p></> : <p className="mt-8 text-base text-zinc-400">El servicio aún no ha comenzado.</p>}<p className={`mt-5 text-[0.6875rem] ${syncStatus === "connected" ? "text-zinc-600" : "text-amber-400/70"}`}>{syncStatus === "connected" ? "Sincronizado" : "Reconectando..."}</p></section></div>;
}

function FinishedService({ finishedAt, plannedSeconds, promotionResult, runs, serviceId, serviceName, syncStatus }: { finishedAt: string; plannedSeconds: number | null; promotionResult: CompleteLiveServiceAndAdvanceResult | null; runs: LiveRun[]; serviceId: number | null; serviceName: string; syncStatus: "connected" | "reconnecting" }) {
  const actualSeconds = runs.reduce((total, run) => total + getActualRunSeconds(run, finishedAt), 0);
  const difference = plannedSeconds === null ? null : actualSeconds - plannedSeconds;
  return <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center pb-20 sm:pb-8"><section className="w-full max-w-xl rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 text-center shadow-xl shadow-black/20 sm:p-10"><CircleCheck aria-hidden="true" className="mx-auto size-10 text-emerald-400" /><p className="mt-5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Servicio completado</p><h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">{serviceName}</h1><dl className="mt-8 grid grid-cols-3 gap-4 border-y border-white/[0.07] py-5"><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Plan</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{plannedSeconds === null ? "—" : formatDuration(plannedSeconds)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Real</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{formatDuration(actualSeconds)}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">Diferencia</dt><dd className="mt-2 text-xl font-semibold tabular-nums text-white">{difference === null ? "—" : formatSignedDuration(difference)}</dd></div></dl><p className="mt-5 text-sm text-zinc-400">Finalizado a las {formatDeviceTime(new Date(finishedAt))}</p>{promotionResult ? <p className="mt-3 text-sm leading-6 text-zinc-400">{getPromotionMessage(promotionResult)}</p> : null}{serviceId !== null ? <div className="mt-7 grid gap-3"><Link href={`/service/${serviceId}/report`} className={`${primaryButtonStyles} w-full`}>Ver reporte</Link></div> : null}<p className={`mt-4 text-[0.6875rem] ${syncStatus === "connected" ? "text-zinc-600" : "text-amber-400/70"}`}>{syncStatus === "connected" ? "Sincronizado" : "Reconectando..."}</p></section></div>;
}

function getPromotionMessage(result: CompleteLiveServiceAndAdvanceResult) {
  if (result.promotion_status === "promoted") return "El próximo servicio quedó preparado y activo.";
  if (result.promotion_status === "ambiguous") return "Hay varios servicios elegibles en el mismo horario. Ninguno fue seleccionado automáticamente.";
  if (result.promotion_status === "malformed_completed_schedule") return "El servicio quedó completado, pero su fecha u hora no permite seleccionar automáticamente el próximo servicio.";
  return "No hay un próximo servicio planificado para preparar.";
}

function EmptyLiveService() {
  return <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center pb-20 sm:pb-8"><section className="w-full max-w-xl rounded-3xl border border-white/[0.08] bg-zinc-900 p-6 text-center shadow-xl shadow-black/20 sm:p-10"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">En Vivo</p><h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-white sm:text-4xl">No hay un servicio próximo seleccionado.</h1><p className="mt-4 text-sm leading-6 text-zinc-400">Selecciona un servicio planificado y actívalo como próximo antes de iniciar En Vivo.</p><Link href="/service" className={`${primaryButtonStyles} mt-7 w-full`}>Ver servicios</Link></section></div>;
}


function CurrentEntryCard({ currentIndex, elapsedSeconds, entry, isInspecting, mutedStemNames, note, plannedEnd, plannedStart, run, serviceId, timing, totalEntries }: { currentIndex: number; elapsedSeconds: number; entry: LiveEntry; isInspecting: boolean; mutedStemNames: string[]; note: string; plannedEnd: string; plannedStart: string; run: LiveRun | null; serviceId: number | null; timing: EntryTimingSummary; totalEntries: number }) {
  const plannedSeconds = getEntryPlannedSeconds(entry);
  const remainingSeconds = plannedSeconds === null ? null : plannedSeconds - elapsedSeconds;
  const progress = plannedSeconds ? Math.min(100, (elapsedSeconds / plannedSeconds) * 100) : 0;
  return (
    <article className="rounded-3xl border border-white/[0.08] bg-zinc-900 p-5 shadow-xl shadow-black/20 sm:p-8 lg:rounded-none lg:border-x-0 lg:bg-transparent lg:px-1 lg:py-6 lg:shadow-none">
      <div className="flex items-center justify-between gap-4"><p className={`text-xs font-bold uppercase tracking-[0.18em] ${isInspecting ? "text-zinc-400" : "text-emerald-400"}`}>{isInspecting ? run?.ended_at ? "Completado" : "Inspección" : "Ahora"}</p><p className="hidden text-base font-semibold tabular-nums text-zinc-500 lg:block">{currentIndex + 1} / {totalEntries}</p></div>
      <div className="mt-4 flex min-w-0 items-start justify-between gap-4"><h2 className="min-w-0 truncate text-3xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-5xl">{entry.title}</h2>{entry.kind === "song" && entry.effectiveKey ? <span className="hidden min-w-10 shrink-0 place-items-center rounded-full border border-emerald-400/35 px-2 py-1.5 text-sm font-bold text-emerald-300 lg:grid">{entry.effectiveKey}</span> : null}</div>
      <EntrySupportingText entry={entry} />
      {entry.kind === "song" ? <SongResourceLinks entry={entry} /> : null}
      <div className="mt-6 border-t border-white/[0.07] pt-5 lg:grid lg:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1fr)] lg:gap-8">
        <div>
        <p className="whitespace-nowrap text-3xl font-bold tabular-nums tracking-tight text-white sm:text-4xl">{remainingSeconds === null ? formatDuration(elapsedSeconds) : formatLiveTimer(remainingSeconds)}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{plannedSeconds ? "Plan · tiempo restante" : "Tiempo transcurrido"}</p>
        {plannedSeconds ? (
          <>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true"><div className="h-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${progress}%` }} /></div>
          </>
        ) : null}
        </div><dl className="mt-5 grid grid-cols-2 gap-4 lg:mt-0"><LiveMetric label="Plan" value={plannedSeconds ? formatDuration(plannedSeconds) : "—"} /><LiveMetric label="Real" value={timing.actualSeconds === null ? (isInspecting ? "—" : formatDuration(elapsedSeconds)) : formatDuration(timing.actualSeconds)} /><LiveMetric label="Inicio real" value={run ? formatDeviceTime(new Date(run.started_at)) : "—"} /><LiveMetric label="Planificado" value={plannedStart} /><LiveMetric label={timing.driftSeconds !== null && timing.driftSeconds < 0 ? "Adelanto" : "Atraso"} value={timing.driftSeconds === null ? "—" : formatSignedDuration(timing.driftSeconds)} /><LiveMetric label="Diferencia" value={timing.differenceSeconds === null ? "—" : formatSignedDuration(timing.differenceSeconds)} />{run?.ended_at ? <LiveMetric label="Final real" value={formatDeviceTime(new Date(run.ended_at))} /> : null}<LiveMetric label="Final planificado" value={plannedEnd} /></dl>
      </div>
      {entry.kind === "song" && serviceId !== null && hasPlaybackStems(entry) ? <section className="mt-6 hidden border-t border-white/[0.07] pt-5 lg:block" aria-labelledby="live-playback-title"><div className="flex items-center justify-between gap-3"><h3 id="live-playback-title" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Playback</h3><span className="text-xs font-semibold text-emerald-400">● Disponible</span></div>{mutedStemNames.length ? <p className="mt-2 text-sm text-zinc-400"><span className="text-zinc-500">Stems muteados:</span> {mutedStemNames.join(" · ")}</p> : null}<p className="mt-1 text-xs text-zinc-600">Abre Playback para verificar salidas y estado del motor.</p><Link href={`/service/${serviceId}/playback`} className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Abrir Playback</Link></section> : null}
      {note ? <section className="mt-6 hidden border-t border-white/[0.07] pt-5 lg:block" aria-labelledby="live-notes-title"><h3 id="live-notes-title" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Notas</h3><p className="mt-3 whitespace-pre-wrap text-base leading-7 text-zinc-200">{note}</p></section> : null}
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

function getEntryTypeLabel(entry: LiveEntry) {
  if (entry.kind === "song") return "Canción";
  if (entry.item.type === "worship") return "Bloque de adoración";
  return "Elemento del servicio";
}

function LiveMetric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-zinc-600">{label}</dt><dd className="mt-1.5 text-sm font-semibold tabular-nums text-zinc-300">{value}</dd></div>;
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

function RunSheet({ currentIndex, entries, inspectionIndex, onSelect, runs }: { currentIndex: number; entries: LiveEntry[]; inspectionIndex: number | null; onSelect: (index: number) => void; runs: LiveRun[] }) {
  return (
    <aside className="hidden overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-900/70 lg:block" aria-labelledby="run-sheet-title">
      <h2 id="run-sheet-title" className="border-b border-white/[0.07] px-5 py-4 text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Run Sheet</h2>
      <ol className="max-h-[calc(100dvh-14rem)] overflow-y-auto p-2">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <button type="button" aria-current={index === currentIndex ? "step" : undefined} onClick={() => onSelect(index)} className={`grid min-h-11 w-full grid-cols-[2rem_minmax(0,1fr)_auto] items-center rounded-xl px-3 py-2 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-emerald-400 ${index === currentIndex ? "bg-emerald-400/[0.12] text-emerald-300" : index === inspectionIndex ? "bg-white/[0.06] text-white" : index < currentIndex ? "text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300" : "text-zinc-300 hover:bg-white/[0.04]"}`}>
              <span className="text-xs font-semibold tabular-nums">{index + 1}</span>
              <span className={`truncate text-sm font-medium ${entry.kind === "item" && entry.item.type === "worship" ? "uppercase tracking-[0.08em]" : ""}`}>{entry.title}</span>
              <span className="pl-2 text-xs tabular-nums text-zinc-500">{findLatestEntryRun(runs, entry)?.ended_at ? "✓" : getEntryPlannedSeconds(entry) ? formatDuration(getEntryPlannedSeconds(entry) ?? 0) : ""}</span>
            </button>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function buildLiveEntries(items: ServiceItem[], songs: LiveSong[], settings: ServiceSongSetting[]) {
  return buildOperationalServiceEntries(items, songs, settings).map<LiveEntry>((entry) => entry.kind === "moment"
    ? { id: entry.id, item: entry.item, kind: "item", occurrenceIndex: entry.occurrenceIndex, title: entry.title }
    : {
        effectiveKey: entry.effectiveKey,
        entry: entry.legacyEntry ?? {
          notes: entry.assignmentText ?? "",
          plannedDurationSeconds: entry.item.planned_duration_seconds,
          songId: entry.song.id,
        },
        id: entry.id,
        item: entry.item,
        kind: "song",
        occurrenceIndex: entry.occurrenceIndex,
        song: entry.song,
        title: entry.title,
      });
}

function resolveStateIndex(entries: LiveEntry[], state: LiveServiceState | null) {
  if (!state) return -1;
  const index = entries.findIndex((entry) => entry.item.id === state.current_item_id
    && entry.occurrenceIndex === state.occurrence_index
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

type EntryTimingSummary = {
  actualSeconds: number | null;
  differenceSeconds: number | null;
  driftSeconds: number | null;
  estimatedNextStart: string | null;
};

function findLatestEntryRun(runs: LiveRun[], entry: LiveEntry) {
  return [...runs].reverse().find((run) => run.service_item_id === entry.item.id
    && (run.occurrence_index === entry.occurrenceIndex || (run.occurrence_index === null && entry.occurrenceIndex === 0))
    && run.song_id === (entry.kind === "song" ? entry.song.id : null)) ?? null;
}

function getEntryTimingSummary(service: LiveService | null, entries: LiveEntry[], index: number, run: LiveRun | null, nowTimestamp: number): EntryTimingSummary {
  const plannedSeconds = entries[index] ? getEntryPlannedSeconds(entries[index]) : null;
  const actualSeconds = run?.ended_at ? Math.max(0, Math.round((new Date(run.ended_at).getTime() - new Date(run.started_at).getTime()) / 1_000)) : null;
  const serviceStart = service?.service_date ? parseServiceStart(service.service_date, service.service_time) : null;
  const priorDurations = entries.slice(0, Math.max(0, index)).map(getEntryPlannedSeconds);
  const plannedStartTimestamp = serviceStart && priorDurations.every((value) => value !== null)
    ? serviceStart.getTime() + priorDurations.reduce<number>((total, value) => total + (value ?? 0), 0) * 1_000
    : null;
  const driftSeconds = run && plannedStartTimestamp !== null
    ? Math.round((new Date(run.started_at).getTime() - plannedStartTimestamp) / 1_000)
    : null;
  const activeElapsed = run && !run.ended_at ? Math.max(0, Math.floor((nowTimestamp - new Date(run.started_at).getTime()) / 1_000)) : null;
  const currentVariance = plannedSeconds === null ? null : (actualSeconds ?? activeElapsed) === null ? null : (actualSeconds ?? activeElapsed ?? 0) - plannedSeconds;
  const estimatedNextTimestamp = run && plannedSeconds !== null
    ? (run.ended_at ? new Date(run.ended_at).getTime() : Math.max(nowTimestamp, new Date(run.started_at).getTime() + plannedSeconds * 1_000))
    : null;
  return {
    actualSeconds,
    differenceSeconds: currentVariance,
    driftSeconds,
    estimatedNextStart: estimatedNextTimestamp === null ? null : formatDeviceTime(new Date(estimatedNextTimestamp)),
  };
}

function formatSignedDuration(seconds: number) {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "−" : "";
  return `${sign}${formatDuration(Math.abs(seconds))}`;
}

function getLiveEntryScheduleTime(entry: LiveEntry, times: Map<string, string>) {
  const key = entry.kind === "song" && entry.item.type === "worship" ? `${entry.item.id}:${entry.song.id}:${entry.occurrenceIndex}` : entry.item.id;
  return times.get(key) ?? "—";
}

function getMutedStemNames(entry: Extract<LiveEntry, { kind: "song" }>, savedMixes: LiveModeProps["savedMixes"]) {
  const selectedKey = entry.song.song_keys.find((key) => key.key_name === entry.effectiveKey)
    ?? entry.song.song_keys.find((key) => key.key_name === entry.song.key)
    ?? entry.song.song_keys[0];
  const namesById = new Map((selectedKey?.song_stems ?? []).map((stem) => [stem.id, stem.name]));
  return savedMixes.filter((mix) => mix.service_item_id === entry.item.id && mix.song_id === entry.song.id && mix.muted).flatMap((mix) => {
    const name = namesById.get(mix.stem_id);
    return name ? [name] : [];
  });
}

function hasPlaybackStems(entry: Extract<LiveEntry, { kind: "song" }>) {
  return entry.song.song_keys.some((key) => key.song_stems.length > 0);
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
  return [entry.effectiveKey || entry.song.key, entry.song.bpm ? `${entry.song.bpm} BPM` : "", entry.song.time_signature].filter(Boolean).join(" • ");
}

function getSongResources(entry: Extract<LiveEntry, { kind: "song" }>) {
  const selectedKeyName = entry.effectiveKey;
  const selectedKey = entry.song.song_keys.find((key) => key.key_name === selectedKeyName)
    ?? entry.song.song_keys.find((key) => key.key_name === entry.song.key)
    ?? entry.song.song_keys[0];
  return {
    audioUrl: selectedKey ? selectedKey.audio_url ?? "" : entry.song.audio_url,
    sheetUrl: selectedKey ? selectedKey.sheet_url ?? "" : entry.song.sheet_url,
    hasAdditionalResources: Boolean(entry.song.lyrics || selectedKey?.song_stems.length),
  };
}

function formatDeviceTime(date: Date) {
  return new Intl.DateTimeFormat("es-419", { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(date);
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}

const secondaryButtonStyles = "inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-zinc-200 transition-colors duration-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base";
const primaryButtonStyles = "inline-flex min-h-14 min-w-0 items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:text-base";
