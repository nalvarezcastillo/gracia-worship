"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAudioCacheDiagnostics, loadStemBundle, retryStemBundle, type BundleDiagnostics, type PublicSongStem, type StemBundleResult, type StemLoadFailure } from "@/lib/audio-buffer-cache";
export type { PublicSongStem } from "@/lib/audio-buffer-cache";

type StemMix = {
  muted: boolean;
  solo: boolean;
  volume: number;
};

export function MultitrackPlayer({ active = true, canNext = false, canPrevious = false, onNext, onPrevious, showStop = false, stems, title }: { active?: boolean; canNext?: boolean; canPrevious?: boolean; onNext?: () => void; onPrevious?: () => void; showStop?: boolean; stems: PublicSongStem[]; title: string }) {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<AudioBuffer[]>([]);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const stemGainsRef = useRef<GainNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const operationRef = useRef(0);
  const transitionRef = useRef(false);
  const playingRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [failures, setFailures] = useState<StemLoadFailure[]>([]);
  const [partialAccepted, setPartialAccepted] = useState(false);
  const [playableStems, setPlayableStems] = useState<PublicSongStem[]>(stems);
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

  const stopSources = useCallback(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // A source can already be stopped when playback reaches the end.
      }
      source.disconnect();
    }
    sourcesRef.current = [];
  }, []);

  const stopAnimation = useCallback(() => {
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }, []);

  const pauseAt = useCallback((time: number) => {
    operationRef.current += 1;
    stopSources();
    stopAnimation();
    offsetRef.current = time;
    setCurrentTime(time);
    playingRef.current = false;
    setIsPlaying(false);
  }, [stopAnimation, stopSources]);

  const updateTimeline = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    const nextTime = Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current));
    offsetRef.current = nextTime;
    setCurrentTime(nextTime);
    if (nextTime >= duration) {
      pauseAt(duration);
      return;
    }
    animationRef.current = requestAnimationFrame(updateTimeline);
  }, [duration, pauseAt]);

  const startSources = useCallback((offset: number) => {
    const context = contextRef.current;
    if (!context || !masterGainRef.current) return;
    stopSources();
    const sharedStartTime = context.currentTime + 0.03;
    const nextSources = buffersRef.current.flatMap((buffer, index) => {
      if (offset >= buffer.duration) return [];
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(stemGainsRef.current[index]);
      source.start(sharedStartTime, offset);
      return [source];
    });
    sourcesRef.current = nextSources;
    startedAtRef.current = sharedStartTime - offset;
    offsetRef.current = offset;
    setCurrentTime(offset);
    playingRef.current = true;
    setIsPlaying(true);
    stopAnimation();
    animationRef.current = requestAnimationFrame(updateTimeline);
  }, [stopAnimation, stopSources, updateTimeline]);

  useLayoutEffect(() => {
    let current = true;
    const AudioContextConstructor = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setStatus("error");
      return;
    }
    const context = new AudioContextConstructor();
    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    contextRef.current = context;
    masterGainRef.current = masterGain;
    offsetRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    playingRef.current = false;
    setIsPlaying(false);
    setStatus("loading");
    setFailures([]);
    setPartialAccepted(false);
    setDurationAccepted(false);
    setEngineMessage(null);
    setContextState(context.state);
    const onStateChange = () => { setContextState(context.state); if (context.state === "closed") setEngineMessage("El motor de audio se cerró inesperadamente."); else if (context.state !== "running" && playingRef.current) setEngineMessage("El navegador pausó el motor de audio."); };
    context.addEventListener("statechange", onStateChange);

    void loadStemBundle(context, stems, { label: title, mode: "foreground" }).then(({ diagnostics: nextDiagnostics, failures: nextFailures, loaded }) => {
      if (!current) return;
      const buffers = loaded.map((result) => result.buffer);
      buffersRef.current = buffers;
      setPlayableStems(loaded.map((result) => result.stem));
      setMixes(loaded.map(() => ({ muted: false, solo: false, volume: 1 })));
      setFailures(nextFailures);
      setDiagnostics(nextDiagnostics);
      if (nextFailures.length) console.warn("Playback stem load failures:", nextFailures.map((failure) => ({ message: failure.message, stem: failure.stem.name })));
      stemGainsRef.current = buffers.map(() => {
        const gain = context.createGain();
        gain.connect(masterGain);
        return gain;
      });
      const canonicalDuration = median(buffers.map((buffer) => buffer.duration));
      setDuration(canonicalDuration);
      setDurationWarnings(loaded.filter((item) => Math.abs(item.buffer.duration - canonicalDuration) > 0.5).map((item) => `${item.stem.name} (${formatTime(item.buffer.duration)})`));
      setStatus(!buffers.length ? "error" : nextFailures.length ? "partial" : "ready");
    }).catch((error) => {
      if (!current) return;
      console.error("Unable to load multitrack stems:", error);
      setStatus("error");
    });

    return () => {
      current = false;
      context.removeEventListener("statechange", onStateChange);
      stopSources();
      stopAnimation();
      for (const gain of stemGainsRef.current) gain.disconnect();
      stemGainsRef.current = [];
      masterGain.disconnect();
      buffersRef.current = [];
      contextRef.current = null;
      masterGainRef.current = null;
      void context.close();
    };
  }, [stems, stopAnimation, stopSources, title]);

  useEffect(() => {
    const context = contextRef.current;
    const masterGain = masterGainRef.current;
    if (context && masterGain) masterGain.gain.setValueAtTime(masterVolume, context.currentTime);
  }, [masterVolume]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;
    const hasSolo = mixes.some((mix) => mix.solo);
    mixes.forEach((mix, index) => {
      const gain = stemGainsRef.current[index];
      if (!gain) return;
      const value = mix.muted || (hasSolo && !mix.solo) ? 0 : mix.volume;
      gain.gain.setValueAtTime(value, context.currentTime);
    });
  }, [mixes]);

  useEffect(() => {
    const context = contextRef.current;
    if (active || !isPlaying || !context) return;
    const pausedTime = Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current));
    pauseAt(pausedTime);
  }, [active, duration, isPlaying, pauseAt]);

  useEffect(() => {
    const reconcile = () => {
      const context = contextRef.current; if (!context || document.visibilityState !== "visible") return;
      setContextState(context.state);
      if (context.state !== "running" && playingRef.current) { pauseAt(Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current))); setEngineMessage("El navegador pausó el motor de audio."); }
    };
    document.addEventListener("visibilitychange", reconcile); window.addEventListener("pageshow", reconcile);
    return () => { document.removeEventListener("visibilitychange", reconcile); window.removeEventListener("pageshow", reconcile); };
  }, [duration, pauseAt]);

  async function togglePlayback() {
    const context = contextRef.current;
    if (!context || (status !== "ready" && !(status === "partial" && partialAccepted)) || (durationWarnings.length > 0 && !durationAccepted) || duration <= 0 || transitionRef.current) return;
    transitionRef.current = true;
    if (playingRef.current) {
      const pausedTime = Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current));
      pauseAt(pausedTime);
      transitionRef.current = false;
      return;
    }
    try { await context.resume(); setContextState(context.state); if (context.state !== "running") throw new Error("AudioContext did not resume"); setEngineMessage(null); startSources(offsetRef.current >= duration ? 0 : offsetRef.current); } catch (error) { console.error("Unable to resume Playback audio:", error); setEngineMessage("El navegador pausó el motor de audio. Toca Reanudar audio para continuar."); } finally { transitionRef.current = false; }
  }

  async function seek(value: number) {
    const nextTime = Math.min(duration, Math.max(0, value));
    const operation = ++operationRef.current;
    offsetRef.current = nextTime;
    setCurrentTime(nextTime);
    if (!isPlaying) return;
    const context = contextRef.current;
    if (!context) return;
    stopSources();
    stopAnimation();
    await context.resume();
    if (operation !== operationRef.current) return;
    startSources(nextTime >= duration ? 0 : nextTime);
  }

  function updateMix(index: number, patch: Partial<StemMix>) {
    setMixes((current) => current.map((mix, mixIndex) => mixIndex === index ? { ...mix, ...patch } : mix));
  }

  async function resumeAudio() { const context = contextRef.current; if (!context || context.state === "closed") return; try { await context.resume(); setContextState(context.state); if (context.state === "running") setEngineMessage(null); } catch (error) { console.error("Unable to recover AudioContext:", error); setEngineMessage("No se pudo reanudar el motor de audio."); } }

  async function retryLoad() {
    const context = contextRef.current; if (!context || status === "loading") return; pauseAt(0); setStatus("loading"); setEngineMessage(null);
    try {
      const result = await retryStemBundle(context, stems, { label: title, mode: "foreground" }); installBundle(result);
    } catch (error) { console.error("Unable to retry Playback stems:", error); setStatus("error"); }
  }

  function installBundle({ diagnostics: nextDiagnostics, failures: nextFailures, loaded }: StemBundleResult) {
    for (const gain of stemGainsRef.current) gain.disconnect();
    const context = contextRef.current; const masterGain = masterGainRef.current; if (!context || !masterGain) return;
    const buffers = loaded.map((item) => item.buffer); buffersRef.current = buffers; setPlayableStems(loaded.map((item) => item.stem)); setFailures(nextFailures); setDiagnostics(nextDiagnostics);
    setMixes(loaded.map(() => ({ muted: false, solo: false, volume: 1 }))); stemGainsRef.current = buffers.map(() => { const gain = context.createGain(); gain.connect(masterGain); return gain; });
    const canonical = median(buffers.map((buffer) => buffer.duration)); setDuration(canonical); setDurationWarnings(loaded.filter((item) => Math.abs(item.buffer.duration - canonical) > 0.5).map((item) => `${item.stem.name} (${formatTime(item.buffer.duration)})`)); setDurationAccepted(false); setPartialAccepted(false); setStatus(!buffers.length ? "error" : nextFailures.length ? "partial" : "ready");
  }

  if (status === "loading") return <p role="status" className="py-5 text-center text-sm text-zinc-400">Cargando pistas…</p>;
  if (status === "error") return <div role="alert" className="py-5 text-center text-sm text-rose-300"><p>No se pudieron cargar las pistas.</p>{failures.length ? <p className="mt-1 text-xs text-zinc-500">{failures.map((failure) => failure.stem.name).join(", ")}</p> : null}<button type="button" onClick={() => void retryLoad()} className="mt-3 min-h-9 rounded-lg border border-rose-300/25 px-3 text-xs font-semibold">Reintentar</button></div>;

  return (
    <div>
      <div role="status" className={`mb-3 text-xs font-semibold lg:text-right lg:uppercase lg:tracking-[0.14em] ${status === "partial" ? "text-amber-300" : "text-emerald-400"}`}>{status === "ready" ? "Listo" : partialAccepted ? `Listo con ${failures.length} ${failures.length === 1 ? "pista no disponible" : "pistas no disponibles"}` : `Carga parcial · ${failures.length} de ${stems.length} pistas fallaron`}</div>
      {status === "partial" && !partialAccepted ? <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-zinc-400"><p>No disponibles: {failures.map((failure) => failure.stem.name).join(", ")}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => setPartialAccepted(true)} className="min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold text-amber-200">Continuar con las pistas disponibles</button><button type="button" onClick={() => void retryLoad()} className="min-h-9 rounded-lg border border-white/10 px-3 font-semibold">Reintentar</button></div></div> : null}
      {durationWarnings.length && !durationAccepted ? <div className="mb-4 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-zinc-400"><p className="font-semibold text-amber-200">Duraciones de pistas no coinciden.</p><p className="mt-1">{durationWarnings.join(", ")}</p><button type="button" onClick={() => setDurationAccepted(true)} className="mt-2 min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold text-amber-200">Continuar con esta duración</button></div> : null}
      {engineMessage ? <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs text-amber-100"><span>{engineMessage}</span>{contextState !== "closed" ? <button type="button" onClick={() => void resumeAudio()} className="min-h-9 rounded-lg border border-amber-300/25 px-3 font-semibold">Reanudar audio</button> : null}</div> : null}
      <div className="hidden lg:block"><div className="rounded-xl border border-white/[0.07] bg-emerald-950/[0.08] px-5 py-5"><input type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration)} onChange={(event) => void seek(Number(event.target.value))} aria-label={`Posición del multitrack de ${title}`} className="audio-progress h-2 w-full" style={{ "--audio-progress": `${duration > 0 ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties} /><div className="mt-3 grid grid-cols-3 font-mono text-xs text-zinc-500"><span>{formatTime(currentTime)} elapsed</span><span className="text-center">-{formatTime(Math.max(0, duration - currentTime))} remaining</span><span className="text-right">{formatTime(duration)} total</span></div></div><div className="mt-4 flex items-center justify-center gap-3"><button type="button" onClick={onPrevious} disabled={!canPrevious} className={desktopTransportClass} aria-label="Canción anterior">‹</button><button type="button" onClick={() => void togglePlayback()} disabled={(status === "partial" && !partialAccepted) || (durationWarnings.length > 0 && !durationAccepted) || contextState === "closed"} className="grid size-14 place-items-center rounded-full bg-emerald-400 text-zinc-950 hover:bg-emerald-300 disabled:opacity-35" aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}>{isPlaying ? <PauseIcon /> : <PlayIcon />}</button>{showStop ? <button type="button" onClick={() => pauseAt(0)} disabled={!isPlaying && currentTime === 0} className={desktopTransportClass} aria-label="Detener">■</button> : null}<button type="button" onClick={onNext} disabled={!canNext} className={desktopTransportClass} aria-label="Canción siguiente">›</button></div></div>
      <div className="flex items-center gap-3 sm:gap-5 lg:hidden">
        <button type="button" onClick={() => void togglePlayback()} disabled={(status === "partial" && !partialAccepted) || (durationWarnings.length > 0 && !durationAccepted) || contextState === "closed"} aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14">
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        {showStop ? <button type="button" onClick={() => pauseAt(0)} disabled={!isPlaying && currentTime === 0} className="min-h-10 rounded-lg border border-white/[0.08] px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-30">Stop</button> : null}
        <div className="min-w-0 flex-1">
          <input type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration)} onChange={(event) => void seek(Number(event.target.value))} aria-label={`Posición del multitrack de ${title}`} className="audio-progress w-full" style={{ "--audio-progress": `${duration > 0 ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties} />
          <div className={`mt-1 font-mono text-xs text-zinc-500 ${showStop ? "grid grid-cols-3" : "flex justify-between"}`}><span>{formatTime(currentTime)}</span>{showStop ? <span className="text-center">-{formatTime(Math.max(0, duration - currentTime))}</span> : null}<span className="text-right">{formatTime(duration)}</span></div>
        </div>
      </div>

      <label className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(8rem,2fr)] items-center gap-3 border-t border-white/[0.07] pt-4 text-sm font-semibold text-zinc-300 lg:hidden">
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
      </div>
      <div className="mt-6 hidden min-w-0 overflow-x-auto border-y border-white/[0.07] bg-black/10 lg:flex"><div className="flex min-w-full items-stretch justify-center">{playableStems.map((stem, index) => { const mix = mixes[index]; return <div key={stem.id} className="flex w-[clamp(82px,8vw,106px)] shrink-0 flex-col items-center border-r border-white/[0.06] px-3 py-4"><p title={stem.name} className="h-8 max-w-full truncate text-center text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-zinc-300">{compactStemName(stem.name, title)}</p><input type="range" min={0} max={1} step={0.01} value={mix.volume} onChange={(event) => updateMix(index, { volume: Number(event.target.value) })} aria-label={`Volumen de ${stem.name}`} className="my-3 h-40 w-5 cursor-pointer accent-emerald-400 [direction:rtl] [writing-mode:vertical-lr]" /><span className="font-mono text-[0.6875rem] text-zinc-500">{volumeToDb(mix.volume)}</span><div className="mt-3 flex gap-1.5"><button type="button" onClick={() => updateMix(index, { solo: !mix.solo })} aria-pressed={mix.solo} className={`grid size-8 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.solo ? "bg-amber-300 text-black" : "bg-white/[0.05] text-zinc-500"}`}>S</button><button type="button" onClick={() => updateMix(index, { muted: !mix.muted })} aria-pressed={mix.muted} className={`grid size-8 place-items-center rounded-md text-[0.6875rem] font-bold ${mix.muted ? "bg-rose-400 text-black" : "bg-white/[0.05] text-zinc-500"}`}>M</button></div></div>})}{failures.map((failure) => <div key={failure.stem.id} className="flex w-24 shrink-0 flex-col items-center border-r border-white/[0.06] px-3 py-4 opacity-50"><p className="h-8 max-w-full truncate text-center text-[0.6875rem] font-bold uppercase text-zinc-500">{compactStemName(failure.stem.name, title)}</p><div className="my-3 grid h-40 place-items-center text-xs text-rose-300 [writing-mode:vertical-lr]">No disponible</div></div>)}<div className="flex w-[106px] shrink-0 flex-col items-center border-l border-emerald-400/20 bg-emerald-950/[0.08] px-3 py-4"><p className="h-8 text-center text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-emerald-300">Master</p><input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} aria-label="Volumen general del multitrack" className="my-3 h-40 w-5 cursor-pointer accent-emerald-400 [direction:rtl] [writing-mode:vertical-lr]" /><span className="font-mono text-[0.6875rem] text-emerald-300/70">{volumeToDb(masterVolume)}</span></div></div></div>
      <div className="mt-4 border-t border-white/[0.06] pt-3"><button type="button" onClick={() => { const next = !showDiagnostics; setShowDiagnostics(next); if (next) void getAudioCacheDiagnostics().then(setCacheDiagnostics); }} className="text-xs font-semibold text-zinc-500 hover:text-zinc-300">••• Diagnóstico</button>{showDiagnostics ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs"><Diagnostic label="Estado" value={engineHealth(status, failures.length, durationWarnings.length, partialAccepted, durationAccepted)} /><Diagnostic label="Solicitadas" value={String(diagnostics?.requestedStems ?? stems.length)} /><Diagnostic label="Descargadas" value={String(diagnostics?.fetchedStems ?? 0)} /><Diagnostic label="Decodificadas" value={String(diagnostics?.decodedStems ?? 0)} /><Diagnostic label="Carga" value={formatMilliseconds(diagnostics?.readyMs)} /><Diagnostic label="Descarga" value={formatMilliseconds(diagnostics?.downloadMs)} /><Diagnostic label="Decodificación" value={formatMilliseconds(diagnostics?.decodeMs)} /><Diagnostic label="Cache" value={diagnostics?.cacheHit ? "Sí" : "No"} /><Diagnostic label="Tipo" value={diagnostics?.loadMode ?? "—"} /><Diagnostic label="AudioContext" value={contextState} /><Diagnostic label="Sample rates" value={[...new Set(buffersRef.current.map((buffer) => buffer.sampleRate))].join(", ") || "—"} /><Diagnostic label="Canciones cacheadas" value={String(cacheDiagnostics?.songs ?? "—")} /><Diagnostic label="Stems cacheados" value={String(cacheDiagnostics?.stems ?? "—")} /><Diagnostic label="Audio decodificado" value={formatTime(cacheDiagnostics?.decodedDurationSeconds ?? 0)} /><Diagnostic label="PCM estimado" value={formatBytes(cacheDiagnostics?.approximateBytes)} /></dl> : null}</div>
    </div>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function median(values: number[]) { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function formatMilliseconds(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${(value / 1000).toFixed(2)} s`; }
function formatBytes(value: number | null | undefined) { if (value === null || value === undefined) return "—"; return `≈ ${(value / 1024 / 1024).toFixed(1)} MB`; }
function volumeToDb(value: number) { return value <= 0.001 ? "-∞" : `${(20 * Math.log10(value)).toFixed(1)} dB`; }
function compactStemName(name: string, songTitle: string) { const escaped = songTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const compact = name.replace(new RegExp(`^${escaped}(?:\\s*\\([^)]*\\))?\\s*[-–—:]?\\s*`, "i"), "").trim(); return compact && compact.length < name.length ? compact : name; }
function engineHealth(status: "loading" | "ready" | "partial" | "error", failures: number, durationWarnings: number, partialAccepted: boolean, durationAccepted: boolean) { if (status === "error") return "Error fatal"; if (status === "loading") return "Cargando"; if ((failures && !partialAccepted) || (durationWarnings && !durationAccepted)) return "Requiere atención"; if (failures || durationWarnings) return "Advertencia aceptada"; return "Saludable"; }
function Diagnostic({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-600">{label}</dt><dd className="mt-0.5 truncate font-medium text-zinc-300">{value}</dd></div>; }
const desktopTransportClass = "grid size-11 place-items-center rounded-full border border-white/[0.09] text-lg text-zinc-400 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-25";

function PlayIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current"><path d="M8 5.7a1 1 0 0 1 1.53-.85l9 5.3a1 1 0 0 1 0 1.7l-9 5.3A1 1 0 0 1 8 16.3V5.7Z" /></svg>;
}

function PauseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-current"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>;
}
