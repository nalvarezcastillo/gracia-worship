"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type PublicSongStem = {
  id: string;
  name: string;
  publicUrl: string;
  song_key_id: string;
  sort_order: number;
};

type StemMix = {
  muted: boolean;
  solo: boolean;
  volume: number;
};

export function MultitrackPlayer({ active = true, stems, title }: { active?: boolean; stems: PublicSongStem[]; title: string }) {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<AudioBuffer[]>([]);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const stemGainsRef = useRef<GainNode[]>([]);
  const masterGainRef = useRef<GainNode | null>(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
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
    stopSources();
    stopAnimation();
    offsetRef.current = time;
    setCurrentTime(time);
    setIsPlaying(false);
  }, [stopAnimation, stopSources]);

  const updateTimeline = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    const nextTime = Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current));
    offsetRef.current = nextTime;
    setCurrentTime(nextTime);
    if (nextTime >= duration) {
      pauseAt(0);
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
    setIsPlaying(true);
    stopAnimation();
    animationRef.current = requestAnimationFrame(updateTimeline);
  }, [stopAnimation, stopSources, updateTimeline]);

  useEffect(() => {
    const controller = new AbortController();
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
    setIsPlaying(false);
    setStatus("loading");

    void Promise.all(stems.map(async (stem) => {
      const response = await fetch(stem.publicUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Unable to load ${stem.name}`);
      return context.decodeAudioData(await response.arrayBuffer());
    })).then((buffers) => {
      if (controller.signal.aborted) return;
      buffersRef.current = buffers;
      stemGainsRef.current = buffers.map(() => {
        const gain = context.createGain();
        gain.connect(masterGain);
        return gain;
      });
      setDuration(Math.max(...buffers.map((buffer) => buffer.duration), 0));
      setStatus("ready");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      console.error("Unable to load multitrack stems:", error);
      setStatus("error");
    });

    return () => {
      controller.abort();
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
  }, [stems, stopAnimation, stopSources]);

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

  async function togglePlayback() {
    const context = contextRef.current;
    if (!context || status !== "ready" || duration <= 0) return;
    if (isPlaying) {
      const pausedTime = Math.min(duration, Math.max(0, context.currentTime - startedAtRef.current));
      pauseAt(pausedTime);
      return;
    }
    await context.resume();
    startSources(offsetRef.current >= duration ? 0 : offsetRef.current);
  }

  async function seek(value: number) {
    const nextTime = Math.min(duration, Math.max(0, value));
    offsetRef.current = nextTime;
    setCurrentTime(nextTime);
    if (!isPlaying) return;
    const context = contextRef.current;
    if (!context) return;
    await context.resume();
    startSources(nextTime >= duration ? 0 : nextTime);
  }

  function updateMix(index: number, patch: Partial<StemMix>) {
    setMixes((current) => current.map((mix, mixIndex) => mixIndex === index ? { ...mix, ...patch } : mix));
  }

  if (status === "loading") return <p role="status" className="py-5 text-center text-sm text-zinc-400">Cargando pistas…</p>;
  if (status === "error") return <p role="alert" className="py-5 text-center text-sm text-rose-300">No se pudieron cargar las pistas.</p>;

  return (
    <div>
      <div className="flex items-center gap-3 sm:gap-5">
        <button type="button" onClick={() => void togglePlayback()} aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14">
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div className="min-w-0 flex-1">
          <input type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration)} onChange={(event) => void seek(Number(event.target.value))} aria-label={`Posición del multitrack de ${title}`} className="audio-progress w-full" style={{ "--audio-progress": `${duration > 0 ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties} />
          <div className="mt-1 flex justify-between font-mono text-xs text-zinc-500"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
        </div>
      </div>

      <label className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(8rem,2fr)] items-center gap-3 border-t border-white/[0.07] pt-4 text-sm font-semibold text-zinc-300">
        Volumen general
        <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(event) => setMasterVolume(Number(event.target.value))} aria-label="Volumen general del multitrack" className="accent-emerald-400" />
      </label>

      <div className="mt-3 divide-y divide-white/[0.06] border-y border-white/[0.06]">
        {stems.map((stem, index) => {
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
      </div>
    </div>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function PlayIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="ml-0.5 size-6 fill-current"><path d="M8 5.7a1 1 0 0 1 1.53-.85l9 5.3a1 1 0 0 1 0 1.7l-9 5.3A1 1 0 0 1 8 16.3V5.7Z" /></svg>;
}

function PauseIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-current"><path d="M7 5h3v14H7zm7 0h3v14h-3z" /></svg>;
}
