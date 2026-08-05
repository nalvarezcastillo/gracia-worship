"use client";

import { useState } from "react";
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

  function moveToServiceItem(nextIndex: number) {
    setSelectedSongIndex(null);
    setCurrentIndex(nextIndex);
  }

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <header className="border-b border-white/[0.07] pb-6 sm:pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Ensayo</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
        </h1>
        {service ? (
          <div className="mt-3 space-y-1 text-sm font-medium text-zinc-400 sm:flex sm:gap-3 sm:space-y-0 sm:text-base">
            <p>{service.service_date ? formatServiceDate(service.service_date) : "Fecha no configurada"}</p>
            <span className="hidden text-zinc-700 sm:inline" aria-hidden="true">•</span>
            <p>{formatServiceTime(service.service_time)}</p>
          </div>
        ) : null}
      </header>

      {loadError ? (
        <p role="alert" className="my-auto rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-8 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentItem ? (
        <section className="flex min-h-0 flex-1 flex-col pt-6 sm:pt-8" aria-live="polite" aria-atomic="true">
          <p className="text-center text-sm font-semibold tabular-nums text-zinc-500">
            {currentIndex + 1} de {items.length}
          </p>

          {selectedBlockSong ? (
            <RehearsalSongView
              blockId={currentItem.id}
              blockSong={selectedBlockSong}
              canContinueService={!isLast}
              hasNextSong={(selectedSongIndex ?? 0) < blockSongs.length - 1}
              hasPreviousSong={(selectedSongIndex ?? 0) > 0}
              onBack={() => setSelectedSongIndex(null)}
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
    </div>
  );
}

function RehearsalSongView({
  blockId,
  blockSong,
  canContinueService,
  hasNextSong,
  hasPreviousSong,
  onBack,
  onContinueService,
  onNextSong,
  onPreviousSong,
}: {
  blockId: string;
  blockSong: { entry: WorshipSongEntry; song: RehearsalSong };
  canContinueService: boolean;
  hasNextSong: boolean;
  hasPreviousSong: boolean;
  onBack: () => void;
  onContinueService: () => void;
  onNextSong: () => void;
  onPreviousSong: () => void;
}) {
  const { entry, song } = blockSong;

  return (
    <div className="flex-1 pb-2 pt-5 sm:pt-7">
      <button type="button" onClick={onBack} className="min-h-11 rounded-full px-3 text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">
        ← Volver al bloque
      </button>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{song.title}</h2>
      {entry.notes ? <p className="mt-1 text-sm text-zinc-500">{entry.notes}</p> : null}

      <SongDetailContent
        key={`${blockId}:${song.id}`}
        bpm={song.bpm}
        initialKeyName={getSavedKeyName(entry)}
        keys={song.keys}
        legacyAudioUrl={song.audio_url}
        legacyKey={song.key}
        legacySheetUrl={song.sheet_url}
        lyrics={song.lyrics}
        timeSignature={song.time_signature}
        title={song.title}
      />

      <nav aria-label="Navegación de canciones del bloque" className="mt-7 grid gap-3 border-t border-white/[0.07] pt-5 sm:grid-cols-2">
        {hasPreviousSong ? (
          <button type="button" onClick={onPreviousSong} className={secondaryNavigationStyles}>◀ Canción anterior</button>
        ) : <span />}
        {hasNextSong ? (
          <button type="button" onClick={onNextSong} className={primaryNavigationStyles}>Canción siguiente ▶</button>
        ) : (
          <button type="button" onClick={onContinueService} disabled={!canContinueService} className={primaryNavigationStyles}>
            {canContinueService ? "Continuar al siguiente elemento ▶" : "Fin del ensayo"}
          </button>
        )}
      </nav>
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

const secondaryNavigationStyles = "min-h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";
const primaryNavigationStyles = "min-h-14 rounded-2xl bg-emerald-400 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:col-start-2";

function getSavedKeyName(entry: WorshipSongEntry) {
  const storedEntry = entry as unknown as Record<string, unknown>;
  const value = storedEntry.keyName
    ?? storedEntry.key_name
    ?? storedEntry.selectedKey
    ?? storedEntry.selected_key
    ?? storedEntry.key;
  return typeof value === "string" ? value : undefined;
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("es-419", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatServiceTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
