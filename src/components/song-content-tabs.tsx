"use client";

import { useState } from "react";

type SongContentTabsProps = {
  lyrics: string;
  sheetUrl: string;
  title: string;
};

export function SongContentTabs({ lyrics, sheetUrl, title }: SongContentTabsProps) {
  const [activeTab, setActiveTab] = useState<"lyrics" | "pdf">("lyrics");

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
          <div id="pdf-panel" role="tabpanel" className="h-[55vh] min-h-96 overflow-hidden bg-zinc-900">
            {sheetUrl ? (
              <iframe
                src={`${sheetUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
                title={`Sheet music for ${title}`}
                className="h-full w-full border-0 bg-white"
              />
            ) : (
              <EmptyState>Sheet music not available.</EmptyState>
            )}
          </div>
        )}
      </div>
    </section>
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
