"use client";

import { useState } from "react";
import Link from "next/link";
import { SongDetailContent } from "@/components/song-detail-content";
import type { PublicSongKey } from "@/components/song-key-selector";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem, ServiceSongSetting, WorshipSongEntry } from "@/lib/service";
import { buildOperationalServiceEntries } from "@/lib/service-entries";

type RehearsalService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export type RehearsalSong = {
  id: string;
  title: string;
  key: string;
  bpm: number;
  duration: string;
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
  serviceId: number;
  songSettings: ServiceSongSetting[];
  songs: RehearsalSong[];
};

export function RehearsalMode({ items, loadError, service, serviceId, songSettings, songs }: RehearsalModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedSongIndex, setSelectedSongIndex] = useState<number | null>(null);
  const currentItem = items[currentIndex];
  const operationalEntries = buildOperationalServiceEntries(items, songs, songSettings);
  const directSongEntry = currentItem?.type === "song"
    ? operationalEntries.find((entry) => entry.kind === "song" && entry.item.id === currentItem.id)
    : null;
  const blockSongs = currentItem?.type === "worship"
    ? operationalEntries.filter((entry): entry is Extract<(typeof operationalEntries)[number], { kind: "song" }> => entry.kind === "song" && entry.item.id === currentItem.id).map((entry) => ({
        entry: { ...(entry.legacyEntry ?? { notes: entry.assignmentText ?? "", plannedDurationSeconds: entry.plannedDurationSeconds, songId: entry.song.id }), keyOverride: entry.effectiveKey },
        song: entry.song,
      }))
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
      <header className="border-b border-white/[0.07] pb-2.5 lg:pb-4">
        <p className="mb-2 hidden text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400 lg:block">Ensayo</p>
        <div className="flex items-center justify-between gap-3 lg:block"><h1 className="truncate text-xs font-medium text-zinc-500 lg:text-2xl lg:font-bold lg:tracking-[-0.025em] lg:text-white">
          {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
        </h1>{currentItem ? <p className="shrink-0 text-xs font-medium tabular-nums text-zinc-500 lg:hidden">{progressCurrent} / {progressTotal}</p> : null}</div>
        {currentItem ? <div className="mt-3 hidden items-baseline justify-between gap-4 lg:flex"><p className="min-w-0 truncate text-3xl font-bold text-white">{directSongEntry?.kind === "song" ? directSongEntry.song.title : selectedBlockSong?.song.title ?? currentItem.title}</p><p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-500">{progressCurrent} / {progressTotal}</p></div> : null}
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-zinc-800 lg:mt-3 lg:h-1" aria-hidden="true"><div className="h-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${progressPercent}%` }} /></div>
      </header>

      {loadError ? (
        <p role="alert" className="my-auto rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-8 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentItem ? (
        <section className="flex min-h-0 flex-1 flex-col pt-2.5 lg:pt-4" aria-live="polite" aria-atomic="true">
          {directSongEntry?.kind === "song" ? (
            <RehearsalSongView
              blockId={currentItem.id}
              blockSong={{
                entry: directSongEntry.legacyEntry ?? {
                  notes: directSongEntry.assignmentText ?? "",
                  plannedDurationSeconds: currentItem.planned_duration_seconds,
                  songId: directSongEntry.song.id,
                  keyOverride: directSongEntry.effectiveKey,
                },
                song: directSongEntry.song,
              }}
              canContinueService={!isLast}
              hasNextSong={false}
              hasPreviousSong={false}
              onContinueService={() => moveToServiceItem(currentIndex + 1)}
              onNextSong={() => undefined}
              onPreviousSong={() => undefined}
              progressLabel={`${progressCurrent} / ${progressTotal}`}
            />
          ) : selectedBlockSong ? (
            <RehearsalSongView
              blockId={currentItem.id}
              blockSong={selectedBlockSong}
              canContinueService={!isLast}
              hasNextSong={(selectedSongIndex ?? 0) < blockSongs.length - 1}
              hasPreviousSong={(selectedSongIndex ?? 0) > 0}
              onContinueService={() => moveToServiceItem(currentIndex + 1)}
              onNextSong={() => setSelectedSongIndex((index) => (index ?? 0) + 1)}
              onPreviousSong={() => setSelectedSongIndex((index) => Math.max(0, (index ?? 0) - 1))}
              progressLabel={`${progressCurrent} / ${progressTotal}`}
            />
          ) : (
            <>
              <article className="flex flex-1 flex-col items-start px-0 py-6 text-left lg:min-h-[42dvh] lg:items-center lg:justify-center lg:px-10 lg:py-10 lg:text-center">
                <h2 className={`text-2xl font-bold leading-tight tracking-[-0.04em] text-white lg:text-6xl ${currentItem.type === "worship" ? "uppercase" : ""}`}>
                  {currentItem.title}
                </h2>
                {currentItem.type === "text" && currentItem.details ? (
                  <p className="mt-3 text-base font-medium leading-7 text-zinc-400 lg:mt-6 lg:text-2xl lg:leading-8">
                    {currentItem.details}
                  </p>
                ) : null}
                {currentItem.type === "worship" ? (
                  <ul className="mt-4 w-full max-w-xl divide-y divide-white/[0.07] border-y border-white/[0.07] text-left lg:mt-8">
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
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/[0.07] bg-zinc-950/90 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:left-auto lg:right-8 lg:bottom-6 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Link href={`/service/${serviceId}`} className="mx-auto flex min-h-11 max-w-4xl items-center justify-center rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm font-semibold text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 lg:px-5 lg:shadow-xl lg:shadow-black/30">Finalizar ensayo</Link>
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
  progressLabel,
}: {
  blockId: string;
  blockSong: { entry: WorshipSongEntry; song: RehearsalSong };
  canContinueService: boolean;
  hasNextSong: boolean;
  hasPreviousSong: boolean;
  onContinueService: () => void;
  onNextSong: () => void;
  onPreviousSong: () => void;
  progressLabel: string;
}) {
  const { entry, song } = blockSong;

  return (
    <div className="flex-1 pb-2">
      {entry.notes ? <p className="mt-1 hidden text-sm text-zinc-500 lg:block">{entry.notes}</p> : null}

      <SongDetailContent
        key={`${blockId}:${song.id}`}
        bpm={song.bpm}
        initialKeyName={getSavedKeyName(entry)}
        headerNavigation={(
          <nav aria-label="Navegación de canciones del bloque" className="mt-3 grid grid-cols-2 gap-3 lg:mt-4">
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
        rehearsalProgressLabel={progressLabel}
        rehearsalSubtitle={entry.notes}
        songId={song.id}
        timeSignature={song.time_signature}
        title={song.title}
      />

    </div>
  );
}

function ServiceItemNavigation({ isFirst, isLast, onNext, onPrevious }: { isFirst: boolean; isLast: boolean; onNext: () => void; onPrevious: () => void }) {
  return (
    <nav aria-label="Navegación del ensayo" className="grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-3 sm:gap-4 sm:pt-6 lg:pt-5">
            <button
              type="button"
              disabled={isFirst}
              onClick={onPrevious}
              className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 lg:min-h-14 lg:rounded-2xl lg:px-4 lg:text-base"
            >
              ◀ Anterior
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={onNext}
              className="min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 lg:min-h-14 lg:rounded-2xl lg:border-0 lg:bg-emerald-400 lg:px-4 lg:text-base lg:text-zinc-950"
            >
              Siguiente ▶
            </button>
    </nav>
  );
}

const secondaryNavigationStyles = "min-h-11 rounded-xl border border-white/10 bg-white/[0.035] px-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 lg:min-h-14 lg:rounded-2xl lg:bg-white/[0.045] lg:px-4 lg:text-base lg:text-zinc-200";

function getSavedKeyName(entry: WorshipSongEntry) {
  const storedEntry = entry as unknown as Record<string, unknown>;
  const value = storedEntry.keyOverride
    ?? storedEntry.keyName
    ?? storedEntry.key_name
    ?? storedEntry.selectedKey
    ?? storedEntry.selected_key
    ?? storedEntry.key;
  return typeof value === "string" ? value : undefined;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
