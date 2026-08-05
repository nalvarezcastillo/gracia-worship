"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { AudioPlayer, useAudioPlayer } from "@/components/audio-player";
import { MultitrackPlayer, type PublicSongStem } from "@/components/multitrack-player";

const FullscreenPdfReader = dynamic(
  () => import("@/components/fullscreen-pdf-reader").then((module) => module.FullscreenPdfReader),
  { ssr: false },
);

type SongContentTabsProps = {
  audioUrl: string;
  lyrics: string;
  organized?: boolean;
  sheetUrl: string;
  stems: PublicSongStem[];
  stemsLoading?: boolean;
  title: string;
};

type SongSection = "audio" | "lyrics" | "pdf" | "multitrack";

export function SongContentTabs({ audioUrl, lyrics, organized = true, sheetUrl, stems, stemsLoading = false, title }: SongContentTabsProps) {
  if (!organized) return <LegacySongContent lyrics={lyrics} sheetUrl={sheetUrl} title={title} />;
  return <OrganizedSongContent audioUrl={audioUrl} lyrics={lyrics} sheetUrl={sheetUrl} stems={stems} stemsLoading={stemsLoading} title={title} />;
}

function OrganizedSongContent({ audioUrl, lyrics, sheetUrl, stems, stemsLoading = false, title }: SongContentTabsProps) {
  const audio = useAudioPlayer();
  const sections: { id: SongSection; label: string }[] = [
    ...(audioUrl ? [{ id: "audio" as const, label: "Audio" }] : []),
    ...(lyrics.trim() ? [{ id: "lyrics" as const, label: "Letra" }] : []),
    ...(sheetUrl ? [{ id: "pdf" as const, label: "Partitura" }] : []),
    ...(stems.length > 0 ? [{ id: "multitrack" as const, label: "Multitrack" }] : []),
  ];
  const [activeTab, setActiveTab] = useState<SongSection>(() => sections[0]?.id ?? "audio");
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const pdfFileName = getPdfFileName(sheetUrl);
  const visibleTab = sections.some((section) => section.id === activeTab)
    ? activeTab
    : sections[0]?.id;

  function selectSection(section: SongSection) {
    if (section === "multitrack") audio.pause();
    setActiveTab(section);
  }

  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Contenido de la canción" className="flex gap-1 overflow-x-auto border-b border-white/[0.08] pb-1">
        {sections.map((section) => (
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

      <div className="mt-5">
        {visibleTab !== "multitrack" && audioUrl && !(visibleTab === "pdf" && isPdfOpen) ? (
          <div className="sticky top-0 z-30 -mx-2 mb-5 border-b border-white/[0.04] bg-zinc-950/90 px-2 py-3 backdrop-blur-xl">
            <div className="rounded-2xl border border-white/[0.07] bg-zinc-900/90 p-4 sm:p-5">
              <AudioPlayer />
            </div>
          </div>
        ) : null}

        {visibleTab === "audio" ? <div id="audio-panel" role="tabpanel" /> : null}

        {visibleTab === "lyrics" ? (
          <div id="lyrics-panel" role="tabpanel">
            <p className="whitespace-pre-wrap text-base leading-8 text-zinc-300">{lyrics}</p>
          </div>
        ) : null}

        {visibleTab === "pdf" ? (
          <div id="pdf-panel" role="tabpanel">
            {sheetUrl ? (
              <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-zinc-950/45 p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.08] text-rose-300">
                  <PdfIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">Partitura</p>
                  <p className="mt-1.5 truncate font-semibold text-white" title={pdfFileName}>{pdfFileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfOpen(true)}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-300 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400"
                >
                  Abrir partitura
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {stems.length > 0 ? (
          <div id="multitrack-panel" role="tabpanel" hidden={visibleTab !== "multitrack"}>
            <MultitrackPlayer active={visibleTab === "multitrack"} stems={stems} title={title} />
          </div>
        ) : null}

        {!visibleTab && stemsLoading ? <p role="status" className="py-5 text-center text-sm text-zinc-400">Cargando pistas…</p> : null}
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

function LegacySongContent({ lyrics, sheetUrl, title }: Pick<SongContentTabsProps, "lyrics" | "sheetUrl" | "title">) {
  const [activeTab, setActiveTab] = useState<"lyrics" | "pdf">("lyrics");
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const pdfFileName = getPdfFileName(sheetUrl);

  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Song content" className={`grid ${sheetUrl ? "grid-cols-2" : "grid-cols-1"} rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-1`}>
        <TabButton active={activeTab === "lyrics"} controls="lyrics-panel" onClick={() => setActiveTab("lyrics")}>Letra</TabButton>
        {sheetUrl ? <TabButton active={activeTab === "pdf"} controls="pdf-panel" onClick={() => setActiveTab("pdf")}>Partitura</TabButton> : null}
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-5 sm:p-6">
        {activeTab === "lyrics"
          ? <p id="lyrics-panel" role="tabpanel" className="whitespace-pre-wrap text-base leading-8 text-zinc-300">{lyrics}</p>
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
      className={`min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${active ? "bg-emerald-400 text-zinc-950" : "text-zinc-400 hover:bg-white/[0.05] hover:text-white"}`}
    >
      {children}
    </button>
  );
}
