"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

type AudioPlayerState = {
  currentTime: number;
  duration: number;
  hasError: boolean;
  hasSource: boolean;
  isPlaying: boolean;
  pause: () => void;
  seek: (value: number) => void;
  skip: (seconds: number) => void;
  title: string;
  togglePlayback: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerState | null>(null);

export function AudioPlayerProvider({ children, src, title }: { children: React.ReactNode; src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasError(false);
    audio.load();
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    if (audio.paused) {
      void audio.play().catch(() => setHasError(true));
    } else {
      audio.pause();
    }
  }

  function pause() {
    audioRef.current?.pause();
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = Math.min(duration || 0, Math.max(0, value));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  function skip(seconds: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const nextTime = seconds < 0
      ? Math.max(0, audio.currentTime - 10)
      : Math.min(audio.duration, audio.currentTime + 10);
    if (!Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  return (
    <AudioPlayerContext.Provider value={{ currentTime, duration, hasError, hasSource: Boolean(src), isPlaying, pause, seek, skip, title, togglePlayback }}>
        <audio
          ref={audioRef}
          src={src || undefined}
          preload="metadata"
          onLoadStart={() => {
            setIsPlaying(false);
            setCurrentTime(0);
            setDuration(0);
            setHasError(false);
          }}
          onLoadedMetadata={(event) => {
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          }}
          onDurationChange={(event) => {
            const nextDuration = event.currentTarget.duration;
            setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
          }}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onError={() => {
            setIsPlaying(false);
            setHasError(true);
          }}
        />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const value = useContext(AudioPlayerContext);
  if (!value) throw new Error("useAudioPlayer must be used inside AudioPlayerProvider");
  return value;
}

export function AudioPlayer({ premium = false, subtitle }: { premium?: boolean; subtitle?: string }) {
  const { currentTime, duration, hasError, hasSource, isPlaying, seek, skip, title, togglePlayback } = useAudioPlayer();

  if (!hasSource || hasError) {
    return <p role="status" className="py-4 text-center text-base font-medium text-zinc-400">No hay audio disponible</p>;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  if (premium) {
    return (
      <div>
        <div className="text-center"><p className="truncate text-lg font-semibold tracking-tight text-white sm:text-xl">{title}</p>{subtitle ? <p className="mt-1 truncate text-sm text-zinc-500">{subtitle}</p> : null}</div>
        <div className="mt-6 flex items-center justify-center gap-4 sm:gap-7"><AudioControlButton ariaLabel="Retroceder 10 segundos" onClick={() => skip(-10)}><span className="text-lg">−</span><span>10</span></AudioControlButton><button type="button" onClick={togglePlayback} aria-label={`${isPlaying ? "Pausar" : "Reproducir"} ${title}`} className="grid size-16 shrink-0 place-items-center rounded-full border border-emerald-300/70 bg-emerald-400/[0.08] text-emerald-300 shadow-[0_0_28px_rgba(40,215,160,0.1)] transition-all hover:scale-[1.03] hover:bg-emerald-400/[0.14] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-[4.5rem]">{isPlaying ? <PauseIcon /> : <PlayIcon />}</button><AudioControlButton ariaLabel="Avanzar 10 segundos" onClick={() => skip(10)}><span>10</span><span className="text-lg">+</span></AudioControlButton></div>
        <div className="mx-auto mt-6 max-w-4xl"><div className="flex items-center gap-4"><span className="w-10 shrink-0 font-mono text-xs tabular-nums text-zinc-400">{formatTime(currentTime)}</span><ProgressSlider currentTime={currentTime} duration={duration} onSeek={seek} progress={progress} title={title} /><span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-zinc-500">{formatTime(duration)}</span></div></div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 sm:gap-5">
      <button
        type="button"
        onClick={togglePlayback}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-300 hover:shadow-xl hover:shadow-emerald-950/40 active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <div className="min-w-0 flex-1">
        <ProgressSlider currentTime={currentTime} duration={duration} onSeek={seek} progress={progress} title={title} />
        <TimeLabels currentTime={currentTime} duration={duration} />
      </div>
    </div>
  );
}

export function CompactAudioPlayer() {
  const { currentTime, duration, hasError, hasSource, isPlaying, seek, skip, togglePlayback } = useAudioPlayer();
  if (!hasSource || hasError) return <p role="status" className="text-center text-sm text-zinc-400">No hay audio disponible</p>;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <AudioControlButton ariaLabel="Rewind 10 seconds" onClick={() => skip(-10)}>−10</AudioControlButton>
        <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>
        <AudioControlButton ariaLabel="Forward 10 seconds" onClick={() => skip(10)}>+10</AudioControlButton>
        <div className="min-w-0 flex-1">
          <ProgressSlider currentTime={currentTime} duration={duration} onSeek={seek} progress={progress} title="Audio" />
          <TimeLabels currentTime={currentTime} duration={duration} compact />
        </div>
      </div>
    </div>
  );
}

function AudioControlButton({ ariaLabel, children, onClick }: { ariaLabel: string; children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-label={ariaLabel} className="min-h-11 min-w-11 shrink-0 rounded-full text-xs font-bold text-zinc-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">{children}</button>;
}

function ProgressSlider({ currentTime, duration, onSeek, progress, title }: { currentTime: number; duration: number; onSeek: (value: number) => void; progress: number; title: string }) {
  return <input type="range" min={0} max={duration || 0} step="0.1" value={Math.min(currentTime, duration || 0)} onChange={(event) => onSeek(Number(event.target.value))} aria-label={`Playback position for ${title}`} disabled={duration === 0} className="audio-progress w-full" style={{ "--audio-progress": `${progress}%` } as React.CSSProperties} />;
}

function TimeLabels({ compact = false, currentTime, duration }: { compact?: boolean; currentTime: number; duration: number }) {
  return <div className={`${compact ? "mt-0.5" : "mt-1.5 sm:mt-2"} flex justify-between font-mono text-[0.65rem] text-zinc-500 sm:text-xs`}><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>;
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
