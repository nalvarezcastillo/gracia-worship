"use client";

import { useEffect, useRef, useState } from "react";

export function AudioPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;

    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
  }, [src]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || hasError) return;

    if (audio.paused) {
      void audio.play().catch(() => setHasError(true));
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = value;
    setCurrentTime(value);
  }

  if (!src || hasError) {
    return <p role="status" className="py-4 text-center text-base font-medium text-zinc-400">No audio available</p>;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 sm:gap-5">
      <audio
        key={src}
        ref={audioRef}
        src={src}
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
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => {
          setIsPlaying(false);
          setHasError(true);
        }}
      />

      <button
        type="button"
        onClick={togglePlayback}
        aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
        className="grid size-12 shrink-0 place-items-center rounded-full bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-950/35 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-emerald-300 hover:shadow-xl hover:shadow-emerald-950/40 active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:size-14"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>

      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step="0.1"
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seek(Number(event.target.value))}
          aria-label={`Playback position for ${title}`}
          disabled={duration === 0}
          className="audio-progress w-full"
          style={{ "--audio-progress": `${progress}%` } as React.CSSProperties}
        />
        <div className="mt-1.5 flex justify-between font-mono text-[0.7rem] text-zinc-500 sm:mt-2 sm:text-xs">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
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
