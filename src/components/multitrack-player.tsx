"use client";

import Image from "next/image";
import { AudioWaveform, Drum, Guitar, KeyboardMusic, Layers3, Mic2, SkipBack, SkipForward, SlidersHorizontal, Square, Timer, Users, Volume2, type LucideIcon } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AudioWaveformTimeline } from "@/components/audio-waveform-timeline";
import { getCurrentSongSection, getSongSectionRegions, type SongSection, type SongSectionRegion } from "@/lib/song-sections";
import { musicalPositionToSeconds, secondsToMusicalPosition, snapSecondsToGrid, type GridSnap, type MusicalGrid, type MusicalPosition } from "@/lib/musical-grid";
import { MusicalGridEditor } from "@/components/musical-grid-editor";
import { MusicalGridProvider, useMusicalGrid } from "@/components/musical-grid-context";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SongSectionsProvider } from "@/components/song-sections-context";
import { getAudioCacheDiagnostics, loadStemBundle, releaseStemBundle, retryStemBundle, type AudioCachePolicy, type BundleDiagnostics, type PublicSongStem, type StemBundleResult, type StemLoadFailure } from "@/lib/audio-buffer-cache";
import { createAudioDataDecoder } from "@/lib/audio-data-decoder";
import { isPhonePlaybackDevice } from "@/lib/playback-device";
import { PlaybackEngine } from "@/lib/playback-engine";
import { getPlaybackRuntimeDiagnostics, recordAudioContext, recordMultitrackPlayerMount } from "@/lib/playback-runtime-diagnostics";
export type { PublicSongStem } from "@/lib/audio-buffer-cache";

type StemMix = {
  muted: boolean;
  solo: boolean;
  volume: number;
};

type SectionEditorState = {
  id: string | null;
  label: string;
  sectionType: SongSection["section_type"];
  time: string;
  bar: string;
  beat: string;
  fraction: string;
  snap: GridSnap;
};

const PREVIOUS_SECTION_THRESHOLD_SECONDS = 2;

export function MultitrackPlayer({ active = true, artist, artworkUrl, bpm, canNext = false, canPrevious = false, effectiveKey, grid = null, layout = "playback", onNext, onPrevious, showStop = false, stems, timeSignature, title }: { active?: boolean; artist?: string | null; artworkUrl?: string | null; bpm?: number | null; canNext?: boolean; canPrevious?: boolean; effectiveKey?: string | null; grid?: MusicalGrid | null; layout?: "playback" | "song-detail"; onNext?: () => void; onPrevious?: () => void; showStop?: boolean; stems: PublicSongStem[]; timeSignature?: string | null; title: string }) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const animationRef = useRef<number | null>(null);
  const loadControllerRef = useRef<AbortController | null>(null);
  const transitionRef = useRef(false);
  const sectionNavigationRef = useRef<{ next: number | null; previous: number | null }>({ next: null, previous: null });
  const sectionSeekRef = useRef<(time: number) => void>(() => undefined);
  const sectionLoopRef = useRef<SongSectionRegion | null>(null);
  const sectionLoopAvailableRef = useRef(false);
  const sectionLoopToggleRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [failures, setFailures] = useState<StemLoadFailure[]>([]);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [playableStems, setPlayableStems] = useState<PublicSongStem[]>(stems);
  const [waveformBuffers, setWaveformBuffers] = useState<AudioBuffer[]>([]);
  const [sections, setSections] = useState<SongSection[]>([]);
  const [canEditSections, setCanEditSections] = useState(false);
  const [showPlaybackAuthoring, setShowPlaybackAuthoring] = useState(false);
  const [sectionEditor, setSectionEditor] = useState<SectionEditorState | null>(null);
  const [sectionEditorError, setSectionEditorError] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [loopSectionId, setLoopSectionId] = useState<string | null>(null);
  const [musicalGrid, setMusicalGrid] = useState<MusicalGrid | null>(grid);
  const [diagnostics, setDiagnostics] = useState<BundleDiagnostics | null>(null);
  const [durationWarnings, setDurationWarnings] = useState<string[]>([]);
  const [durationAccepted, setDurationAccepted] = useState(false);
  const [contextState, setContextState] = useState<AudioContextState | "interrupted">("suspended");
  const [engineMessage, setEngineMessage] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [cacheDiagnostics, setCacheDiagnostics] = useState<{ approximateBytes: number; decodedDurationSeconds: number; evictions: number; songs: number; stems: number } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolume] = useState(1);
  const [mixes, setMixes] = useState<StemMix[]>(() => stems.map(() => ({ muted: false, solo: false, volume: 1 })));
  const orderedSections = useMemo(() => [...sections].sort((a, b) => a.start_seconds - b.start_seconds), [sections]);
  const sectionRegions = useMemo(() => getSongSectionRegions(orderedSections, duration), [duration, orderedSections]);
  const currentSection = getCurrentSongSection(orderedSections, currentTime);
  const currentMusicalPosition = musicalGrid ? secondsToMusicalPosition(currentTime, musicalGrid) : null;
  const effectivePlaybackBpm = musicalGrid?.bpm ?? bpm;
  const effectivePlaybackMeter = musicalGrid ? `${musicalGrid.beatsPerBar}/${musicalGrid.beatUnit}` : timeSignature;
  const currentSectionIndex = currentSection ? orderedSections.findIndex((section) => section.id === currentSection.id) : -1;
  const previousSectionTarget = currentSection
    ? currentTime - currentSection.start_seconds > PREVIOUS_SECTION_THRESHOLD_SECONDS
      ? currentSection.start_seconds
      : orderedSections[currentSectionIndex - 1]?.start_seconds ?? null
    : null;
  const nextSectionTarget = currentSectionIndex >= 0 ? orderedSections[currentSectionIndex + 1]?.start_seconds ?? null : orderedSections[0]?.start_seconds ?? null;
  const loopRegion = loopSectionId ? sectionRegions.find((region) => region.section.id === loopSectionId) ?? null : null;
  sectionLoopRef.current = loopRegion;
  sectionLoopAvailableRef.current = Boolean(currentSection && duration > 0);
  sectionNavigationRef.current = { next: nextSectionTarget, previous: previousSectionTarget };

  const getPlaybackTime = useCallback((audioContextTime?: number) => engineRef.current?.getPosition(audioContextTime) ?? 0, []);

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const pauseAt = useCallback((time: number) => {
    engineRef.current?.pauseAt(time);
    stopAnimation();
    setCurrentTime(time);
    setIsPlaying(false);
  }, [stopAnimation]);

  const updateTimeline = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const nextTime = getPlaybackTime(engine.context.currentTime);
    setCurrentTime(nextTime);
    if (!sectionLoopRef.current && nextTime >= duration) {
      pauseAt(duration);
      return;
    }
    animationRef.current = requestAnimationFrame(updateTimeline);
  }, [duration, getPlaybackTime, pauseAt]);

  const reflectStartedPlayback = useCallback((offset: number) => {
    setCurrentTime(offset);
    setIsPlaying(true);
    stopAnimation();
    animationRef.current = requestAnimationFrame(updateTimeline);
  }, [stopAnimation, updateTimeline]);

  useLayoutEffect(() => {
    let current = true;
    const controller = new AbortController();
    loadControllerRef.current = controller;
    const mobilePolicy = isPhonePlaybackDevice();
    const cachePolicy: AudioCachePolicy | undefined = mobilePolicy ? { maxCachedSongs: 1, retainOnlyCurrent: true } : undefined;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setStatus("error");
      return;
    }
    const engine = new PlaybackEngine(AudioContextConstructor);
    const context = engine.context;
    engineRef.current = engine;
    if (process.env.NODE_ENV === "development") { recordMultitrackPlayerMount(1); recordAudioContext(1); }
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setStatus("loading");
    setFailures([]);
    setPartialAccepted(false);
    setDurationAccepted(false);
    setEngineMessage(null);
    setContextState(context.state);
    const onStateChange = () => { setContextState(context.state); if (context.state === "closed") setEngineMessage("El motor de audio se cerró inesperadamente."); else if (context.state !== "running" && engine.isPlaying) setEngineMessage("El navegador pausó el motor de audio."); };
    context.addEventListener("statechange", onStateChange);

    void loadStemBundle(createAudioDataDecoder(context, "playback"), stems, { label: title, mode: "foreground", policy: cachePolicy, signal: controller.signal }).then(({ diagnostics: nextDiagnostics, failures: nextFailures, loaded }) => {
      if (!current) return;
      const buffers = loaded.map((result) => result.buffer);
      setWaveformBuffers(buffers);
      setPlayableStems(loaded.map((result) => result.stem));
      setMixes(loaded.map(() => ({ muted: false, solo: false, volume: 1 })));
      setFailures(nextFailures);
      setDiagnostics(nextDiagnostics);
      if (nextFailures.length) console.warn("Playback stem load failures:", nextFailures.map((failure) => ({ message: failure.message, stem: failure.stem.name })));
      const canonicalDuration = median(buffers.map((buffer) => buffer.duration));
      engine.loadChannels(loaded.map((item) => ({ buffer: item.buffer, stemId: item.stem.id })), canonicalDuration);
      setDuration(canonicalDuration);
      setDurationWarnings(loaded.filter((item) => Math.abs(item.buffer.duration - canonicalDuration) > 0.5).map((item) => `${item.stem.name} (${formatTime(item.buffer.duration)})`));
      setStatus(!buffers.length ? "error" : nextFailures.length ? "partial" : "ready");
      if (process.env.NODE_ENV === "development") void getAudioCacheDiagnostics().then((cache) => console.info("Playback runtime diagnostics:", { song: title, stems: loaded.length, decodedPcmMb: Number((nextDiagnostics.approximateBytes / 1024 / 1024).toFixed(1)), decodedBundlesRetained: cache.songs, cacheBundles: cache.songs, estimatedCachedPcmMb: Number((cache.approximateBytes / 1024 / 1024).toFixed(1)), ...getPlaybackRuntimeDiagnostics(loaded.length ? loaded.length + 1 : 0) }));
    }).catch((error) => {
      if (!current) return;
      if (isAbortError(error)) return;
      console.error("Unable to load multitrack stems:", error);
      setStatus("error");
    });

    return () => {
      current = false;
      loadControllerRef.current?.abort();
      loadControllerRef.current = null;
      context.removeEventListener("statechange", onStateChange);
      stopAnimation();
      setWaveformBuffers([]);
      setPlayableStems([]);
      engineRef.current = null;
      if (mobilePolicy) releaseStemBundle(stems);
      if (process.env.NODE_ENV === "development") { recordAudioContext(-1); recordMultitrackPlayerMount(-1); }
      void engine.destroy();
    };
  }, [stems, stopAnimation, title]);

  useEffect(() => { engineRef.current?.setMasterVolume(masterVolume); }, [masterVolume]);

  useEffect(() => {
    engineRef.current?.applyMixes(playableStems.flatMap((stem, index) => mixes[index] ? [{ ...mixes[index], stemId: stem.id }] : []));
  }, [mixes, playableStems]);

  useEffect(() => {
    const engine = engineRef.current;
    if (active || !isPlaying || !engine) return;
    const pausedTime = getPlaybackTime(engine.context.currentTime);
    pauseAt(pausedTime);
  }, [active, getPlaybackTime, isPlaying, pauseAt]);

  useEffect(() => { setMusicalGrid(grid); }, [grid, stems]);
  useEffect(() => { setLoopSectionId(null); sectionLoopRef.current = null; engineRef.current?.setLoop(null); if (!stems[0]?.song_key_id) { setSections([]); return; } let current = true; const controller = new AbortController(); const supabase = createSupabaseBrowserClient(); void supabase.from("song_sections").select("id, song_key_id, label, section_type, start_seconds, bar_number, beat_number, beat_fraction, sort_order").eq("song_key_id", stems[0].song_key_id).order("start_seconds").abortSignal(controller.signal).then(({ data, error }) => { if (!current || controller.signal.aborted) return; if (error) console.error("Unable to load song sections:", error); setSections((data ?? []) as SongSection[]); }); return () => { current = false; controller.abort(); }; }, [stems]);
  useEffect(() => { if (layout !== "song-detail") return; void createSupabaseBrowserClient().auth.getUser().then(({ data }) => setCanEditSections(Boolean(data.user))); }, [layout]);

  function openNewSection() { const time = musicalGrid ? snapSecondsToGrid(currentTime, musicalGrid, "bar") : currentTime; setSectionEditorError(null); setSectionEditor(buildSectionEditorState(null, "", null, time, musicalGrid, "bar")); }
  function openSectionEditor(section: SongSection) { setSectionEditorError(null); const editor = buildSectionEditorState(section.id, section.label, section.section_type, section.start_seconds, musicalGrid, "off"); if (section.bar_number && section.beat_number) { editor.bar = String(section.bar_number); editor.beat = String(section.beat_number); editor.fraction = String(section.beat_fraction ?? 0); } setSectionEditor(editor); }
  async function saveSection() {
    if (!sectionEditor || !stems[0]?.song_key_id || savingSection) return;
    const label = sectionEditor.label.trim();
    const musicalBar = Number(sectionEditor.bar); const musicalBeat = Number(sectionEditor.beat); const musicalFraction = Number(sectionEditor.fraction || 0);
    const startSeconds = musicalGrid ? musicalPositionToSeconds({ bar: musicalBar, beat: musicalBeat, fraction: musicalFraction }, musicalGrid) : parseSectionTimestamp(sectionEditor.time);
    if (!label) { setSectionEditorError("Escribe un nombre para la sección."); return; }
    if (musicalGrid && (!Number.isInteger(musicalBar) || musicalBar < 1 || !Number.isInteger(musicalBeat) || musicalBeat < 1 || musicalBeat > musicalGrid.beatsPerBar || !Number.isFinite(musicalFraction) || musicalFraction < 0 || musicalFraction >= 1)) { setSectionEditorError(`Usa compás ≥ 1, beat entre 1 y ${musicalGrid.beatsPerBar}, y fracción entre 0 y menos de 1.`); return; }
    if (startSeconds === null || !Number.isFinite(startSeconds) || startSeconds < 0) { setSectionEditorError("Usa un tiempo válido como 1:24.500."); return; }
    const normalizedStart = Number(startSeconds.toFixed(3));
    if (duration > 0 && normalizedStart > duration) { setSectionEditorError(`El tiempo no puede superar ${formatSectionTimestamp(duration)}.`); return; }
    if (sections.some((section) => section.id !== sectionEditor.id && section.start_seconds === normalizedStart)) { setSectionEditorError("Ya existe una sección exactamente en ese tiempo."); return; }
    setSavingSection(true); setSectionEditorError(null);
    const supabase = createSupabaseBrowserClient();
    const values = { label, section_type: sectionEditor.sectionType, start_seconds: normalizedStart, bar_number: musicalGrid ? musicalBar : null, beat_number: musicalGrid ? musicalBeat : null, beat_fraction: musicalGrid ? musicalFraction : null };
    const result = sectionEditor.id
      ? await supabase.from("song_sections").update({ ...values, updated_at: new Date().toISOString() }).eq("id", sectionEditor.id).eq("song_key_id", stems[0].song_key_id).select("id, song_key_id, label, section_type, start_seconds, bar_number, beat_number, beat_fraction, sort_order").single()
      : await supabase.from("song_sections").insert({ ...values, song_key_id: stems[0].song_key_id, sort_order: sections.length }).select("id, song_key_id, label, section_type, start_seconds, bar_number, beat_number, beat_fraction, sort_order").single();
    if (result.error) { setSectionEditorError(result.error.code === "23505" ? "Ya existe una sección exactamente en ese tiempo." : result.error.message); setSavingSection(false); return; }
    const saved = result.data as SongSection;
    setSections((current) => (sectionEditor.id ? current.map((section) => section.id === saved.id ? saved : section) : [...current, saved]).sort((a, b) => a.start_seconds - b.start_seconds));
    setSavingSection(false); setSectionEditor(null);
  }
  async function deleteSection(section: SongSection) { if (!window.confirm(`Eliminar ${section.label}?`)) return; const { error } = await createSupabaseBrowserClient().from("song_sections").delete().eq("id", section.id); if (!error) setSections((current) => current.filter((item) => item.id !== section.id)); }

  useEffect(() => {
    const reconcile = () => {
      const engine = engineRef.current; if (!engine || document.visibilityState !== "visible") return; const context = engine.context;
      setContextState(context.state);
      if (context.state !== "running" && engine.isPlaying) { pauseAt(engine.getPosition(context.currentTime, false)); setEngineMessage("El navegador pausó el motor de audio."); }
    };
    document.addEventListener("visibilitychange", reconcile); window.addEventListener("pageshow", reconcile);
    return () => { document.removeEventListener("visibilitychange", reconcile); window.removeEventListener("pageshow", reconcile); };
  }, [duration, pauseAt]);

  async function togglePlayback() {
    const engine = engineRef.current;
    if (!engine || (status !== "ready" && !(status === "partial" && partialAccepted)) || (durationWarnings.length > 0 && !durationAccepted) || duration <= 0 || transitionRef.current) return;
    transitionRef.current = true;
    if (engine.isPlaying) {
      const pausedTime = getPlaybackTime(engine.context.currentTime);
      pauseAt(pausedTime);
      transitionRef.current = false;
      return;
    }
    try { const offset = await engine.play(); setContextState(engine.context.state); setEngineMessage(null); reflectStartedPlayback(offset); } catch (error) { console.error("Unable to resume Playback audio:", error); setEngineMessage("El navegador pausó el motor de audio. Toca Reanudar audio para continuar."); } finally { transitionRef.current = false; }
  }

  async function seek(value: number) {
    const nextTime = Math.min(duration, Math.max(0, value));
    const loop = sectionLoopRef.current;
    const engine = engineRef.current;
    if (loop && (nextTime < loop.start || nextTime >= loop.end)) { sectionLoopRef.current = null; setLoopSectionId(null); engine?.setLoop(null); }
    setCurrentTime(nextTime);
    if (!engine?.isPlaying) return;
    stopAnimation();
    const restartedAt = await engine.seek(nextTime);
    if (restartedAt !== null) reflectStartedPlayback(restartedAt);
  }
  function clearSectionLoop() { sectionLoopRef.current = null; setLoopSectionId(null); engineRef.current?.setLoop(null); }
  function toggleSectionLoop() {
    const activeLoop = sectionLoopRef.current;
    if (activeLoop) {
      clearSectionLoop();
      engineRef.current?.restartAt(currentTime); if (engineRef.current?.isPlaying) reflectStartedPlayback(currentTime);
      return;
    }
    if (!currentSection || duration <= 0) return;
    const nextRegion = sectionRegions.find((region) => region.section.id === currentSection.id);
    if (!nextRegion) return;
    sectionLoopRef.current = nextRegion; setLoopSectionId(currentSection.id); engineRef.current?.setLoop(nextRegion);
    const restartTime = currentTime >= nextRegion.start && currentTime < nextRegion.end ? currentTime : nextRegion.start;
    engineRef.current?.restartAt(restartTime); if (engineRef.current?.isPlaying) reflectStartedPlayback(restartTime);
  }
  sectionSeekRef.current = (time) => { void seek(time); };
  sectionLoopToggleRef.current = toggleSectionLoop;

  useEffect(() => {
    const handleSectionShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || !window.matchMedia("(min-width: 1024px)").matches) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea, select") || target.isContentEditable)) return;
      if (event.key.toLowerCase() === "l") { if (sectionLoopAvailableRef.current) { event.preventDefault(); sectionLoopToggleRef.current(); } return; }
      const destination = event.key === "ArrowLeft" ? sectionNavigationRef.current.previous : event.key === "ArrowRight" ? sectionNavigationRef.current.next : null;
      if (destination === null) return;
      event.preventDefault(); sectionSeekRef.current(destination);
    };
    window.addEventListener("keydown", handleSectionShortcut);
    return () => window.removeEventListener("keydown", handleSectionShortcut);
  }, []);

  const updateMix = useCallback((index: number, patch: Partial<StemMix>) => {
    setMixes((current) => current.map((mix, mixIndex) => mixIndex === index ? { ...mix, ...patch } : mix));
  }, []);

  async function resumeAudio() { const context = engineRef.current?.context; if (!context || context.state === "closed") return; try { await context.resume(); setContextState(context.state); if (context.state === "running") setEngineMessage(null); } catch (error) { console.error("Unable to recover AudioContext:", error); setEngineMessage("No se pudo reanudar el motor de audio."); } }

  async function retryLoad() {
    const engine = engineRef.current; if (!engine || status === "loading") return; const context = engine.context; loadControllerRef.current?.abort(); const controller = new AbortController(); loadControllerRef.current = controller; pauseAt(0); setStatus("loading"); setEngineMessage(null);
    try {
      const policy = isPhonePlaybackDevice() ? { maxCachedSongs: 1, retainOnlyCurrent: true } : undefined;
      const result = await retryStemBundle(createAudioDataDecoder(context, "playback"), stems, { label: title, mode: "foreground", policy, signal: controller.signal }); if (controller.signal.aborted || engineRef.current !== engine) return; installBundle(result);
    } catch (error) { if (!isAbortError(error)) { console.error("Unable to retry Playback stems:", error); setStatus("error"); } }
    finally { if (loadControllerRef.current === controller) loadControllerRef.current = null; }
  }

  function installBundle({ diagnostics: nextDiagnostics, failures: nextFailures, loaded }: StemBundleResult) {
    const engine = engineRef.current; if (!engine) return;
    const buffers = loaded.map((item) => item.buffer); setWaveformBuffers(buffers); setPlayableStems(loaded.map((item) => item.stem)); setFailures(nextFailures); setDiagnostics(nextDiagnostics);
    setMixes(loaded.map(() => ({ muted: false, solo: false, volume: 1 })));
    const canonical = median(buffers.map((buffer) => buffer.duration)); engine.loadChannels(loaded.map((item) => ({ buffer: item.buffer, stemId: item.stem.id })), canonical); setDuration(canonical); setDurationWarnings(loaded.filter((item) => Math.abs(item.buffer.duration - canonical) > 0.5).map((item) => `${item.stem.name} (${formatTime(item.buffer.duration)})`)); setDurationAccepted(false); setPartialAccepted(false); setStatus(!buffers.length ? "error" : nextFailures.length ? "partial" : "ready");
  }

  if (status === "loading") return <p role="status" className="py-5 text-center text-sm text-zinc-400">Cargando pistas…</p>;
  if (status === "error") return <div role="alert" className="py-5 text-center text-sm text-rose-300"><p>No se pudieron cargar las pistas.</p>{failures.length ? <p className="mt-1 text-xs text-zinc-500">{failures.map((failure) => failure.stem.name).join(", ")}</p> : null}<button type="button" onClick={() => void retryLoad()} className="mt-3 min-h-9 rounded-lg border border-rose-300/25 px-3 text-xs font-semibold">Reintentar</button></div>;

  return (
    <MusicalGridProvider value={musicalGrid}><SongSectionsProvider value={sections}><div data-multitrack-layout={layout}>
      {layout === "song-detail" && canEditSections && stems[0]?.song_key_id ? <div className="mb-3 flex justify-end"><button type="button" onClick={() => setShowPlaybackAuthoring(true)} className="min-h-10 rounded-lg border border-emerald-400/25 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/[0.06]">Configurar Playback</button></div> : null}
      {layout === "playback" ? <header className="hidden min-h-[9rem] items-center gap-5 border-b border-white/[0.07] bg-[#0a1210] px-5 py-4 lg:flex">{artworkUrl ? <Image src={artworkUrl} alt="" width={128} height={128} unoptimized className="size-32 shrink-0 rounded-md object-cover" /> : <div className="grid size-32 shrink-0 place-items-center rounded-md border border-white/[0.07] bg-black/20 text-3xl text-zinc-700">♪</div>}<div className="min-w-0 flex-1"><div className="flex items-center gap-3"><h2 className="truncate text-[2rem] font-bold tracking-[-0.035em] text-white">{title}</h2>{effectiveKey ? <span className="grid size-9 shrink-0 place-items-center rounded-full border border-emerald-400/35 text-sm font-bold text-emerald-300">{effectiveKey}</span> : null}</div>{artist ? <p className="mt-1 truncate text-base text-zinc-400">{artist}</p> : null}<p className="mt-3 text-sm text-zinc-500">{[effectivePlaybackBpm ? `${effectivePlaybackBpm} BPM` : null, effectivePlaybackMeter].filter(Boolean).join(" · ")}</p></div><div className="grid shrink-0 grid-cols-2 gap-3"><OperationalMetric label="Tiempo restante" value={formatTime(Math.max(0, duration - currentTime))} /><OperationalMetric label="Duración total" value={formatTime(duration)} /><div className="col-span-2 flex items-center justify-end gap-3"><span className={`text-[0.6875rem] font-bold uppercase tracking-[0.16em] ${status === "partial" ? "text-amber-300" : "text-emerald-400"}`}>● {status === "ready" ? "Listo" : partialAccepted ? "Partial" : status}</span><button type="button" onClick={() => { const next = !showDiagnostics; setShowDiagnostics(next); if (next) void getAudioCacheDiagnostics().then(setCacheDiagnostics); }} className="text-xs font-semibold text-zinc-600 hover:text-zinc-300">••• Diagnóstico</button></div></div></header> : null}
      {layout === "playback" ? <header className="sticky top-0 z-30 -mx-3 mb-3 border-y border-white/[0.07] bg-[#090e0d]/95 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-xl lg:hidden"><div className="flex items-center gap-2"><h2 className="min-w-0 flex-1 truncate text-base font-bold text-white">{title}</h2>{effectiveKey ? <span className="grid size-7 shrink-0 place-items-center rounded-full border border-emerald-400/30 text-xs font-bold text-emerald-300">{effectiveKey}</span> : null}</div><div className="mt-1 flex items-end justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs text-zinc-400">{artist}</p><p className="mt-0.5 text-[0.6875rem] text-zinc-600">{[effectivePlaybackBpm ? `${effectivePlaybackBpm} BPM` : null, effectivePlaybackMeter].filter(Boolean).join(" · ")}</p></div><span className={`shrink-0 text-[0.625rem] font-bold uppercase tracking-[0.12em] ${status === "partial" ? "text-amber-300" : "text-emerald-400"}`}>● {status === "ready" ? "Listo" : partialAccepted ? "Partial" : status}</span></div></header> : <div role="status" className={`mb-3 text-xs font-semibold lg:hidden ${status === "partial" ? "text-amber-300" : "text-emerald-400"}`}>{status === "ready" ? "Listo" : partialAccepted ? `Listo con ${failures.length}` : `Carga parcial · ${failures.length}/${stems.length}`}</div>}
      {status === "partial" && !partialAccepted ? <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-zinc-400"><p>No disponibles: {failures.map((failure) => failure.stem.name).join(", ")}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPartialAccepted(true)} className="min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold text-amber-200">Continuar con las pistas disponibles</button><button type="button" onClick={() => void retryLoad()} className="min-h-9 rounded-lg border border-white/10 px-3 font-semibold">Reintentar</button></div></div> : null}
      {durationWarnings.length && !durationAccepted ? <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-zinc-400"><p className="font-semibold text-amber-200">Duraciones de pistas no coinciden.</p><p className="mt-1">{durationWarnings.join(", ")}</p><button type="button" onClick={() => setDurationAccepted(true)} className="mt-2 min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold text-amber-200">Continuar con esta duración</button></div> : null}
      {engineMessage ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-amber-100"><span>{engineMessage}</span>{contextState !== "closed" ? <button type="button" onClick={() => void resumeAudio()} className="min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold">Reanudar audio</button> : null}</div> : null}
      <div className="hidden lg:block"><div className="border-y border-white/[0.07] bg-emerald-950/[0.07] px-5 pb-4 pt-4">{currentMusicalPosition ? <div className="mb-3 flex justify-end"><MusicalPositionDisplay position={currentMusicalPosition} /></div> : null}<div aria-hidden="true" className="mb-2 h-4 border-b border-dashed border-white/[0.06]" /><AudioWaveformTimeline buffers={waveformBuffers} currentTime={currentTime} duration={duration} loopSectionId={loopSectionId} onSeek={(value) => void seek(value)} />{layout === "playback" && orderedSections.length ? <SectionNavigation currentSection={currentSection} loopSection={loopRegion?.section ?? null} nextTarget={nextSectionTarget} previousTarget={previousSectionTarget} onSeek={(value) => void seek(value)} onToggleLoop={toggleSectionLoop} /> : null}<div className="mt-3 grid grid-cols-3 font-mono text-xs text-zinc-500"><span className="flex items-center gap-3">{formatTime(currentTime)}{currentMusicalPosition ? <MusicalPositionDisplay compact position={currentMusicalPosition} /> : null}</span><span className="text-center">-{formatTime(Math.max(0, duration - currentTime))} restante</span><span className="text-right">{formatTime(duration)} total</span></div></div><div className="flex items-center justify-center gap-5 border-b border-white/[0.07] py-4"><TransportButton label="Canción anterior" onClick={() => { clearSectionLoop(); onPrevious?.(); }} disabled={!canPrevious}>‹</TransportButton><div className="flex flex-col items-center gap-1"><button type="button" onClick={() => void togglePlayback()} disabled={(status === "partial" && !partialAccepted) || (durationWarnings.length > 0 && !durationAccepted) || contextState === "closed"} className="grid size-16 place-items-center rounded-full bg-emerald-400 text-zinc-950 hover:bg-emerald-300 disabled:opacity-35" aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><span className="text-[0.6875rem] text-emerald-300">{isPlaying ? "Pausa" : "Reproducir"}</span></div>{showStop ? <TransportButton label="Detener" onClick={() => pauseAt(0)} disabled={!isPlaying && currentTime === 0}>■</TransportButton> : null}<TransportButton label="Canción siguiente" onClick={() => { clearSectionLoop(); onNext?.(); }} disabled={!canNext}>›</TransportButton></div></div>
      {layout === "playback" ? <div className="lg:hidden">
        <div className="min-w-0 border-y border-white/[0.07] bg-emerald-950/[0.06] py-3">
          {currentMusicalPosition ? <div className="mb-2 flex justify-end px-1"><MusicalPositionDisplay position={currentMusicalPosition} /></div> : null}
          <AudioWaveformTimeline buffers={waveformBuffers} currentTime={currentTime} duration={duration} loopSectionId={loopSectionId} mobileHeight={96} onSeek={(value) => void seek(value)} />
          <div className="mt-1 grid grid-cols-[1fr_auto] font-mono text-[0.6875rem] text-zinc-500"><span>{formatTime(currentTime)}</span><span className="text-right">-{formatTime(Math.max(0, duration - currentTime))} · {formatTime(duration)}</span></div>
        </div>
        <div className="sticky top-[calc(4.5rem+env(safe-area-inset-top))] z-20 -mx-3 mt-3 border-y border-white/[0.08] bg-[#090e0d]/95 px-3 py-2 backdrop-blur-xl">
          <div className="flex items-start justify-center gap-4">
            <TransportButton ariaLabel="Canción anterior" label="Canción ant." onClick={() => { clearSectionLoop(); onPrevious?.(); }} disabled={!canPrevious}><SkipBack aria-hidden="true" className="size-5" /></TransportButton>
            <div className="flex flex-col items-center gap-1"><button type="button" onClick={() => void togglePlayback()} disabled={(status === "partial" && !partialAccepted) || (durationWarnings.length > 0 && !durationAccepted) || contextState === "closed"} aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14">{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><span className="text-[0.6875rem] text-emerald-300">{isPlaying ? "Pausa" : "Reproducir"}</span></div>
            {showStop ? <TransportButton label="Detener" onClick={() => pauseAt(0)} disabled={!isPlaying && currentTime === 0}><Square aria-hidden="true" className="size-4 fill-current" /></TransportButton> : null}
            <TransportButton ariaLabel="Canción siguiente" label="Canción sig." onClick={() => { clearSectionLoop(); onNext?.(); }} disabled={!canNext}><SkipForward aria-hidden="true" className="size-5" /></TransportButton>
          </div>
        </div>
        {orderedSections.length ? <SectionNavigation compact currentSection={currentSection} loopSection={loopRegion?.section ?? null} nextTarget={nextSectionTarget} previousTarget={previousSectionTarget} onSeek={(value) => void seek(value)} onToggleLoop={toggleSectionLoop} /> : null}
      </div> : <div className="lg:hidden"><div className="flex items-center gap-3 sm:gap-5"><button type="button" onClick={() => void togglePlayback()} disabled={(status === "partial" && !partialAccepted) || (durationWarnings.length > 0 && !durationAccepted) || contextState === "closed"} aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14">{isPlaying ? <PauseIcon /> : <PlayIcon />}</button>{showStop ? <button type="button" onClick={() => pauseAt(0)} disabled={!isPlaying && currentTime === 0} className="min-h-10 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-30">Stop</button> : null}<div className="min-w-0 flex-1">{currentMusicalPosition ? <div className="mb-2 flex justify-end"><MusicalPositionDisplay compact position={currentMusicalPosition} /></div> : null}<AudioWaveformTimeline buffers={waveformBuffers} currentTime={currentTime} duration={duration} loopSectionId={loopSectionId} onSeek={(value) => void seek(value)} /><div className={`mt-1 font-mono text-xs text-zinc-500 ${showStop ? "grid grid-cols-3" : "flex justify-between"}`}><span>{formatTime(currentTime)}</span>{showStop ? <span className="text-center">-{formatTime(Math.max(0, duration - currentTime))}</span> : null}<span className="text-right">{formatTime(duration)}</span></div></div></div></div>}

      {layout === "playback" ? <MobilePlaybackMixer failures={failures} masterVolume={masterVolume} mixes={mixes} onMasterChange={setMasterVolume} onMixChange={updateMix} stems={playableStems} title={title} /> : <><label className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(8rem,2fr)] items-center gap-3 border-t border-white/[0.07] pt-4 text-sm font-semibold text-zinc-300 lg:hidden">
        Volumen general
        <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} aria-label="Volumen general del multitrack" className="accent-emerald-400" />
      </label>

      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06] lg:hidden">
        {playableStems.map((stem, index) => {
          const mix = mixes[index];
          return (
            <div key={stem.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_minmax(10rem,1.4fr)]">
              <p className="truncate text-sm font-semibold text-zinc-200">{stem.name}</p>
              <button type="button" onClick={() => updateMix(index, { muted: !mix.muted })} aria-label={`${mix.muted ? "Activar" : "Silenciar"} ${stem.name}`} aria-pressed={mix.muted} className={`grid size-10 place-items-center rounded-full text-xs font-bold ${mix.muted ? "bg-rose-400 text-zinc-950" : "bg-white/[0.05] text-zinc-400"}`}>M</button>
              <button type="button" onClick={() => updateMix(index, { solo: !mix.solo })} aria-label={`${mix.solo ? "Desactivar solo" : "Solo"} ${stem.name}`} aria-pressed={mix.solo} className={`grid size-10 place-items-center rounded-full text-xs font-bold ${mix.solo ? "bg-amber-300 text-zinc-950" : "bg-white/[0.05] text-zinc-400"}`}>S</button>
              <input type="range" min={0} max={1} step={0.01} value={mix.volume} onChange={(event) => updateMix(index, { volume: Number(event.target.value) })} aria-label={`Volumen de ${stem.name}`} className="col-span-3 w-full accent-emerald-400 sm:col-span-1" />
            </div>
          );
        })}
        {failures.map((failure) => <div key={failure.stem.id} className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 opacity-60"><p className="truncate text-sm font-semibold text-zinc-400">{failure.stem.name}</p><span className="text-xs text-rose-300">No disponible</span></div>)}
      </div></>}
      <div className="mt-6 hidden min-w-0 max-w-full overflow-x-auto border-y border-white/[0.07] bg-black/10 lg:flex"><div className={`flex w-max min-w-full items-stretch ${layout === "playback" ? "justify-center" : "justify-start"}`}>{playableStems.map((stem, index) => { const mix = mixes[index]; const displayName = compactStemName(stem.name, title); return <div key={stem.id} className={`flex shrink-0 flex-col items-center border-r border-white/[0.06] py-4 ${layout === "playback" ? "w-[clamp(82px,8vw,106px)] px-3" : "w-[clamp(76px,7vw,92px)] px-2"}`}>{layout === "playback" ? <StemChannelHeader label={displayName} title={stem.name} /> : <p title={stem.name} className="h-8 max-w-full truncate text-center text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-zinc-300">{displayName}</p>}<input type="range" min={0} max={1} step={0.01} value={mix.volume} onChange={(event) => updateMix(index, { volume: Number(event.target.value) })} aria-label={`Volumen de ${stem.name}`} className="my-3 h-40 w-5 cursor-pointer accent-emerald-400 [direction:rtl] [writing-mode:vertical-lr]" /><span className="font-mono text-[0.6875rem] text-zinc-500">{volumeToDb(mix.volume)}</span><div className="mt-3 flex gap-1.5"><button type="button" onClick={() => updateMix(index, { solo: !mix.solo })} aria-pressed={mix.solo} className={`grid size-8 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.solo ? "bg-amber-300 text-black" : "bg-white/[0.05] text-zinc-500"}`}>S</button><button type="button" onClick={() => updateMix(index, { muted: !mix.muted })} aria-pressed={mix.muted} className={`grid size-8 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.muted ? "bg-rose-400 text-black" : "bg-white/[0.05] text-zinc-500"}`}>M</button></div></div>})}{failures.map((failure) => { const displayName = compactStemName(failure.stem.name, title); return <div key={failure.stem.id} className="flex w-[76px] shrink-0 flex-col items-center border-r border-white/[0.06] px-2 py-4 opacity-50">{layout === "playback" ? <StemChannelHeader label={displayName} title={failure.stem.name} /> : <p className="h-8 max-w-full truncate text-center text-[0.6875rem] font-bold uppercase text-zinc-500">{displayName}</p>}<div className="my-3 grid h-40 place-items-center text-xs text-rose-300 [writing-mode:vertical-lr]">No disponible</div></div>})}<div className={`flex shrink-0 flex-col items-center border-l border-emerald-400/20 bg-emerald-950/[0.08] py-4 ${layout === "playback" ? "w-[106px] px-3" : "w-[92px] px-2"}`}>{layout === "playback" ? <StemChannelHeader label="Master" title="Master" master /> : <p className="h-8 text-center text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-emerald-300">Master</p>}<input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} aria-label="Volumen general del multitrack" className="my-3 h-40 w-5 cursor-pointer accent-emerald-400 [direction:rtl] [writing-mode:vertical-lr]" /><span className="font-mono text-[0.6875rem] text-emerald-300/70">{volumeToDb(masterVolume)}</span></div></div></div>
      <div className="mt-4 border-t border-white/[0.06] pt-3"><button type="button" onClick={() => { const next = !showDiagnostics; setShowDiagnostics(next); if (next) void getAudioCacheDiagnostics().then(setCacheDiagnostics); }} className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">••• Diagnóstico</button>{showDiagnostics ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs"><Diagnostic label="Estado" value={engineHealth(status, failures.length, durationWarnings.length, partialAccepted, durationAccepted)} /><Diagnostic label="Solicitadas" value={String(diagnostics?.requestedStems ?? stems.length)} /><Diagnostic label="Descargadas" value={String(diagnostics?.fetchedStems ?? 0)} /><Diagnostic label="Decodificadas" value={String(diagnostics?.decodedStems ?? 0)} /><Diagnostic label="Carga" value={formatMilliseconds(diagnostics?.readyMs)} /><Diagnostic label="Descarga" value={formatMilliseconds(diagnostics?.downloadMs)} /><Diagnostic label="Decodificación" value={formatMilliseconds(diagnostics?.decodeMs)} /><Diagnostic label="Cache" value={diagnostics?.cacheHit ? "Sí" : "No"} /><Diagnostic label="Tipo" value={diagnostics?.loadMode ?? "—"} /><Diagnostic label="AudioContext" value={contextState} /><Diagnostic label="Sample rates" value={engineRef.current?.sampleRates.join(", ") || "—"} /><Diagnostic label="Canciones cacheadas" value={String(cacheDiagnostics?.songs ?? "—")} /><Diagnostic label="Stems cacheados" value={String(cacheDiagnostics?.stems ?? "—")} /><Diagnostic label="Audio decodificado" value={formatTime(cacheDiagnostics?.decodedDurationSeconds ?? 0)} /><Diagnostic label="PCM estimado" value={formatBytes(cacheDiagnostics?.approximateBytes)} /></dl> : null}</div>
      {layout === "song-detail" && showPlaybackAuthoring && stems[0]?.song_key_id ? <div role="presentation" className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="playback-authoring-title" className="flex max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-2xl flex-col rounded-t-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl"><header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3"><div><p className="text-[0.625rem] font-bold uppercase tracking-[0.15em] text-emerald-400">Arreglo</p><h2 id="playback-authoring-title" className="mt-0.5 text-lg font-bold text-white">Configurar Playback</h2></div><button type="button" onClick={() => setShowPlaybackAuthoring(false)} aria-label="Cerrar configuración de Playback" className="grid size-11 place-items-center rounded-lg text-xl text-zinc-500 hover:bg-white/[0.05] hover:text-white">×</button></header><div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"><MusicalGridEditor currentTime={currentTime} fallbackBpm={bpm ?? null} fallbackTimeSignature={timeSignature ?? null} grid={musicalGrid} onSaved={setMusicalGrid} songKeyId={stems[0].song_key_id} /><section className="border-y border-white/[0.07] bg-white/[0.015]"><div className="flex items-center justify-between gap-3 px-3 py-2.5"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Secciones</p><p className="mt-0.5 text-[0.6875rem] text-zinc-600">Ordenadas por tiempo</p></div><button type="button" onClick={openNewSection} className="min-h-9 rounded-lg border border-emerald-400/25 px-3 text-xs font-semibold text-emerald-300">+ Agregar sección</button></div>{orderedSections.length ? <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">{orderedSections.map((section) => <div key={section.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2"><span className="font-mono text-xs text-zinc-500">{formatSectionTimestamp(section.start_seconds)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-zinc-200">{section.label}</p><p className="text-[0.6875rem] text-zinc-600">{sectionTypeLabel(section.section_type)}{musicalGrid ? ` · ${sectionMusicalLabel(section, musicalGrid)}` : ""}</p></div><div className="flex items-center gap-1"><button type="button" onClick={() => openSectionEditor(section)} aria-label={`Editar sección ${section.label}`} className="min-h-9 rounded-md px-2 text-xs font-semibold text-zinc-400 hover:bg-white/[0.05] hover:text-white">Editar</button><button type="button" onClick={() => void deleteSection(section)} aria-label={`Eliminar sección ${section.label}`} className="min-h-9 rounded-md px-2 text-xs font-semibold text-rose-300/75 hover:bg-rose-400/[0.07] hover:text-rose-200">Eliminar</button></div></div>)}</div> : <p className="border-t border-white/[0.06] px-3 py-4 text-sm text-zinc-600">Esta tonalidad todavía no tiene secciones.</p>}</section></div></section></div> : null}
      {sectionEditor ? <SectionEditorDialog editor={sectionEditor} error={sectionEditorError} saving={savingSection} onChange={setSectionEditor} onClose={() => { if (!savingSection) setSectionEditor(null); }} onSave={() => void saveSection()} /> : null}
    </div></SongSectionsProvider></MusicalGridProvider>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatSectionTimestamp(value: number) { if (!Number.isFinite(value) || value < 0) return "0:00.000"; const milliseconds = Math.round(value * 1000); const minutes = Math.floor(milliseconds / 60000); const seconds = Math.floor((milliseconds % 60000) / 1000); const fraction = milliseconds % 1000; return `${minutes}:${String(seconds).padStart(2, "0")}.${String(fraction).padStart(3, "0")}`; }
function parseSectionTimestamp(value: string) { const trimmed = value.trim(); const timestamp = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/); if (timestamp) { const seconds = Number(timestamp[2]); if (seconds >= 60) return null; return Number((Number(timestamp[1]) * 60 + seconds + Number(`0.${(timestamp[3] ?? "").padEnd(3, "0") || "0"}`)).toFixed(3)); } const rawSeconds = Number(trimmed); return Number.isFinite(rawSeconds) && rawSeconds >= 0 ? Number(rawSeconds.toFixed(3)) : null; }
function buildSectionEditorState(id: string | null, label: string, sectionType: SongSection["section_type"], seconds: number, grid: MusicalGrid | null, snap: GridSnap): SectionEditorState { const position = grid ? secondsToMusicalPosition(seconds, grid) : null; return { id, label, sectionType, time: formatSectionTimestamp(seconds), bar: position && !position.preRoll ? String(position.bar) : "1", beat: position && !position.preRoll ? String(position.beat) : "1", fraction: position && !position.preRoll ? String(position.fraction) : "0", snap }; }
function sectionTypeLabel(value: SongSection["section_type"]) { return SECTION_TYPES.find((type) => type.value === value)?.label ?? "Sin tipo"; }
function sectionMusicalLabel(section: SongSection, grid: MusicalGrid) { const position = section.bar_number && section.beat_number ? { bar: section.bar_number, beat: section.beat_number, fraction: section.beat_fraction ?? 0, preRoll: false as const } : secondsToMusicalPosition(section.start_seconds, grid); return position.preRoll ? "Pre-roll" : `C${position.bar} · B${position.beat}${position.fraction ? ` + ${position.fraction}` : ""}`; }

function MusicalPositionDisplay({ compact = false, position }: { compact?: boolean; position: MusicalPosition }) {
  if (position.preRoll) return <span className="font-sans text-[0.625rem] font-bold uppercase tracking-[0.14em] text-zinc-500">Pre-roll</span>;
  return <span className={`inline-flex items-baseline whitespace-nowrap ${compact ? "gap-1.5" : "gap-2"}`}><span className="font-sans text-[0.625rem] font-bold uppercase tracking-[0.12em] text-zinc-300">Compás {position.bar} · Beat {position.beat}</span><span className="font-mono text-[0.625rem] text-zinc-600">+{position.fraction.toFixed(2)} beat</span></span>;
}

const SECTION_TYPES: { label: string; value: SongSection["section_type"] }[] = [
  { label: "Sin tipo", value: null }, { label: "Intro", value: "intro" }, { label: "Verso", value: "verse" }, { label: "Coro", value: "chorus" }, { label: "Pre-coro", value: "prechorus" }, { label: "Puente", value: "bridge" }, { label: "Instrumental", value: "instrumental" }, { label: "Outro", value: "outro" }, { label: "Otro", value: "other" },
];

function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function formatMilliseconds(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${(value / 1000).toFixed(2)} s`; }
function formatBytes(value: number | null | undefined) { if (value === null || value === undefined) return "—"; return `≈ ${(value / 1024 / 1024).toFixed(1)} MB`; }
function volumeToDb(value: number) { return value <= 0.001 ? "-∞" : `${(20 * Math.log10(value)).toFixed(1)} dB`; }
function compactStemName(name: string, songTitle: string) { const escaped = songTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const compact = name.replace(new RegExp(`^${escaped}(?:\\s*\\([^)]*\\))?\\s*[-–—:]?\\s*`, "i"), "").trim(); return compact && compact.length < name.length ? compact : name; }
function StemChannelHeader({ label, master = false, title }: { label: string; master?: boolean; title: string }) { const Icon = master ? Volume2 : getStemDisplayIcon(label); return <div title={title} className={`flex h-8 max-w-full flex-col items-center justify-between ${master ? "text-emerald-300" : "text-zinc-400"}`}><Icon aria-hidden="true" className="size-[1.0625rem] shrink-0" strokeWidth={1.6} /><span className="block max-w-full truncate text-center text-[0.625rem] font-bold uppercase tracking-[0.1em]">{label}</span></div>; }
function getStemDisplayIcon(name: string): LucideIcon { const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); if (/click|metronome/.test(normalized)) return Timer; if (/guia|guide|cue/.test(normalized)) return Mic2; if (/drum|perc|percussion/.test(normalized)) return Drum; if (/bass|\begs?\b|electric guitar|\bgtrs?\b|\bag\b|acoustic guitar|guitar/.test(normalized)) return Guitar; if (/piano|keys?|keyboard/.test(normalized)) return KeyboardMusic; if (/synth/.test(normalized)) return SlidersHorizontal; if (/\bbgvs?\b|background vocals?|vocals?/.test(normalized)) return Users; if (/tracks?|loops?|layers?/.test(normalized)) return Layers3; return AudioWaveform; }
function engineHealth(status: "loading" | "ready" | "partial" | "error", failures: number, durationWarnings: number, partialAccepted: boolean, durationAccepted: boolean) { if (status === "error") return "Error fatal"; if (status === "loading") return "Cargando"; if ((failures && !partialAccepted) || (durationWarnings && !durationAccepted)) return "Requiere atención"; if (failures || durationWarnings) return "Advertencia aceptada"; return "Saludable"; }
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
function Diagnostic({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-600">{label}</dt><dd className="mt-0.5 truncate font-medium text-zinc-300">{value}</dd></div>; }
function OperationalMetric({ label, value }: { label: string; value: string }) { return <div className="min-w-32 border border-white/[0.07] bg-black/15 px-4 py-3 text-right"><p className="text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-zinc-600">{label}</p><p className="mt-1 font-mono text-2xl text-zinc-100">{value}</p></div>; }
const MobilePlaybackMixer = memo(function MobilePlaybackMixer({ failures, masterVolume, mixes, onMasterChange, onMixChange, stems, title }: { failures: StemLoadFailure[]; masterVolume: number; mixes: StemMix[]; onMasterChange: (value: number) => void; onMixChange: (index: number, patch: Partial<StemMix>) => void; stems: PublicSongStem[]; title: string }) {
  return <section className="mt-4 lg:hidden" aria-label="Mezclador"><div className="flex items-center justify-between border-b border-white/[0.07] pb-2"><h3 className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-zinc-400">Mezclador</h3><span className="text-[0.625rem] text-zinc-600">{stems.length} canales</span></div><label className="grid h-12 grid-cols-[1.25rem_4.5rem_minmax(0,1fr)_3.25rem] items-center gap-2 border-b border-emerald-400/15 bg-emerald-950/[0.1] px-1"><Volume2 aria-hidden="true" className="size-[1.0625rem] text-emerald-300" strokeWidth={1.7} /><span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-emerald-300">Master</span><input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(event) => onMasterChange(Number(event.target.value))} aria-label="Volumen general del multitrack" className="h-11 min-w-0 w-full accent-emerald-400" /><span className="text-right font-mono text-[0.625rem] text-emerald-300/70">{volumeToDb(masterVolume)}</span></label><div className="divide-y divide-white/[0.055] border-b border-white/[0.07]">{stems.map((stem, index) => { const mix = mixes[index]; const label = compactStemName(stem.name, title); const Icon = getStemDisplayIcon(label); return <div key={stem.id} className="grid h-14 grid-cols-[1.25rem_minmax(3.5rem,0.7fr)_2.75rem_2.75rem_minmax(5rem,1.5fr)] items-center gap-1.5 px-1"><Icon aria-hidden="true" className="size-4 text-zinc-500" strokeWidth={1.6} /><span title={stem.name} className="truncate text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-zinc-300">{label}</span><button type="button" onClick={() => onMixChange(index, { muted: !mix.muted })} aria-label={`${mix.muted ? "Activar" : "Silenciar"} ${stem.name}`} aria-pressed={mix.muted} className={`grid size-11 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.muted ? "bg-rose-400 text-zinc-950" : "bg-white/[0.045] text-zinc-500"}`}>M</button><button type="button" onClick={() => onMixChange(index, { solo: !mix.solo })} aria-label={`${mix.solo ? "Desactivar solo" : "Solo"} ${stem.name}`} aria-pressed={mix.solo} className={`grid size-11 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.solo ? "bg-amber-300 text-zinc-950" : "bg-white/[0.045] text-zinc-500"}`}>S</button><input type="range" min={0} max={1} step={0.01} value={mix.volume} onChange={(event) => onMixChange(index, { volume: Number(event.target.value) })} aria-label={`Volumen de ${stem.name}`} className="h-11 min-w-0 w-full accent-emerald-400" /></div>; })}{failures.map((failure) => { const label = compactStemName(failure.stem.name, title); const Icon = getStemDisplayIcon(label); return <div key={failure.stem.id} className="grid h-14 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 px-1 opacity-55"><Icon aria-hidden="true" className="size-4 text-zinc-600" /><span className="truncate text-[0.6875rem] font-bold uppercase text-zinc-500">{label}</span><span className="text-[0.625rem] text-rose-300">No disponible</span></div>; })}</div></section>;
});
function SectionNavigation({ compact = false, currentSection, loopSection, nextTarget, onSeek, onToggleLoop, previousTarget }: { compact?: boolean; currentSection: SongSection | null; loopSection: SongSection | null; nextTarget: number | null; onSeek: (time: number) => void; onToggleLoop: () => void; previousTarget: number | null }) { return <div className={compact ? "mt-2" : "mx-auto mt-3 max-w-sm"}><div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-center gap-2"><button type="button" onClick={() => previousTarget !== null && onSeek(previousTarget)} disabled={previousTarget === null} aria-label="Ir a sección anterior" title="Sección anterior · Alt + ←" className="grid size-10 place-items-center rounded-lg border border-white/[0.08] text-lg text-zinc-400 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-25">‹</button><div className="min-w-0 text-center"><p className="text-[0.5625rem] font-bold uppercase tracking-[0.14em] text-zinc-600">Sección actual</p><p className="truncate text-xs font-bold uppercase tracking-[0.1em] text-zinc-300">{currentSection?.label ?? "Antes del inicio"}</p></div><button type="button" onClick={() => nextTarget !== null && onSeek(nextTarget)} disabled={nextTarget === null} aria-label="Ir a sección siguiente" title="Sección siguiente · Alt + →" className="grid size-10 place-items-center rounded-lg border border-white/[0.08] text-lg text-zinc-400 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-25">›</button></div><button type="button" onClick={onToggleLoop} disabled={!currentSection} aria-pressed={Boolean(loopSection)} aria-label={loopSection ? `Desactivar loop de ${loopSection.label}` : currentSection ? `Activar loop de ${currentSection.label}` : "Activar loop de sección"} title="Loop de sección · Alt + L" className={`mx-auto mt-1.5 flex min-h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 text-[0.625rem] font-bold uppercase tracking-[0.1em] transition-colors disabled:cursor-not-allowed disabled:opacity-25 ${loopSection ? "border-emerald-400/35 bg-emerald-400/[0.1] text-emerald-300" : "border-white/[0.08] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300"}`}><span aria-hidden="true">↻</span><span className="truncate">{loopSection ? loopSection.label : "Loop"}</span></button></div>; }
function MusicalField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) { return <label className="text-xs font-semibold text-zinc-500">{label}<input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" className="mt-1 min-h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 font-mono text-sm text-white outline-none focus:border-emerald-400/50" /></label>; }
function SectionEditorDialog({ editor, error, onChange, onClose, onSave, saving }: { editor: SectionEditorState; error: string | null; onChange: (editor: SectionEditorState) => void; onClose: () => void; onSave: () => void; saving: boolean }) {
  const grid = useMusicalGrid();
  function changeTime(time: string) { const seconds = parseSectionTimestamp(time); const position = grid && seconds !== null ? secondsToMusicalPosition(seconds, grid) : null; onChange({ ...editor, time, ...(position && !position.preRoll ? { bar: String(position.bar), beat: String(position.beat), fraction: String(position.fraction) } : {}) }); }
  function changeMusicalPosition(field: "bar" | "beat" | "fraction", value: string) { const next = { ...editor, [field]: value }; const bar = Number(next.bar); const beat = Number(next.beat); const fraction = Number(next.fraction || 0); if (grid && Number.isInteger(bar) && bar >= 1 && Number.isInteger(beat) && beat >= 1 && beat <= grid.beatsPerBar && Number.isFinite(fraction) && fraction >= 0 && fraction < 1) next.time = formatSectionTimestamp(musicalPositionToSeconds({ bar, beat, fraction }, grid)); onChange(next); }
  function changeSnap(snap: GridSnap) { if (!grid) return; const seconds = parseSectionTimestamp(editor.time); const snapped = seconds === null ? grid.gridOffsetSeconds : snapSecondsToGrid(seconds, grid, snap); onChange(buildSectionEditorState(editor.id, editor.label, editor.sectionType, snapped, grid, snap)); }
  return <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/75 px-0 pt-12 backdrop-blur-sm sm:items-center sm:px-4 sm:py-8"><section role="dialog" aria-modal="true" aria-labelledby="section-editor-title" className="w-full max-w-md rounded-t-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/60 sm:rounded-3xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Sección</p><h2 id="section-editor-title" className="mt-1 text-xl font-bold text-white">{editor.id ? "Editar sección" : "Agregar sección"}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Cerrar" className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-40">×</button></div><form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); onSave(); }}><label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">Nombre</span><input autoFocus value={editor.label} onChange={(event) => onChange({ ...editor, label: event.target.value })} placeholder="CORO" className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/50" /></label><label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">Tipo</span><select value={editor.sectionType ?? ""} onChange={(event) => onChange({ ...editor, sectionType: (event.target.value || null) as SongSection["section_type"] })} className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 text-sm text-white outline-none focus:border-emerald-400/50">{SECTION_TYPES.map((type) => <option key={type.value ?? "none"} value={type.value ?? ""}>{type.label}</option>)}</select></label>{grid ? <><div><span className="mb-1.5 block text-xs font-semibold text-zinc-400">Snap</span><div className="grid grid-cols-3 gap-1 rounded-xl border border-white/10 bg-zinc-950/70 p-1">{(["bar", "beat", "off"] as GridSnap[]).map((snap) => <button key={snap} type="button" onClick={() => changeSnap(snap)} className={`min-h-9 rounded-lg text-xs font-semibold ${editor.snap === snap ? "bg-emerald-400 text-zinc-950" : "text-zinc-500"}`}>{snap === "bar" ? "Compás" : snap === "beat" ? "Beat" : "Off"}</button>)}</div></div><div className="grid grid-cols-3 gap-2"><MusicalField label="Compás" value={editor.bar} onChange={(value) => changeMusicalPosition("bar", value)} /><MusicalField label="Beat" value={editor.beat} onChange={(value) => changeMusicalPosition("beat", value)} /><MusicalField label="Fracción" value={editor.fraction} onChange={(value) => changeMusicalPosition("fraction", value)} /></div></> : null}<label className="block"><span className="mb-1.5 block text-xs font-semibold text-zinc-400">Tiempo</span><input inputMode="decimal" value={editor.time} onChange={(event) => changeTime(event.target.value)} placeholder="1:24.500" aria-describedby="section-time-help" className="min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950/70 px-3 font-mono text-base text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/50" /><span id="section-time-help" className="mt-1.5 block text-[0.6875rem] text-zinc-600">Formato m:ss o m:ss.xxx{grid ? " · sincronizado con el grid" : ""}</span></label>{error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-40">Cancelar</button><button type="submit" disabled={saving} className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-40">{saving ? "Guardando…" : "Guardar"}</button></div></form></section></div>;
}
function TransportButton({ ariaLabel, children, disabled, label, onClick }: { ariaLabel?: string; children: React.ReactNode; disabled: boolean; label: string; onClick?: () => void }) { return <div className="flex flex-col items-center gap-1"><button type="button" aria-label={ariaLabel ?? label} onClick={onClick} disabled={disabled} className="grid size-11 place-items-center rounded-full border border-white/[0.09] text-lg text-zinc-400 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-25">{children}</button><span className="whitespace-nowrap text-[0.6875rem] text-zinc-500">{label}</span></div>; }

function PlayIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current"><path d="M8 5.7a1 1 0 0 1 1.53-.85l9 5.3a1 1 0 0 1 0 1.7l-9 5.3A1 1 0 0 1 8 16.3V5.7Z" /></svg>;
}

function PauseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-current"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>;
}
