"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { SearchField } from "@/components/ui/search-field";
import { SongCard } from "@/components/song-card";
import type { SongSummary } from "@/lib/database.types";
import { createSupabaseClient } from "@/lib/supabase";

const FAVORITES_ENABLED = false;

export function LibraryView({ songs, isAdmin }: { songs: SongSummary[]; isAdmin: boolean }) {
  const [localSongs, setLocalSongs] = useState(songs);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [favoriteError, setFavoriteError] = useState("");
  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const songsByFilter = filter === "favorites" ? localSongs.filter((song) => song.favorite) : localSongs;
    if (!normalizedQuery) return songsByFilter;
    return songsByFilter.filter((song) =>
      `${song.title} ${song.artist} ${song.key}`.toLowerCase().includes(normalizedQuery),
    );
  }, [filter, localSongs, query]);

  async function toggleFavorite(id: string) {
    const currentSong = localSongs.find((song) => song.id === id);
    if (!currentSong || updatingIds.has(id)) return;
    const nextFavorite = !currentSong.favorite;

    setFavoriteError("");
    setLocalSongs((current) => current.map((song) => song.id === id ? { ...song, favorite: nextFavorite } : song));
    setUpdatingIds((current) => new Set(current).add(id));

    try {
      const supabase = createSupabaseClient();
      const { error } = await supabase.schema("public").from("songs").update({ favorite: nextFavorite }).eq("id", id);
      if (error) throw error;
    } catch {
      setLocalSongs((current) => current.map((song) => song.id === id ? { ...song, favorite: currentSong.favorite } : song));
      setFavoriteError("Unable to update favorite. Please try again.");
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer>
        <PageHeader title="Songs" aside={<p className="text-sm text-zinc-500">{filteredSongs.length} songs</p>} />
        <div className="sticky top-0 z-30 -mx-2 mt-4 border-b border-white/[0.04] bg-zinc-950/85 px-2 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:mt-6">
          <div className="max-w-2xl">
            <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs or artists" />
          </div>
        </div>
        {FAVORITES_ENABLED ? (
          <>
            <div className="mt-5 inline-flex rounded-full border border-white/8 bg-white/5 p-1" aria-label="Filter songs">
              {(["all", "favorites"] as const).map((option) => (
                <button key={option} type="button" onClick={() => setFilter(option)} aria-pressed={filter === option} className={`min-h-11 rounded-full px-5 text-sm font-semibold transition duration-200 ${filter === option ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white"}`}>
                  {option === "all" ? "All" : "Favorites"}
                </button>
              ))}
            </div>
            <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-rose-400">{favoriteError}</p>
          </>
        ) : null}

        {filteredSongs.length > 0 ? (
          <div className="mt-6 divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10">
            {filteredSongs.map((song) => <SongCard key={song.id} song={song} onToggleFavorite={toggleFavorite} isUpdating={updatingIds.has(song.id)} showFavorite={FAVORITES_ENABLED} />)}
          </div>
        ) : (
          <div className="mt-9 rounded-3xl border border-dashed border-white/10 py-20 text-center text-base text-zinc-500">
            {localSongs.length === 0 ? "No songs available" : filter === "favorites" && !query.trim() ? "No favorite songs." : "No songs found."}
          </div>
        )}
      </MainContainer>

      {isAdmin ? (
        <Link
          href="/admin/song/new"
          aria-label="Add new song"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-40 grid size-15 place-items-center rounded-full bg-emerald-400 text-3xl font-light text-zinc-950 shadow-2xl shadow-black/50 transition-all duration-200 ease-out hover:-translate-y-1 hover:bg-emerald-300 hover:shadow-emerald-950/40 active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:right-8 sm:size-16"
        >
          +
        </Link>
      ) : null}
    </main>
  );
}
