"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MULTITRACK_DURATION_TOLERANCE_SECONDS,
  MULTITRACK_TEST_STEMS,
} from "@/lib/multitrack-test-config";

type LoadState = "loading" | "ready" | "error";
type StemControl = { volume: number; muted: boolean; soloed: boolean };

const initialStemControls = Object.fromEntries(
  MULTITRACK_TEST_STEMS.map((stem) => [stem.name, { volume: 1, muted: false, soloed: false }]),
) as Record<string, StemControl>;

export function MultitrackTestPlayer() {
  const contextRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const stemGainsRef = useRef<Map<string, GainNode>>(new Map());
  const masterGainRef = useRef<GainNode | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const offsetRef = useRef(0);
  const startedAtRef = useRef(0);
  const isPlayingRef = useRef(false);
  const durationRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const playbackGenerationRef = useRef(0);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [contextNotice, setContextNotice] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  // The bundled sample is repeated four times, so start low enough to avoid summing into clipping.
  const [masterVolume, setMasterVolume] = useState(0.25);
  const [stemControls, setStemControls] = useState(initialStemControls);

  const stopSources = useCallback(() => {
    playbackGenerationRef.current += 1;
    for (const source of sourcesRef.current) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // A source may already have reached its natural end.
      }
      source.disconnect();
    }
    sourcesRef.current = [];
  }, []);

  const finishPlayback = useCallback(() => {
    stopSources();
    offsetRef.current = 0;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPosition(0);
  }, [stopSources]);

  useEffect(() => {
    const abortController = new AbortController();
    let active = true;
    const AudioContextConstructor = window.AudioContext;
    const context = new AudioContextConstructor();
    const masterGain = context.createGain();
    masterGain.connect(context.destination);
    contextRef.current = context;
    masterGainRef.current = masterGain;

    context.onstatechange = () => {
      if (!active) return;
      if (context.state === "suspended" && isPlayingRef.current) {
        setContextNotice("Audio was suspended. Tap Play to resume it.");
      } else if (context.state === "running") {
        setContextNotice("");
      }
    };

    async function loadStems() {
      try {
        const decoded = await Promise.all(
          MULTITRACK_TEST_STEMS.map(async (stem) => {
            let response: Response;
            try {
              response = await fetch(stem.url, { signal: abortController.signal });
            } catch (downloadError) {
              if (abortController.signal.aborted) throw downloadError;
              throw new Error(`Failed to download ${stem.name}. Check its URL and CORS settings.`);
            }

            if (!response.ok) {
              throw new Error(`Failed to download ${stem.name} (${response.status}).`);
            }

            const fileData = await response.arrayBuffer();
            try {
              const buffer = await context.decodeAudioData(fileData);
              return { stem, buffer };
            } catch {
              throw new Error(`Could not decode ${stem.name}. Use a browser-supported audio format.`);
            }
          }),
        );

        if (!active) return;
        const reference = decoded[0];
        if (!reference) throw new Error("Configure at least one test stem.");

        for (const item of decoded.slice(1)) {
          const difference = Math.abs(item.buffer.duration - reference.buffer.duration);
          if (difference > MULTITRACK_DURATION_TOLERANCE_SECONDS) {
            throw new Error(
              `${item.stem.name} is ${formatTime(item.buffer.duration)}, but ${reference.stem.name} is ${formatTime(reference.buffer.duration)}. ` +
              `Tracks must be within ${MULTITRACK_DURATION_TOLERANCE_SECONDS.toFixed(1)} seconds.`,
            );
          }
        }

        const nextBuffers = new Map<string, AudioBuffer>();
        const nextGains = new Map<string, GainNode>();
        for (const { stem, buffer } of decoded) {
          const gain = context.createGain();
          gain.connect(masterGain);
          nextBuffers.set(stem.name, buffer);
          nextGains.set(stem.name, gain);
        }

        const sharedDuration = Math.min(...decoded.map(({ buffer }) => buffer.duration));
        buffersRef.current = nextBuffers;
        stemGainsRef.current = nextGains;
        durationRef.current = sharedDuration;
        setDuration(sharedDuration);
        setLoadState("ready");
      } catch (loadError) {
        if (!active || abortController.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load the test tracks.");
        setLoadState("error");
      }
    }

    void loadStems();

    return () => {
      active = false;
      abortController.abort();
      context.onstatechange = null;
      stopSources();
      for (const gain of stemGainsRef.current.values()) gain.disconnect();
      masterGain.disconnect();
      void context.close();
      contextRef.current = null;
      buffersRef.current.clear();
      stemGainsRef.current.clear();
    };
  }, [stopSources]);

  useEffect(() => {
    const masterGain = masterGainRef.current;
    const context = contextRef.current;
    if (!masterGain || !context) return;
    masterGain.gain.setTargetAtTime(masterVolume, context.currentTime, 0.01);
  }, [masterVolume]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;
    const hasSolo = Object.values(stemControls).some((control) => control.soloed);

    for (const [name, gain] of stemGainsRef.current) {
      const control = stemControls[name];
      const audible = control && !control.muted && (!hasSolo || control.soloed);
      gain.gain.setTargetAtTime(audible ? control.volume : 0, context.currentTime, 0.01);
    }
  }, [stemControls, loadState]);

  useEffect(() => {
    function updatePosition() {
      const context = contextRef.current;
      if (!context || !isPlayingRef.current) return;
      const nextPosition = Math.min(
        durationRef.current,
        offsetRef.current + Math.max(0, context.currentTime - startedAtRef.current),
      );
      setPosition(nextPosition);
      if (nextPosition >= durationRef.current) {
        finishPlayback();
        return;
      }
      animationRef.current = requestAnimationFrame(updatePosition);
    }

    if (isPlaying) animationRef.current = requestAnimationFrame(updatePosition);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [finishPlayback, isPlaying]);

  const scheduleAllStems = useCallback((offset: number) => {
    const context = contextRef.current;
    if (!context || context.state !== "running") return false;

    stopSources();
    const startTime = context.currentTime + 0.05;
    const generation = playbackGenerationRef.current;
    const sources: AudioBufferSourceNode[] = [];

    for (const stem of MULTITRACK_TEST_STEMS) {
      const buffer = buffersRef.current.get(stem.name);
      const gain = stemGainsRef.current.get(stem.name);
      if (!buffer || !gain) {
        for (const source of sources) source.disconnect();
        return false;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(gain);
      source.start(startTime, offset);
      sources.push(source);
    }

    const finalSource = sources.at(-1);
    if (finalSource) {
      finalSource.onended = () => {
        if (playbackGenerationRef.current === generation && isPlayingRef.current) finishPlayback();
      };
    }
    sourcesRef.current = sources;
    offsetRef.current = offset;
    startedAtRef.current = startTime;
    isPlayingRef.current = true;
    setIsPlaying(true);
    return true;
  }, [finishPlayback, stopSources]);

  async function play() {
    const context = contextRef.current;
    if (!context || loadState !== "ready") return;

    try {
      if (context.state !== "running") await context.resume();
      if (context.state !== "running") {
        setContextNotice("Audio is suspended. Tap Play again to allow sound on this device.");
        return;
      }
      setContextNotice("");
      if (isPlayingRef.current) return;
      const safeOffset = offsetRef.current >= durationRef.current ? 0 : offsetRef.current;
      if (!scheduleAllStems(safeOffset)) setError("Unable to schedule all stems.");
    } catch {
      setContextNotice("Audio could not start. Tap Play again to allow sound on this device.");
    }
  }

  function pause() {
    const context = contextRef.current;
    if (!context || !isPlayingRef.current) return;
    const nextOffset = Math.min(
      durationRef.current,
      offsetRef.current + Math.max(0, context.currentTime - startedAtRef.current),
    );
    stopSources();
    offsetRef.current = nextOffset;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPosition(nextOffset);
  }

  function seek(nextPosition: number) {
    const clamped = Math.max(0, Math.min(durationRef.current, nextPosition));
    const wasPlaying = isPlayingRef.current;
    stopSources();
    offsetRef.current = clamped;
    isPlayingRef.current = false;
    setIsPlaying(false);
    setPosition(clamped);
    if (wasPlaying && clamped < durationRef.current) scheduleAllStems(clamped);
  }

  function updateStem(name: string, update: Partial<StemControl>) {
    setStemControls((current) => ({
      ...current,
      [name]: { ...current[name], ...update },
    }));
  }

  return (
    <section className="mt-8 space-y-4" aria-label="Multitrack test player">
      <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/70 p-4 shadow-xl shadow-black/20 sm:p-6">
        {loadState === "loading" ? (
          <p role="status" className="py-8 text-center text-sm text-zinc-400">Loading and decoding all stems…</p>
        ) : null}
        {loadState === "error" ? (
          <p role="alert" className="py-8 text-center text-sm leading-6 text-rose-300">{error}</p>
        ) : null}

        {loadState === "ready" ? (
          <div className="space-y-5">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void play()}
                disabled={isPlaying && contextRef.current?.state === "running"}
                className="min-h-12 flex-1 rounded-full bg-emerald-400 px-5 font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Play
              </button>
              <button
                type="button"
                onClick={pause}
                disabled={!isPlaying}
                className="min-h-12 flex-1 rounded-full border border-white/10 bg-white/[0.055] px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                Pause
              </button>
            </div>

            {contextNotice ? <p role="status" className="rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{contextNotice}</p> : null}

            <div>
              <input
                type="range"
                min={0}
                max={duration}
                step="0.01"
                value={position}
                onChange={(event) => seek(Number(event.target.value))}
                aria-label="Playback position"
                className="w-full accent-emerald-400"
              />
              <div className="mt-1 flex justify-between font-mono text-xs text-zinc-500">
                <span>{formatTime(position)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            <VolumeControl
              label="Master volume"
              value={masterVolume}
              onChange={setMasterVolume}
            />
          </div>
        ) : null}
      </div>

      {loadState === "ready" ? MULTITRACK_TEST_STEMS.map((stem) => {
        const control = stemControls[stem.name];
        return (
          <article key={stem.name} className="rounded-2xl border border-white/[0.08] bg-zinc-900/70 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-white">{stem.name}</h2>
              <div className="flex gap-2">
                <ToggleButton active={control.muted} label={`Mute ${stem.name}`} onClick={() => updateStem(stem.name, { muted: !control.muted })}>Mute</ToggleButton>
                <ToggleButton active={control.soloed} label={`Solo ${stem.name}`} onClick={() => updateStem(stem.name, { soloed: !control.soloed })}>Solo</ToggleButton>
              </div>
            </div>
            <div className="mt-4">
              <VolumeControl
                label={`${stem.name} volume`}
                value={control.volume}
                onChange={(volume) => updateStem(stem.name, { volume })}
              />
            </div>
          </article>
        );
      }) : null}
    </section>
  );
}

function VolumeControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
      <span>{label}</span>
      <span className="font-mono text-xs text-zinc-500">{Math.round(value * 100)}%</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="col-span-2 w-full accent-emerald-400"
      />
    </label>
  );
}

function ToggleButton({ active, children, label, onClick }: { active: boolean; children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${active ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-300" : "border-white/10 bg-white/[0.04] text-zinc-300"}`}
    >
      {children}
    </button>
  );
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
