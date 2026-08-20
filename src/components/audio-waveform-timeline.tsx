"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentSongSection, type SongSection } from "@/lib/song-sections";
import { useSongSections } from "@/components/song-sections-context";

const peakCache = new WeakMap<AudioBuffer, Map<number, Float32Array>>();

export function AudioWaveformTimeline({ buffers, currentTime, duration, onSeek, sections = [] }: { buffers: AudioBuffer[]; currentTime: number; duration: number; onSeek: (seconds: number) => void; sections?: SongSection[] }) {
  const contextualSections = useSongSections();
  const effectiveSections = sections.length ? sections : contextualSections;
  const orderedSections = useMemo(() => [...effectiveSections].sort((a, b) => a.start_seconds - b.start_seconds), [effectiveSections]);
  const sectionRegions = useMemo(() => orderedSections
    .filter((section) => section.start_seconds < duration)
    .map((section, index, visibleSections) => ({
      section,
      start: Math.max(0, section.start_seconds),
      end: Math.min(duration, visibleSections[index + 1]?.start_seconds ?? duration),
    }))
    .filter((region) => region.end > region.start), [duration, orderedSections]);
  const containerRef = useRef<HTMLDivElement>(null); const canvasRef = useRef<HTMLCanvasElement>(null); const draggingRef = useRef(false); const [width, setWidth] = useState(0);
  useEffect(() => { const element = containerRef.current; if (!element) return; const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width))); observer.observe(element); return () => observer.disconnect(); }, []);
  const bucketCount = width ? Math.max(180, Math.min(1500, Math.round(width * (width < 640 ? 0.75 : 1.25)))) : 0;
  const peaks = useMemo(() => combinePeaks(buffers, bucketCount), [buffers, bucketCount]);
  useEffect(() => { const canvas = canvasRef.current; if (!canvas || !width || !peaks.length) return; const height = width < 640 ? 72 : 112; const ratio = window.devicePixelRatio || 1; canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; const context = canvas.getContext("2d"); if (!context) return; context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height); const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0; drawPeaks(context, peaks, width, height, "#52525b"); context.save(); context.beginPath(); context.rect(0, 0, width * progress, height); context.clip(); drawPeaks(context, peaks, width, height, "#34d399"); context.restore(); const playheadX = Math.min(width - 1, Math.max(1, width * progress)); context.fillStyle = "#f4f4f5"; context.fillRect(playheadX - 0.75, 0, 1.5, height); }, [currentTime, duration, peaks, width]);
  function seekFromPointer(clientX: number) { const bounds = containerRef.current?.getBoundingClientRect(); if (!bounds || !duration) return; onSeek(Math.min(duration, Math.max(0, ((clientX - bounds.left) / bounds.width) * duration))); }
  const currentSection = getCurrentSongSection(orderedSections, currentTime);
  return <div className="relative overflow-hidden">
    <div className="relative h-8 overflow-hidden border-y border-white/[0.06] bg-white/[0.015]">
      {sectionRegions.map(({ section, start, end }) => {
        const active = currentSection?.id === section.id;
        return <button
          key={section.id}
          type="button"
          onClick={() => onSeek(section.start_seconds)}
          aria-label={`${section.label}, ${formatSectionTime(section.start_seconds)}`}
          title={`${section.label} · ${formatSectionTime(section.start_seconds)}`}
          className={`absolute inset-y-0 flex items-center justify-center overflow-hidden border-l text-[0.5625rem] font-bold uppercase tracking-[0.08em] transition-colors focus-visible:z-10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-emerald-300 ${active ? "border-emerald-400/50 bg-emerald-400/[0.09] text-emerald-300" : "border-white/10 text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300"}`}
          style={{ left: `${duration ? (start / duration) * 100 : 0}%`, width: `${duration ? ((end - start) / duration) * 100 : 0}%` }}
        ><span className="block min-w-0 truncate px-1.5">{section.label}</span></button>;
      })}
    </div>
    <div ref={containerRef} className="relative w-full touch-none overflow-hidden" onPointerDown={(event) => { draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event.clientX); }} onPointerMove={(event) => { if (draggingRef.current) seekFromPointer(event.clientX); }} onPointerUp={(event) => { draggingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { draggingRef.current = false; }}>
      {sectionRegions.map(({ section, start }) => <span key={section.id} aria-hidden="true" className={`pointer-events-none absolute inset-y-0 z-10 w-px ${currentSection?.id === section.id ? "bg-emerald-300/60" : "bg-white/15"}`} style={{ left: `${duration ? (start / duration) * 100 : 0}%` }} />)}
      <canvas ref={canvasRef} className="block max-w-full cursor-pointer" aria-label="Forma de onda; arrastra para cambiar la posición" role="slider" aria-valuemin={0} aria-valuemax={Math.round(duration)} aria-valuenow={Math.round(currentTime)} tabIndex={0} onKeyDown={(event) => { if (event.key === "ArrowLeft") onSeek(Math.max(0, currentTime - 5)); if (event.key === "ArrowRight") onSeek(Math.min(duration, currentTime + 5)); }} />
    </div>
  </div>;
}

function formatSectionTime(seconds: number) { const rounded = Math.max(0, Math.floor(seconds)); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; }

function combinePeaks(buffers: AudioBuffer[], buckets: number) { if (!buffers.length || !buckets) return new Float32Array(); const sources = buffers.map((buffer) => bufferPeaks(buffer, buckets)); const combined = new Float32Array(buckets); let maximum = 0; for (let index = 0; index < buckets; index += 1) { let energy = 0; for (const source of sources) energy += source[index] * source[index]; combined[index] = Math.sqrt(energy / sources.length); maximum = Math.max(maximum, combined[index]); } if (maximum > 0) for (let index = 0; index < buckets; index += 1) combined[index] = Math.min(1, combined[index] / maximum); return combined; }
function bufferPeaks(buffer: AudioBuffer, buckets: number) { let resolutions = peakCache.get(buffer); if (!resolutions) { resolutions = new Map(); peakCache.set(buffer, resolutions); } const cached = resolutions.get(buckets); if (cached) return cached; const peaks = new Float32Array(buckets); const samplesPerBucket = Math.max(1, Math.floor(buffer.length / buckets)); const stride = Math.max(1, Math.floor(samplesPerBucket / 64)); for (let bucket = 0; bucket < buckets; bucket += 1) { const start = bucket * samplesPerBucket; const end = Math.min(buffer.length, start + samplesPerBucket); let peak = 0; for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) { const samples = buffer.getChannelData(channel); for (let sample = start; sample < end; sample += stride) peak = Math.max(peak, Math.abs(samples[sample])); } peaks[bucket] = peak; } resolutions.set(buckets, peaks); return peaks; }
function drawPeaks(context: CanvasRenderingContext2D, peaks: Float32Array, width: number, height: number, color: string) { const center = height / 2; const barWidth = width / peaks.length; context.fillStyle = color; for (let index = 0; index < peaks.length; index += 1) { const amplitude = Math.max(1, peaks[index] * (height * 0.46)); context.fillRect(index * barWidth, center - amplitude, Math.max(1, barWidth * 0.72), amplitude * 2); } }
