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

export function LibraryView({ songs, isAdmin, notice }: { songs: SongSummary[]; isAdmin: boolean; notice?: string }) {
  const [localSongs, setLocalSongs] = useState(songs);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "favorites">("all");
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [favoriteError, setFavoriteError] = useState("");
  const hasSearch = query.trim().length > 0;
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
      <MainContainer className="lg:max-w-none lg:px-0">
        <div className="lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/[0.07] bg-zinc-950/35 px-5 py-7 lg:block">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Biblioteca</p>
          <nav aria-label="Secciones de canciones" className="mt-5 space-y-1 text-sm font-medium"><span className="block rounded-lg bg-emerald-400/[0.09] px-3 py-2.5 text-emerald-300">Todas las canciones</span>{FAVORITES_ENABLED ? <button type="button" onClick={() => setFilter("favorites")} className="block w-full rounded-lg px-3 py-2.5 text-left text-zinc-400 hover:bg-white/[0.04] hover:text-white">Favoritos</button> : null}</nav>
          <p className="mt-8 border-t border-white/[0.07] pt-5 text-xs leading-5 text-zinc-500">{localSongs.length} canciones en la biblioteca</p>
        </aside>
        <section className="min-w-0 lg:px-7 lg:py-7 xl:px-9">
        <PageHeader title="Canciones" aside={isAdmin ? <Link href="/admin/song/new" className="hidden min-h-10 items-center rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 lg:inline-flex">+ Agregar canción</Link> : null} />
        {notice ? <p role="status" className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm font-medium text-emerald-300">{notice}</p> : null}
        <div className="sticky top-0 z-30 -mx-2 mt-4 border-b border-white/[0.04] bg-zinc-950/85 px-2 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur-xl sm:mt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 sm:max-w-2xl">
              <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o artista..." />
            </div>
            <p role="status" aria-live="polite" className="shrink-0 text-right text-[0.8125rem] text-zinc-500 sm:min-w-40 sm:text-sm">
              {hasSearch ? `Mostrando ${filteredSongs.length} de ${localSongs.length} canciones` : `${localSongs.length} canciones`}
            </p>
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
          <div className="mt-6 divide-y divide-white/[0.06] border-y border-white/[0.06]">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_minmax(140px,1fr)_72px_72px_80px_32px] gap-4 border-b border-white/[0.06] px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-600 lg:grid"><span>Título</span><span>Artista</span><span>Key</span><span>BPM</span><span>Duración</span><span className="sr-only">Abrir</span></div>
            {filteredSongs.map((song) => <SongCard key={song.id} song={song} onToggleFavorite={toggleFavorite} isUpdating={updatingIds.has(song.id)} showFavorite={FAVORITES_ENABLED} />)}
          </div>
        ) : (
          <div className="mt-9 py-12 text-center text-base text-zinc-500">
            <p>{localSongs.length === 0 ? "No hay canciones disponibles." : filter === "favorites" && !hasSearch ? "No hay canciones favoritas." : "No se encontraron canciones."}</p>
            {hasSearch ? (
              <button type="button" onClick={() => setQuery("")} className="mt-4 min-h-11 rounded-xl border border-white/10 bg-zinc-900 px-4 text-sm font-semibold text-white transition-colors duration-200 hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">
                Limpiar búsqueda
              </button>
            ) : null}
          </div>
        )}
        </section>
        </div>
      </MainContainer>

      {isAdmin ? (
        <Link
          href="/admin/song/new"
          aria-label="Add new song"
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] right-5 z-40 grid size-15 place-items-center rounded-full bg-emerald-400 text-3xl font-light text-zinc-950 shadow-2xl shadow-black/50 transition-all duration-200 ease-out hover:-translate-y-1 hover:bg-emerald-300 hover:shadow-emerald-950/40 active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-emerald-400 sm:right-8 sm:size-16 lg:hidden"
        >
          +
        </Link>
      ) : null}
    </main>
  );
}
