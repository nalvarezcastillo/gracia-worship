"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AudioPlayer, useAudioPlayer } from "@/components/audio-player";
import { MultitrackPlayer, type PublicSongStem } from "@/components/multitrack-player";
import type { MusicalGrid } from "@/lib/musical-grid";
import { getCurrentSongSection, type SongSection } from "@/lib/song-sections";

const FullscreenPdfReader = dynamic(
  () => import("@/components/fullscreen-pdf-reader").then((module) => module.FullscreenPdfReader),
  { ssr: false },
);

type SongContentTabsProps = {
  artist?: string;
  audioUrl: string;
  lyrics: string;
  organized?: boolean;
  rehearsalMode?: boolean;
  sheetUrl: string;
  stems: PublicSongStem[];
  stemsLoading?: boolean;
  bpm?: number | null;
  durationLabel?: string;
  grid?: MusicalGrid | null;
  keyName?: string;
  keyVariantCount?: number;
  sections?: SongSection[];
  timeSignature?: string | null;
  title: string;
};

type WorkspaceTab = "audio" | "lyrics" | "pdf" | "multitrack";

export function SongContentTabs({ artist, audioUrl, bpm, durationLabel, grid, keyName, keyVariantCount, lyrics, organized = true, rehearsalMode = false, sections = [], sheetUrl, stems, stemsLoading = false, timeSignature, title }: SongContentTabsProps) {
  if (!organized) return <LegacySongContent lyrics={lyrics} rehearsalMode={rehearsalMode} sheetUrl={sheetUrl} title={title} />;
  return <OrganizedSongContent artist={artist} audioUrl={audioUrl} bpm={bpm} durationLabel={durationLabel} grid={grid} keyName={keyName} keyVariantCount={keyVariantCount} lyrics={lyrics} rehearsalMode={rehearsalMode} sections={sections} sheetUrl={sheetUrl} stems={stems} stemsLoading={stemsLoading} timeSignature={timeSignature} title={title} />;
}

function OrganizedSongContent({ artist, audioUrl, bpm, durationLabel, grid, keyName, keyVariantCount = 0, lyrics, sections = [], sheetUrl, stems, stemsLoading = false, timeSignature, title }: SongContentTabsProps) {
  const audio = useAudioPlayer();
  const tabs: { id: WorkspaceTab; label: string }[] = [
    ...(audioUrl ? [{ id: "audio" as const, label: "Audio" }] : []),
    ...(lyrics.trim() ? [{ id: "lyrics" as const, label: "Letra" }] : []),
    ...(sheetUrl ? [{ id: "pdf" as const, label: "Partitura" }] : []),
    ...(stems.length > 0 ? [{ id: "multitrack" as const, label: "Multitrack" }] : []),
  ];
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => tabs[0]?.id ?? "audio");
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const pdfFileName = getPdfFileName(sheetUrl);
  const visibleTab = tabs.some((section) => section.id === activeTab)
    ? activeTab
    : tabs[0]?.id;

  function selectSection(section: WorkspaceTab) {
    if (section === "multitrack") audio.pause();
    setActiveTab(section);
  }

  return (
    <section className="mt-7 sm:mt-9">
      <div className={`relative ${tabs.length > 1 ? "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-[var(--app-background)] after:to-transparent sm:after:hidden" : ""}`}>
      <div role="tablist" aria-label="Contenido de la canción" className="flex gap-6 overflow-x-auto border-b border-white/[0.08] pr-8 [scrollbar-width:none] sm:gap-7 sm:pr-0 [&::-webkit-scrollbar]:hidden">
        {tabs.map((section) => (
          <TabButton
            key={section.id}
            active={visibleTab === section.id}
            controls={`${section.id}-panel`}
            onClick={() => selectSection(section.id)}
          >
            {section.label}
          </TabButton>
        ))}
      </div>
      </div>

      <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
        <div className="min-w-0">
          {sections.length ? <SongStructure compact={visibleTab === "lyrics" || visibleTab === "pdf"} sections={sections} currentTime={audio.currentTime} onSeek={audio.seek} /> : null}
          {visibleTab === "audio" && audioUrl ? (
            <div className="sticky top-0 z-30 mb-6 bg-[var(--app-background)]/92 py-2 backdrop-blur-xl">
              <div className="rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] px-4 py-6 shadow-2xl shadow-black/20 sm:px-7 sm:py-8 lg:px-10">
                <AudioPlayer premium subtitle={artist} />
              </div>
            </div>
          ) : null}

        {visibleTab === "audio" ? <div id="audio-panel" role="tabpanel" /> : null}

        {visibleTab === "lyrics" ? (
          <div id="lyrics-panel" role="tabpanel" className="mx-auto max-w-3xl py-2 sm:py-5">
            <LyricsContent lyrics={lyrics} emphasizeSections />
          </div>
        ) : null}

        {visibleTab === "pdf" ? (
          <div id="pdf-panel" role="tabpanel" className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))] shadow-2xl shadow-black/15">
            {sheetUrl ? (
              <div className="flex min-h-72 flex-col justify-between gap-8 p-6 sm:p-8 lg:min-h-80 lg:p-10">
                <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.08] text-rose-300">
                  <PdfIcon />
                </div>
                <div className="min-w-0">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-rose-300/80">Partitura disponible</p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h2>
                  <p className="mt-3 truncate text-sm text-zinc-400" title={pdfFileName}>{pdfFileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfOpen(true)}
                  className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-300 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:w-fit"
                >
                  Abrir partitura
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {stems.length > 0 && visibleTab === "multitrack" ? (
          <div id="multitrack-panel" role="tabpanel" className="px-1 sm:px-2">
            <MultitrackPlayer active bpm={bpm} grid={grid} layout="song-detail" stems={stems} timeSignature={timeSignature} title={title} />
          </div>
        ) : null}

          {!visibleTab && stemsLoading ? <p role="status" className="py-5 text-center text-sm text-zinc-400">Cargando pistas…</p> : null}

          <ResourceNavigation tabs={tabs} activeTab={visibleTab} onSelect={selectSection} />
        </div>

        <SongContextPanel artist={artist} bpm={bpm} durationLabel={durationLabel} keyName={keyName} keyVariantCount={keyVariantCount} resourceCount={tabs.length} sectionCount={sections.length} timeSignature={timeSignature} />
      </div>

      {isPdfOpen && sheetUrl ? (
        <FullscreenPdfReader
          key={sheetUrl}
          fileName={pdfFileName}
          headerAudioControls={audioUrl ? <AudioPlayer /> : undefined}
          onClose={() => setIsPdfOpen(false)}
          title={title}
          url={sheetUrl}
        />
      ) : null}
    </section>
  );
}

function SongStructure({ compact = false, currentTime, onSeek, sections }: { compact?: boolean; currentTime: number; onSeek: (seconds: number) => void; sections: SongSection[] }) {
  const ordered = [...sections].sort((a, b) => a.start_seconds - b.start_seconds);
  const current = getCurrentSongSection(ordered, currentTime);
  return (
    <section aria-labelledby="song-structure-title" className={compact ? "mb-4 opacity-80" : "mb-5"}>
      <h2 id="song-structure-title" className={`${compact ? "mb-2" : "mb-3"} text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500`}>Estructura</h2>
      <div className={`relative ${ordered.length > 1 ? "after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-8 after:bg-gradient-to-l after:from-[var(--app-background)] after:to-transparent sm:after:hidden" : ""}`}>
      <div className="flex snap-x gap-2 overflow-x-auto pb-2 pr-8 [scrollbar-color:rgba(255,255,255,0.12)_transparent] sm:pr-0">
        {ordered.map((section) => {
          const active = current?.id === section.id;
          return <button key={section.id} type="button" onClick={() => onSeek(section.start_seconds)} aria-current={active ? "step" : undefined} className={`relative ${compact ? "min-h-14 min-w-28 px-3 py-2" : "min-h-[4.25rem] min-w-[8.25rem] px-4 py-3"} snap-start rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${active ? "border-emerald-400/35 bg-emerald-400/[0.09] text-emerald-300" : "border-white/[0.07] bg-white/[0.018] text-zinc-200 hover:bg-white/[0.04]"}`}>
            <span className="block truncate text-xs font-bold uppercase tracking-[0.04em]">{section.label}</span>
            <span className="mt-1.5 block font-mono text-[0.6875rem] tabular-nums text-zinc-500">{formatSectionTime(section.start_seconds)}</span>
            {active ? <span aria-hidden="true" className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-emerald-400" /> : null}
          </button>;
        })}
      </div>
      </div>
    </section>
  );
}

function ResourceNavigation({ activeTab, onSelect, tabs }: { activeTab?: WorkspaceTab; onSelect: (tab: WorkspaceTab) => void; tabs: { id: WorkspaceTab; label: string }[] }) {
  return (
    <section aria-labelledby="available-resources-title" className="mt-10 border-t border-white/[0.07] pt-6">
      <h2 id="available-resources-title" className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Recursos disponibles</h2>
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4 xl:grid-cols-2">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => onSelect(tab.id)} className={`flex min-h-16 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 sm:min-h-20 sm:gap-3 sm:p-3 ${activeTab === tab.id ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.045]"}`}><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-400/[0.09] text-sm font-bold text-emerald-300 sm:size-10">{resourceGlyph(tab.id)}</span><span className="min-w-0"><span className="block truncate text-sm font-semibold text-white">{tab.label}</span><span className="mt-0.5 block text-[0.625rem] text-zinc-500 sm:mt-1 sm:text-[0.6875rem]">Disponible</span></span></button>)}
      </div>
    </section>
  );
}

function SongContextPanel({ artist, bpm, durationLabel, keyName, keyVariantCount, resourceCount, sectionCount, timeSignature }: { artist?: string; bpm?: number | null; durationLabel?: string; keyName?: string; keyVariantCount: number; resourceCount: number; sectionCount: number; timeSignature?: string | null }) {
  const information = [["Artista", artist], ["Tonalidad", keyName], ["BPM", bpm ? String(bpm) : undefined], ["Compás", timeSignature ?? undefined], ["Duración", durationLabel]] as const;
  return <aside aria-label="Contexto de la canción" className="rounded-2xl border border-white/[0.07] bg-white/[0.018] p-5 xl:sticky xl:top-5">
    <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Información</h2>
    <dl className="mt-3 divide-y divide-white/[0.06]">{information.filter(([, value]) => Boolean(value)).map(([label, value]) => <div key={label} className="flex items-start justify-between gap-4 py-3 text-sm"><dt className="text-zinc-500">{label}</dt><dd className="max-w-[10rem] text-right font-medium text-zinc-200">{value}</dd></div>)}</dl>
    <h2 className="mt-7 border-t border-white/[0.07] pt-5 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-zinc-500">Preparación</h2>
    <dl className="mt-3 divide-y divide-white/[0.06]"><ContextMetric label="Secciones" value={String(sectionCount)} /><ContextMetric label="Recursos" value={String(resourceCount)} />{keyVariantCount > 0 ? <ContextMetric label="Tonalidades" value={String(keyVariantCount)} /> : null}</dl>
  </aside>;
}

function ContextMetric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 py-3 text-sm"><dt className="text-zinc-500">{label}</dt><dd className="font-semibold text-zinc-200">{value}</dd></div>; }
function resourceGlyph(tab: WorkspaceTab) { return tab === "audio" ? "♪" : tab === "lyrics" ? "L" : tab === "pdf" ? "P" : "M"; }
function formatSectionTime(seconds: number) { const whole = Math.max(0, Math.floor(seconds)); return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`; }

function LegacySongContent({ lyrics, rehearsalMode = false, sheetUrl, title }: Pick<SongContentTabsProps, "lyrics" | "rehearsalMode" | "sheetUrl" | "title">) {
  const [activeTab, setActiveTab] = useState<"lyrics" | "pdf">("lyrics");
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const pdfFileName = getPdfFileName(sheetUrl);

  return (
    <section className={rehearsalMode ? "mt-3 lg:mt-4" : "mt-6"}>
      <div role="tablist" aria-label="Song content" className={`grid ${sheetUrl ? "grid-cols-2" : "grid-cols-1"} rounded-xl border border-white/[0.07] bg-zinc-900/60 p-0.5 lg:rounded-2xl lg:p-1`}>
        <TabButton active={activeTab === "lyrics"} controls="lyrics-panel" onClick={() => setActiveTab("lyrics")}>Letra</TabButton>
        {sheetUrl ? <TabButton active={activeTab === "pdf"} controls="pdf-panel" onClick={() => setActiveTab("pdf")}>Partitura</TabButton> : null}
      </div>
      <div className={rehearsalMode ? "mt-3 border-t border-white/[0.07] pt-4 lg:mt-3 lg:min-h-[38dvh] lg:border-x-0 lg:border-b-0 lg:bg-transparent lg:px-2 lg:py-6" : "mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-5 sm:p-6"}>
        {activeTab === "lyrics"
          ? <div id="lyrics-panel" role="tabpanel"><LyricsContent lyrics={lyrics} emphasizeSections={rehearsalMode} /></div>
          : (
            <div id="pdf-panel" role="tabpanel">
              <button type="button" onClick={() => setIsPdfOpen(true)} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950">Abrir partitura</button>
            </div>
          )}
      </div>
      {isPdfOpen && sheetUrl ? <FullscreenPdfReader key={sheetUrl} fileName={pdfFileName} onClose={() => setIsPdfOpen(false)} title={title} url={sheetUrl} /> : null}
    </section>
  );
}

function LyricsContent({ emphasizeSections, lyrics }: { emphasizeSections: boolean; lyrics: string }) {
  if (!emphasizeSections) return <p className="whitespace-pre-wrap text-base leading-8 text-zinc-300">{lyrics}</p>;
  const lines = lyrics.split("\n");

  return (
    <p className="mx-auto max-w-[38rem] whitespace-pre-wrap text-base leading-7 text-zinc-100 sm:text-lg sm:leading-9 lg:mx-0 lg:max-w-4xl lg:text-xl lg:leading-10">
      {lines.map((line, index) => isLyricsSection(line)
        ? <span key={index} className="mt-6 block text-sm font-bold uppercase tracking-[0.08em] text-emerald-400 first:mt-0 sm:text-base lg:mt-8 lg:text-xl lg:tracking-normal">{line}</span>
        : <span key={index}>{line}{index < lines.length - 1 ? "\n" : ""}</span>)}
    </p>
  );
}

function isLyricsSection(line: string) {
  return /^(INTRO|VERSO(?:\s+\d+)?|CORO(?:\s+\d+)?|PUENTE(?:\s+\d+)?|OUTRO)\s*:?[\s]*$/i.test(line.trim());
}

function getPdfFileName(url: string) {
  if (!url) return "Sheet music.pdf";

  try {
    const fileName = new URL(url).pathname.split("/").pop();
    return fileName ? decodeURIComponent(fileName) : "Sheet music.pdf";
  } catch {
    const fileName = url.split("?")[0].split("/").pop();
    return fileName ? decodeURIComponent(fileName) : "Sheet music.pdf";
  }
}

function PdfIcon({ className = "size-7" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={className}>
      <path d="M7 2.75h6.5L19 8.25v13H7a2 2 0 0 1-2-2V4.75a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13 2.75v5.5h6M8.5 16.5h7M8.5 13h7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TabButton({ active, children, controls, onClick }: { active: boolean; children: React.ReactNode; controls: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={`relative min-h-12 shrink-0 px-0 text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:transition-colors ${active ? "text-white after:bg-emerald-400" : "text-zinc-500 after:bg-transparent hover:text-zinc-200"}`}
    >
      {children}
    </button>
  );
}
