"use client";

import { useEffect, useState } from "react";
import { AudioPlayer, AudioPlayerProvider } from "@/components/audio-player";
import type { PublicSongStem } from "@/components/multitrack-player";
import { SongContentTabs } from "@/components/song-content-tabs";
import { SongKeySelector, type PublicSongKey } from "@/components/song-key-selector";
import { SecondaryButton } from "@/components/ui/action-button";
import { SongMetadataLine } from "@/components/ui/song-tags";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type SongDetailContentProps = {
  bpm: number;
  editHref?: string;
  enableMultitrack?: boolean;
  keys: PublicSongKey[];
  legacyAudioUrl: string;
  legacyKey: string;
  legacySheetUrl: string;
  lyrics: string;
  initialKeyName?: string;
  timeSignature?: string | null;
  title: string;
};

export function SongDetailContent({
  bpm,
  editHref,
  enableMultitrack = false,
  keys,
  legacyAudioUrl,
  legacyKey,
  legacySheetUrl,
  lyrics,
  initialKeyName,
  timeSignature,
  title,
}: SongDetailContentProps) {
  const [selectedKey, setSelectedKey] = useState<PublicSongKey | null>(() =>
    keys.find((key) => key.key_name === initialKeyName)
      ?? keys.find((key) => key.key_name === legacyKey)
      ?? keys[0]
      ?? null,
  );
  const [stemLoad, setStemLoad] = useState<{
    keyId: string | null;
    loading: boolean;
    stems: PublicSongStem[];
  }>({ keyId: null, loading: enableMultitrack, stems: [] });

  useEffect(() => {
    const key = selectedKey;
    let cancelled = false;

    if (!enableMultitrack || !key) {
      setStemLoad({ keyId: key?.id ?? null, loading: false, stems: [] });
      return () => { cancelled = true; };
    }

    const selectedSongKey = key;
    setStemLoad({ keyId: selectedSongKey.id, loading: true, stems: [] });

    async function loadStems() {
      const supabase = createSupabaseBrowserClient();
      const { data, error, status } = await supabase
        .from("song_stems")
        .select("id, song_key_id, name, storage_path, sort_order, mime_type")
        .eq("song_key_id", selectedSongKey.id)
        .order("sort_order", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("[Song Detail] Unable to load selected-key stems", {
          selectedSongKeyId: selectedSongKey.id,
          selectedKeyName: selectedSongKey.key_name,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          status,
        });
        if (process.env.NODE_ENV !== "production") {
          console.info("[Song Detail] Stem render decision", {
            selectedSongKeyId: selectedSongKey.id,
            selectedKeyName: selectedSongKey.key_name,
            stemCount: 0,
            stemQueryError: error,
            storagePaths: [],
            renderDecision: "fallback audio",
          });
        }
        setStemLoad({ keyId: selectedSongKey.id, loading: false, stems: [] });
        return;
      }

      const validRows = (data ?? []).filter((stem) =>
        stem.song_key_id === selectedSongKey.id && Boolean(stem.id && stem.name && stem.storage_path),
      );
      const stems = validRows.map((stem) => ({
        id: stem.id,
        name: stem.name,
        publicUrl: supabase.storage.from("songs").getPublicUrl(stem.storage_path).data.publicUrl,
        song_key_id: stem.song_key_id,
        sort_order: stem.sort_order,
      }));

      if (process.env.NODE_ENV !== "production") {
        console.info("[Song Detail] Stem render decision", {
          selectedSongKeyId: selectedSongKey.id,
          selectedKeyName: selectedSongKey.key_name,
          stemCount: stems.length,
          stemQueryError: null,
          storagePaths: validRows.map((stem) => stem.storage_path),
          renderDecision: stems.length > 0 ? "multitrack" : "fallback audio",
        });
      }
      setStemLoad({ keyId: selectedSongKey.id, loading: false, stems });
    }

    void loadStems();
    return () => { cancelled = true; };
  }, [enableMultitrack, selectedKey]);

  const displayedKey = selectedKey?.key_name ?? legacyKey;
  const audioUrl = selectedKey ? (selectedKey.audio_url ?? "") : legacyAudioUrl;
  const sheetUrl = selectedKey ? (selectedKey.sheet_url ?? "") : legacySheetUrl;
  const mediaSelectionId = selectedKey?.id ?? "legacy";
  const selectedStems = stemLoad.keyId === selectedKey?.id ? stemLoad.stems : [];
  const loadingStems = enableMultitrack
    && selectedKey !== null
    && (stemLoad.keyId !== selectedKey.id || stemLoad.loading);

  return (
    <>
      <SongMetadataLine songKey={displayedKey} bpm={bpm} timeSignature={timeSignature} className="mt-2" />
      <SongKeySelector keys={keys} selectedKey={selectedKey} onSelect={setSelectedKey} polished={enableMultitrack} />
      {editHref ? (
        <SecondaryButton href={editHref} className="mt-3 min-h-11 gap-2 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">
          <PencilIcon />
          Editar
        </SecondaryButton>
      ) : null}

      <AudioPlayerProvider key={mediaSelectionId} src={audioUrl} title={title}>
        {enableMultitrack ? (
          <SongContentTabs audioUrl={audioUrl} key={mediaSelectionId} lyrics={lyrics} sheetUrl={sheetUrl} stems={selectedStems} stemsLoading={loadingStems} title={title} />
        ) : (
          <>
            <div className="sticky top-0 z-30 -mx-2 mt-5 border-b border-white/[0.04] bg-zinc-950/90 px-2 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:mt-7">
              <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/90 p-4 shadow-xl shadow-black/15 sm:p-5"><AudioPlayer /></section>
            </div>
            <SongContentTabs audioUrl={audioUrl} lyrics={lyrics} organized={false} sheetUrl={sheetUrl} stems={[]} title={title} />
          </>
        )}
      </AudioPlayerProvider>
    </>
  );
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="m14.7 5.3 4 4M4 20l1.1-4.4L15.6 5.1a2.1 2.1 0 0 1 3 3L8.1 18.6 4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
