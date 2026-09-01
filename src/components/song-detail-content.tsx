"use client";

import { useEffect, useState } from "react";
import { AudioPlayer, AudioPlayerProvider } from "@/components/audio-player";
import { AddSongToServiceButton } from "@/components/add-song-to-service-button";
import type { PublicSongStem } from "@/components/multitrack-player";
import { SongCover } from "@/components/song-cover";
import { SongContentTabs } from "@/components/song-content-tabs";
import { SongKeySelector, type PublicSongKey } from "@/components/song-key-selector";
import { SecondaryButton } from "@/components/ui/action-button";
import { SongMetadataLine } from "@/components/ui/song-tags";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MusicalGrid } from "@/lib/musical-grid";
import type { SongSection } from "@/lib/song-sections";

type SongDetailContentProps = {
  artist?: string;
  bpm: number;
  canAddToService?: boolean;
  editHref?: string;
  enableMultitrack?: boolean;
  coverUrl?: string;
  duration?: string;
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
  artist,
  bpm,
  canAddToService = false,
  editHref,
  enableMultitrack = false,
  coverUrl,
  duration,
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
  const [sectionLoad, setSectionLoad] = useState<{ keyId: string | null; sections: SongSection[] }>({ keyId: null, sections: [] });

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

  useEffect(() => {
    const keyId = selectedKey?.id;
    const controller = new AbortController();
    let current = true;
    if (!keyId) {
      setSectionLoad({ keyId: null, sections: [] });
      return () => { current = false; controller.abort(); };
    }
    setSectionLoad({ keyId, sections: [] });
    void createSupabaseBrowserClient()
      .from("song_sections")
      .select("id, song_key_id, label, section_type, start_seconds, bar_number, beat_number, beat_fraction, sort_order")
      .eq("song_key_id", keyId)
      .order("start_seconds")
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (!current || controller.signal.aborted) return;
        if (error) console.error("[Song Detail] Unable to load song sections", error);
        setSectionLoad({ keyId, sections: (data ?? []) as SongSection[] });
      });
    return () => { current = false; controller.abort(); };
  }, [selectedKey]);

  const displayedKey = !hasSelectedKeyManually && initialKeyName ? initialKeyName : selectedKey?.key_name ?? legacyKey;
  const audioUrl = selectedKey ? (selectedKey.audio_url ?? "") : legacyAudioUrl;
  const sheetUrl = selectedKey ? (selectedKey.sheet_url ?? "") : legacySheetUrl;
  const mediaSelectionId = selectedKey?.id ?? "legacy";
  const selectedStems = stemLoad.keyId === selectedKey?.id ? stemLoad.stems : [];
  const selectedSections = sectionLoad.keyId === selectedKey?.id ? sectionLoad.sections : [];
  const loadingStems = enableMultitrack
    && selectedKey !== null
    && (stemLoad.keyId !== selectedKey.id || stemLoad.loading);
  const selectedGrid: MusicalGrid | null = selectedKey?.grid_bpm && selectedKey.grid_beats_per_bar && selectedKey.grid_beat_unit && selectedKey.grid_offset_seconds !== null ? { bpm: selectedKey.grid_bpm, beatsPerBar: selectedKey.grid_beats_per_bar, beatUnit: selectedKey.grid_beat_unit, gridOffsetSeconds: selectedKey.grid_offset_seconds } : null;

  return (
    <>
      {rehearsalMode ? <div className="lg:hidden"><h2 className="truncate text-[1.625rem] font-bold leading-8 tracking-[-0.03em] text-white">{title}</h2><div className="mt-1 flex items-center justify-between gap-3 text-[0.8125rem]"><p className="min-w-0 truncate text-zinc-500">{rehearsalSubtitle}</p><p className="shrink-0 font-semibold"><span className="text-emerald-300">{displayedKey}</span>{bpm ? <span className="text-zinc-500"> · {bpm} BPM</span> : null}</p></div></div> : null}
      {!rehearsalMode ? <section className="relative overflow-hidden border-b border-white/[0.07] pb-6 sm:pb-10 lg:pb-12"><div aria-hidden="true" className="pointer-events-none absolute -left-20 -top-24 size-80 rounded-full bg-emerald-400/[0.055] blur-3xl" /><p className="relative mb-3 text-[0.625rem] font-bold uppercase tracking-[0.18em] text-emerald-400 sm:hidden">Biblioteca / Canción</p><div className="relative grid grid-cols-[clamp(7rem,34vw,8.5rem)_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-end sm:gap-x-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-10"><SongCover src={coverUrl ?? ""} alt={`Portada de ${title}`} width={220} height={220} priority className="aspect-square w-full rounded-xl object-cover shadow-2xl shadow-black/50 ring-1 ring-white/10" /><div className="min-w-0 pb-1"><p className="hidden text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-emerald-400 sm:block">Biblioteca / Canción</p><h1 className="max-w-4xl break-words text-pretty text-[1.5rem] font-bold leading-[1.08] tracking-[-0.035em] text-white sm:mt-3 sm:text-5xl sm:leading-[1.02] sm:tracking-[-0.045em] lg:text-[3.5rem]">{title}</h1>{artist ? <p className="mt-1.5 break-words text-sm font-medium leading-5 text-zinc-400 sm:mt-3 sm:text-lg">{artist}</p> : null}<dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:mt-6 sm:flex sm:flex-wrap sm:items-end sm:gap-x-7 sm:gap-y-4"><HeroMetric label="Key" value={displayedKey} accent /><HeroMetric label="BPM" value={bpm ? String(bpm) : ""} /><HeroMetric label="Compás" value={timeSignature ?? ""} /><HeroMetric label="Duración" value={duration ?? ""} /></dl></div><div className="col-span-2 mt-4 flex flex-wrap items-center gap-2 sm:col-start-2 sm:mt-6">{canAddToService ? <AddSongToServiceButton serviceId={serviceId} songId={songId} songTitle={title} primary /> : null}{editHref ? <SecondaryButton href={editHref} className="min-h-11 rounded-xl border-white/[0.08] bg-transparent px-4 text-sm shadow-none hover:translate-y-0 hover:bg-white/[0.05] hover:shadow-none active:scale-100"><PencilIcon /> Editar</SecondaryButton> : null}</div></div></section> : <SongMetadataLine songKey={displayedKey} bpm={bpm} timeSignature={timeSignature} className="mt-2 hidden" />}
      {headerNavigation}
      <SongKeySelector keys={keys} selectedKey={selectedKey} onSelect={(key) => { setHasSelectedKeyManually(true); setSelectedKey(key); }} polished={enableMultitrack} />

      <AudioPlayerProvider key={mediaSelectionId} src={audioUrl} title={title}>
        {enableMultitrack ? (
            <SongContentTabs artist={artist} audioUrl={audioUrl} bpm={bpm} durationLabel={duration} grid={selectedGrid} key={mediaSelectionId} keyName={displayedKey} keyVariantCount={keys.length} lyrics={lyrics} rehearsalMode={rehearsalMode} sections={selectedSections} sheetUrl={sheetUrl} stems={selectedStems} stemsLoading={loadingStems} timeSignature={timeSignature} title={title} />
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

function HeroMetric({ accent = false, label, value }: { accent?: boolean; label: string; value: string }) {
  if (!value.trim()) return null;
  return <div><dt className="text-[0.625rem] font-bold uppercase tracking-[0.17em] text-zinc-600">{label}</dt><dd className={`mt-1 text-base font-semibold tabular-nums ${accent ? "text-emerald-300" : "text-zinc-200"}`}>{value}</dd></div>;
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4">
      <path d="m14.7 5.3 4 4M4 20l1.1-4.4L15.6 5.1a2.1 2.1 0 0 1 3 3L8.1 18.6 4 20Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
