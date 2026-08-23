"use client";

import { useEffect, useState } from "react";
import { AudioPlayer, AudioPlayerProvider } from "@/components/audio-player";
import { AddSongToServiceButton } from "@/components/add-song-to-service-button";
import type { PublicSongStem } from "@/components/multitrack-player";
import { SongContentTabs } from "@/components/song-content-tabs";
import { SongKeySelector, type PublicSongKey } from "@/components/song-key-selector";
import { SecondaryButton } from "@/components/ui/action-button";
import { SongMetadataLine } from "@/components/ui/song-tags";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MusicalGrid } from "@/lib/musical-grid";

type SongDetailContentProps = {
  bpm: number;
  canAddToService?: boolean;
  editHref?: string;
  enableMultitrack?: boolean;
  keys: PublicSongKey[];
  legacyAudioUrl: string;
  legacyKey: string;
  legacySheetUrl: string;
  lyrics: string;
  songId: string;
  serviceId?: number;
  initialKeyName?: string;
  headerNavigation?: React.ReactNode;
  rehearsalMode?: boolean;
  rehearsalProgressLabel?: string;
  rehearsalSubtitle?: string;
  timeSignature?: string | null;
  title: string;
};

export function SongDetailContent({
  bpm,
  canAddToService = false,
  editHref,
  enableMultitrack = false,
  keys,
  legacyAudioUrl,
  legacyKey,
  legacySheetUrl,
  lyrics,
  songId,
  serviceId,
  initialKeyName,
  headerNavigation,
  rehearsalMode = false,
  rehearsalProgressLabel,
  rehearsalSubtitle,
  timeSignature,
  title,
}: SongDetailContentProps) {
  const [selectedKey, setSelectedKey] = useState<PublicSongKey | null>(() =>
    keys.find((key) => key.key_name === initialKeyName)
      ?? keys.find((key) => key.key_name === legacyKey)
      ?? keys[0]
      ?? null,
  );
  const [hasSelectedKeyManually, setHasSelectedKeyManually] = useState(false);
  const [stemLoad, setStemLoad] = useState<{
    keyId: string | null;
    loading: boolean;
    stems: PublicSongStem[];
  }>({ keyId: null, loading: enableMultitrack, stems: [] });

  useEffect(() => {
    const key = selectedKey;
    const controller = new AbortController();
    let cancelled = false;

    if (!enableMultitrack || !key) {
      setStemLoad({ keyId: key?.id ?? null, loading: false, stems: [] });
      return () => { cancelled = true; controller.abort(); };
    }

    const selectedSongKey = key;
    setStemLoad({ keyId: selectedSongKey.id, loading: true, stems: [] });

    async function loadStems() {
      const supabase = createSupabaseBrowserClient();
      const { data, error, status } = await supabase
        .from("song_stems")
        .select("id, song_key_id, name, storage_path, sort_order, mime_type")
        .eq("song_key_id", selectedSongKey.id)
        .order("sort_order", { ascending: true })
        .abortSignal(controller.signal);

      if (cancelled || controller.signal.aborted) return;

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
    return () => { cancelled = true; controller.abort(); };
  }, [enableMultitrack, selectedKey]);

  const displayedKey = !hasSelectedKeyManually && initialKeyName ? initialKeyName : selectedKey?.key_name ?? legacyKey;
  const audioUrl = selectedKey ? (selectedKey.audio_url ?? "") : legacyAudioUrl;
  const sheetUrl = selectedKey ? (selectedKey.sheet_url ?? "") : legacySheetUrl;
  const mediaSelectionId = selectedKey?.id ?? "legacy";
  const selectedStems = stemLoad.keyId === selectedKey?.id ? stemLoad.stems : [];
  const loadingStems = enableMultitrack
    && selectedKey !== null
    && (stemLoad.keyId !== selectedKey.id || stemLoad.loading);
  const selectedGrid: MusicalGrid | null = selectedKey?.grid_bpm && selectedKey.grid_beats_per_bar && selectedKey.grid_beat_unit && selectedKey.grid_offset_seconds !== null ? { bpm: selectedKey.grid_bpm, beatsPerBar: selectedKey.grid_beats_per_bar, beatUnit: selectedKey.grid_beat_unit, gridOffsetSeconds: selectedKey.grid_offset_seconds } : null;

  return (
    <>
      {rehearsalMode ? <div className="lg:hidden"><h2 className="truncate text-[1.625rem] font-bold leading-8 tracking-[-0.03em] text-white">{title}</h2><div className="mt-1 flex items-center justify-between gap-3 text-[0.8125rem]"><p className="min-w-0 truncate text-zinc-500">{rehearsalSubtitle}</p><p className="shrink-0 font-semibold"><span className="text-emerald-300">{displayedKey}</span>{bpm ? <span className="text-zinc-500"> · {bpm} BPM</span> : null}</p></div></div> : null}
      <SongMetadataLine songKey={displayedKey} bpm={bpm} timeSignature={timeSignature} className={`${rehearsalMode ? "hidden" : ""} mt-2`} />
      {headerNavigation}
      <SongKeySelector keys={keys} selectedKey={selectedKey} onSelect={(key) => { setHasSelectedKeyManually(true); setSelectedKey(key); }} polished={enableMultitrack} />
      {editHref || canAddToService ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {editHref ? (
            <SecondaryButton href={editHref} className="min-h-11 gap-2 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">
              <PencilIcon />
              Editar
            </SecondaryButton>
          ) : null}
          {canAddToService ? <AddSongToServiceButton serviceId={serviceId} songId={songId} songTitle={title} /> : null}
        </div>
      ) : null}

      <AudioPlayerProvider key={mediaSelectionId} src={audioUrl} title={title}>
        {enableMultitrack ? (
            <SongContentTabs audioUrl={audioUrl} bpm={bpm} grid={selectedGrid} key={mediaSelectionId} lyrics={lyrics} rehearsalMode={rehearsalMode} sheetUrl={sheetUrl} stems={selectedStems} stemsLoading={loadingStems} timeSignature={timeSignature} title={title} />
        ) : (
          <>
            <div className={`sticky top-0 z-30 -mx-2 border-b border-white/[0.04] bg-zinc-950/90 px-2 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl ${rehearsalMode ? "mt-3 py-2 lg:static lg:mx-0 lg:mt-4 lg:border-0 lg:bg-transparent lg:px-0 lg:py-2 lg:shadow-none lg:backdrop-blur-none" : "mt-5 py-3 sm:mt-7"}`}>
              {rehearsalMode ? <div className="mb-2 flex h-10 items-center justify-between gap-3 border-b border-white/[0.06] text-xs lg:hidden"><span className="min-w-0 truncate font-semibold text-zinc-200">{title}</span><span className="shrink-0"><span className="text-emerald-300">{displayedKey}</span>{bpm ? <span className="text-zinc-500"> · {bpm} BPM</span> : null}{rehearsalProgressLabel ? <span className="ml-2 text-zinc-600">{rehearsalProgressLabel}</span> : null}</span></div> : null}
              <section className={`border border-white/[0.07] bg-zinc-900/90 shadow-xl shadow-black/15 ${rehearsalMode ? "rounded-xl px-3 py-2.5 lg:border-y lg:border-x-0 lg:bg-transparent lg:px-1 lg:py-3 lg:shadow-none" : "rounded-2xl p-4 sm:p-5"}`}><AudioPlayer /></section>
            </div>
            <SongContentTabs audioUrl={audioUrl} lyrics={lyrics} organized={false} rehearsalMode={rehearsalMode} sheetUrl={sheetUrl} stems={[]} title={title} />
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
