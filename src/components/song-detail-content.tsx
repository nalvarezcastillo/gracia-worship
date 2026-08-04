"use client";

import { useState } from "react";
import { AudioPlayer, AudioPlayerProvider } from "@/components/audio-player";
import { SongContentTabs } from "@/components/song-content-tabs";
import { SongKeySelector, type PublicSongKey } from "@/components/song-key-selector";
import { SecondaryButton } from "@/components/ui/action-button";
import { BpmTag, KeyTag } from "@/components/ui/song-tags";

type SongDetailContentProps = {
  bpm: number;
  editHref?: string;
  keys: PublicSongKey[];
  legacyAudioUrl: string;
  legacyKey: string;
  legacySheetUrl: string;
  lyrics: string;
  title: string;
};

export function SongDetailContent({
  bpm,
  editHref,
  keys,
  legacyAudioUrl,
  legacyKey,
  legacySheetUrl,
  lyrics,
  title,
}: SongDetailContentProps) {
  const [selectedKey, setSelectedKey] = useState<PublicSongKey | null>(() =>
    keys.find((key) => key.key_name === legacyKey) ?? keys[0] ?? null,
  );

  const displayedKey = selectedKey?.key_name ?? legacyKey;
  const audioUrl = selectedKey ? (selectedKey.audio_url ?? "") : legacyAudioUrl;
  const sheetUrl = selectedKey ? (selectedKey.sheet_url ?? "") : legacySheetUrl;
  const mediaSelectionId = selectedKey?.id ?? "legacy";

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <KeyTag value={displayedKey} />
        <BpmTag value={bpm} />
      </div>
      <SongKeySelector keys={keys} selectedKey={selectedKey} onSelect={setSelectedKey} />
      {editHref ? <SecondaryButton href={editHref} className="mt-5">Editar canción</SecondaryButton> : null}

      <AudioPlayerProvider key={mediaSelectionId} src={audioUrl} title={title}>
        <div className="sticky top-0 z-30 -mx-2 mt-5 border-b border-white/[0.04] bg-zinc-950/90 px-2 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:mt-7">
          <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/90 p-4 shadow-xl shadow-black/15 sm:p-5">
            <AudioPlayer />
          </section>
        </div>

        <SongContentTabs lyrics={lyrics} sheetUrl={sheetUrl} title={title} />
      </AudioPlayerProvider>
    </>
  );
}
