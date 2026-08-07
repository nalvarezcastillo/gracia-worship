"use client";

import { useEffect, useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import { SongMetadataLine } from "@/components/ui/song-tags";
import { readRecentSong, type RecentSong } from "@/lib/recent-song";

export function RecentSongCard() {
  const [recentSong, setRecentSong] = useState<RecentSong | null>(null);

  useEffect(() => {
    setRecentSong(readRecentSong());
  }, []);

  if (!recentSong) return null;

  return (
    <section className="mt-6" aria-labelledby="recent-song-title">
      <h2 id="recent-song-title" className="text-xl font-semibold text-white">Continuar donde quedé</h2>
      <div className="mt-3 rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-4 shadow-xl shadow-black/10 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-white">{recentSong.title}</h3>
          <SongMetadataLine songKey={recentSong.selectedKey} bpm={recentSong.bpm} timeSignature={recentSong.timeSignature} className="mt-1 font-normal" />
          <p className="mt-2 text-sm text-zinc-500">Última apertura: {formatRelativeTime(recentSong.timestamp)}</p>
        </div>
        <PrimaryButton href={`/song/${recentSong.id}`} className="mt-4 w-full shrink-0 sm:mt-0 sm:w-auto">▶ Reanudar</PrimaryButton>
      </div>
    </section>
  );
}

function formatRelativeTime(timestamp: number) {
  const now = new Date();
  const opened = new Date(timestamp);
  const elapsed = Math.max(0, now.getTime() - opened.getTime());
  const hours = Math.floor(elapsed / 3_600_000);
  if (elapsed < 3_600_000) return "Hace unos minutos";
  if (isSameDay(now, opened)) return hours <= 6 ? `Hace ${hours} ${hours === 1 ? "hora" : "horas"}` : "Hoy";

  const today = startOfDay(now);
  const openedDay = startOfDay(opened);
  const days = Math.max(1, Math.round((today - openedDay) / 86_400_000));
  return days === 1 ? "Ayer" : `Hace ${days} días`;
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
