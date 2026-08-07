"use client";

import { useState } from "react";
import Link from "next/link";
import { SongDetailContent } from "@/components/song-detail-content";
import type { PublicSongKey } from "@/components/song-key-selector";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem, WorshipSongEntry } from "@/lib/service";

type RehearsalService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export type RehearsalSong = {
  id: string;
  title: string;
  key: string;
  bpm: number;
  time_signature: string | null;
  audio_url: string;
  sheet_url: string;
  lyrics: string;
  keys: PublicSongKey[];
};

type RehearsalModeProps = {
  items: ServiceItem[];
  loadError?: string;
  service: RehearsalService | null;
  songs: RehearsalSong[];
};

export function RehearsalMode({ items, loadError, service, songs }: RehearsalModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const currentItem = items[currentIndex];
  const blockSongs = currentItem?.type === "worship"
    ? (currentItem.song_ids ?? []).flatMap((entry) => {
        const song = songs.find((candidate) => candidate.id === entry.songId);
        return song ? [{ entry, song }] : [];
      })
    : [];
  const selectedBlockSong = selectedSongIndex === null ? null : blockSongs[selectedSongIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= items.length - 1;
  const progressCurrent = selectedSongIndex === null ? currentIndex + 1 : selectedSongIndex + 1;
  const progressTotal = selectedSongIndex === null ? items.length : blockSongs.length;
  const progressPercent = progressTotal ? (progressCurrent / progressTotal) * 100 : 0;

  function moveToServiceItem(nextIndex: number) {
    setSelectedSongIndex(null);
    setCurrentIndex(nextIndex);
  }

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col pb-24 sm:min-h-[calc(100dvh-5rem)]">
      <header className="border-b border-white/[0.07] pb-4">
        <h1 className="text-xl font-bold tracking-[-0.025em] text-white sm:text-2xl">
          {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
        </h1>
        {currentItem ? <div className="mt-3 flex items-baseline justify-between gap-4"><p className="min-w-0 truncate text-2xl font-bold text-white sm:text-3xl">{selectedBlockSong?.song.title ?? currentItem.title}</p><p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-500">{progressCurrent} / {progressTotal}</p></div> : null}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true"><div className="h-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${progressPercent}%` }} /></div>
      </header>

      {loadError ? (
        <p role="alert" className="my-auto rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-8 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentItem ? (
        <section className="flex min-h-0 flex-1 flex-col pt-4" aria-live="polite" aria-atomic="true">
          {selectedBlockSong ? (
            <RehearsalSongView
              blockId={currentItem.id}
              blockSong={selectedBlockSong}
              canContinueService={!isLast}
              hasNextSong={(selectedSongIndex ?? 0) < blockSongs.length - 1}
              hasPreviousSong={(selectedSongIndex ?? 0) > 0}
              onContinueService={() => moveToServiceItem(currentIndex + 1)}
              onNextSong={() => setSelectedSongIndex((index) => (index ?? 0) + 1)}
              onPreviousSong={() => setSelectedSongIndex((index) => Math.max(0, (index ?? 0) - 1))}
            />
          ) : (
            <>
              <article className="flex min-h-[42dvh] flex-1 flex-col items-center justify-center px-4 py-10 text-center sm:px-10">
                <h2 className={`text-4xl font-bold leading-tight tracking-[-0.04em] text-white sm:text-6xl ${currentItem.type === "worship" ? "uppercase" : ""}`}>
                  {currentItem.title}
                </h2>
                {currentItem.type === "text" && currentItem.details ? (
                  <p className="mt-6 text-lg font-medium leading-8 text-zinc-400 sm:text-2xl">
                    {currentItem.details}
                  </p>
                ) : null}
                {currentItem.type === "worship" ? (
                  <ul className="mt-8 w-full max-w-xl divide-y divide-white/[0.07] border-y border-white/[0.07] text-left">
                    {blockSongs.map(({ entry, song }, index) => (
                      <li key={song.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedSongIndex(index)}
                          className="flex min-h-16 w-full items-center justify-between gap-4 px-1 py-3 text-left transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-base font-semibold text-white sm:text-lg">{song.title}</span>
                            {entry.notes ? <span className="mt-0.5 block truncate text-sm text-zinc-500">{entry.notes}</span> : null}
                          </span>
                          <span aria-hidden="true" className="shrink-0 text-zinc-600">›</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>

              <ServiceItemNavigation
                isFirst={isFirst}
                isLast={isLast}
                onPrevious={() => moveToServiceItem(Math.max(0, currentIndex - 1))}
                onNext={() => moveToServiceItem(Math.min(items.length - 1, currentIndex + 1))}
              />
            </>
          )}
        </section>
      ) : (
        <div className="my-auto rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">
          No hay elementos en el servicio actual.
        </div>
      )}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-zinc-950/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <Link href="/service" className="mx-auto flex min-h-12 max-w-4xl items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 px-4 font-semibold text-zinc-100 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Finalizar ensayo</Link>
      </div>
    </div>
  );
}

function RehearsalSongView({
  blockId,
  blockSong,
  canContinueService,
  hasNextSong,
  hasPreviousSong,
  onContinueService,
  onNextSong,
  onPreviousSong,
}: {
  blockId: string;
  blockSong: { entry: WorshipSongEntry; song: RehearsalSong };
  canContinueService: boolean;
  hasNextSong: boolean;
  hasPreviousSong: boolean;
  onContinueService: () => void;
  onNextSong: () => void;
  onPreviousSong: () => void;
}) {
  const { entry, song } = blockSong;

  return (
    <div className="flex-1 pb-2">
      {entry.notes ? <p className="mt-1 text-sm text-zinc-500">{entry.notes}</p> : null}

      <SongDetailContent
        key={`${blockId}:${song.id}`}
        bpm={song.bpm}
        initialKeyName={getSavedKeyName(entry)}
        headerNavigation={(
          <nav aria-label="Navegación de canciones del bloque" className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={onPreviousSong} disabled={!hasPreviousSong} className={secondaryNavigationStyles}>◀ Canción anterior</button>
            <button type="button" onClick={hasNextSong ? onNextSong : onContinueService} disabled={!hasNextSong && !canContinueService} className={secondaryNavigationStyles}>
              {hasNextSong ? "Canción siguiente ▶" : canContinueService ? "Siguiente elemento ▶" : "Canción siguiente ▶"}
            </button>
          </nav>
        )}
        keys={song.keys}
        legacyAudioUrl={song.audio_url}
        legacyKey={song.key}
        legacySheetUrl={song.sheet_url}
        lyrics={song.lyrics}
        rehearsalMode
        songId={song.id}
        timeSignature={song.time_signature}
        title={song.title}
      />

    </div>
  );
}

function ServiceItemNavigation({ isFirst, isLast, onNext, onPrevious }: { isFirst: boolean; isLast: boolean; onNext: () => void; onPrevious: () => void }) {
  return (
    <nav aria-label="Navegación del ensayo" className="grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-5 sm:gap-4 sm:pt-6">
            <button
              type="button"
              disabled={isFirst}
              onClick={onPrevious}
              className="min-h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              ◀ Anterior
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={onNext}
              className="min-h-14 rounded-2xl bg-emerald-400 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Siguiente ▶
            </button>
    </nav>
  );
}

const secondaryNavigationStyles = "min-h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-4 sm:text-base";

function getSavedKeyName(entry: WorshipSongEntry) {
  const storedEntry = entry as unknown as Record<string, unknown>;
  const value = storedEntry.keyName
    ?? storedEntry.key_name
    ?? storedEntry.selectedKey
    ?? storedEntry.selected_key
    ?? storedEntry.key;
  return typeof value === "string" ? value : undefined;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
