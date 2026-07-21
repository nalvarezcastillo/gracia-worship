"use client";

import { useEffect, useState } from "react";

type SongContentTabsProps = {
  lyrics: string;
  sheetUrl: string;
  title: string;
};

export function SongContentTabs({ lyrics, sheetUrl, title }: SongContentTabsProps) {
  const [activeTab, setActiveTab] = useState<"lyrics" | "pdf">("lyrics");
  const [isPdfOpen, setIsPdfOpen] = useState(false);
  const pdfFileName = getPdfFileName(sheetUrl);

  useEffect(() => {
    if (!isPdfOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsPdfOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isPdfOpen]);

  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Song content" className="grid grid-cols-2 rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-1 shadow-sm shadow-black/10">
        <TabButton active={activeTab === "lyrics"} controls="lyrics-panel" onClick={() => setActiveTab("lyrics")}>Lyrics</TabButton>
        <TabButton active={activeTab === "pdf"} controls="pdf-panel" onClick={() => setActiveTab("pdf")}>PDF</TabButton>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10">
        {activeTab === "lyrics" ? (
          <div id="lyrics-panel" role="tabpanel" className="p-5 sm:p-6">
            {lyrics.trim() ? (
              <p className="whitespace-pre-wrap text-base leading-8 text-zinc-300">{lyrics}</p>
            ) : (
              <EmptyState>No lyrics available.</EmptyState>
            )}
          </div>
        ) : (
          <div id="pdf-panel" role="tabpanel" className="p-5 sm:p-6">
            {sheetUrl ? (
              <div className="flex flex-col gap-5 rounded-2xl border border-white/[0.07] bg-zinc-950/45 p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="grid size-14 shrink-0 place-items-center rounded-2xl border border-rose-400/15 bg-rose-400/[0.08] text-rose-300">
                  <PdfIcon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">PDF document</p>
                  <p className="mt-1.5 truncate font-semibold text-white" title={pdfFileName}>{pdfFileName}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPdfOpen(true)}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950 shadow-lg shadow-emerald-950/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-300 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400"
                >
                  Open PDF
                </button>
              </div>
            ) : (
              <EmptyState>Sheet music not available.</EmptyState>
            )}
          </div>
        )}
      </div>

      {isPdfOpen && sheetUrl ? (
        <div className="fixed inset-0 z-[100] flex flex-col bg-zinc-950" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
          <header className="flex min-h-16 shrink-0 items-center gap-4 border-b border-white/10 bg-zinc-950/95 px-4 shadow-xl shadow-black/25 sm:px-6">
            <PdfIcon className="size-6 shrink-0 text-rose-300" />
            <div className="min-w-0 flex-1">
              <h2 id="pdf-modal-title" className="truncate font-semibold text-white">{pdfFileName}</h2>
              <p className="text-xs text-zinc-500">Sheet music for {title}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsPdfOpen(false)}
              autoFocus
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] px-5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Close
            </button>
          </header>
          <iframe
            src={`${sheetUrl}#toolbar=1&navpanes=0&scrollbar=1&view=FitH`}
            title={`Sheet music for ${title}`}
            className="min-h-0 flex-1 border-0 bg-white"
          />
        </div>
      ) : null}
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
      className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${active ? "bg-white text-zinc-950 shadow-md shadow-black/20" : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full min-h-48 place-items-center px-6 py-12 text-center text-sm text-zinc-500">{children}</div>;
}
