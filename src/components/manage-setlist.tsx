"use client";

import { useMemo, useState } from "react";
import { MusicIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/action-button";
import type { SetlistSong } from "@/lib/setlist";
import { getSupabaseConfig } from "@/lib/supabase";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ManageSetlistProps = {
  allSongs: SetlistSong[];
  initialSongIds: string[];
};

type SupabaseErrorDetails = {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
};

function logSupabaseError(operation: string, error: SupabaseErrorDetails | null, status?: number) {
  console.error(`[Setlist] ${operation} failed`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    status: status ?? null,
  });
}

export function ManageSetlist({ allSongs, initialSongIds }: ManageSetlistProps) {
  const validInitialIds = initialSongIds.filter((id) => allSongs.some((song) => song.id === id));
  const [songIds, setSongIds] = useState(validInitialIds);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [draggedSongId, setDraggedSongId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const songsById = useMemo(() => new Map(allSongs.map((song) => [song.id, song])), [allSongs]);
  const availableSongs = allSongs.filter((song) => !songIds.includes(song.id));

  function addSong() {
    if (!selectedSongId || songIds.includes(selectedSongId)) return;
    setSongIds((current) => [...current, selectedSongId]);
    setSelectedSongId("");
    setMessage("");
  }

  function removeSong(id: string) {
    setSongIds((current) => current.filter((songId) => songId !== id));
    setMessage("");
  }

  function reorderSongs(targetId: string) {
    if (!draggedSongId || draggedSongId === targetId) return;

    setSongIds((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(draggedSongId);
      const targetIndex = next.indexOf(targetId);
      if (fromIndex === -1 || targetIndex === -1) return current;
      next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, draggedSongId);
      return next;
    });
    setDraggedSongId(null);
    setMessage("");
  }

  async function saveSetlist() {
    setIsSaving(true);
    setIsError(false);
    setMessage("Saving setlist...");

    try {
      const supabase = createSupabaseBrowserClient();
      const { url } = getSupabaseConfig();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        logSupabaseError("Session verification", sessionError);
        throw new Error("Unable to verify your session. Please sign in again.");
      }
      if (!sessionData.session) throw new Error("You must be signed in to save the setlist.");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        logSupabaseError("User verification", userError);
        throw new Error("Unable to verify your user. Please sign in again.");
      }
      if (!userData.user) throw new Error("You must be signed in to save the setlist.");

      const savedAt = new Date().toISOString();
      console.info("[Setlist] Supabase operation", {
        SUPABASE_URL: url,
        table: "active_setlist",
        operation: "update",
      });
      const { data, error, status } = await supabase
        .from("active_setlist")
        .update({ song_ids: songIds, updated_at: savedAt })
        .eq("id", 1)
        .select("id, song_ids")
        .single();

      if (error) {
        logSupabaseError("Save", error, status);
        throw new Error(error.message || "Unable to save the setlist.");
      }
      if (!data) throw new Error("Supabase did not return the saved setlist.");

      console.info("[Setlist] Supabase operation", {
        SUPABASE_URL: url,
        table: "active_setlist",
        operation: "select",
      });
      const { data: persisted, error: reloadError, status: reloadStatus } = await supabase
        .from("active_setlist")
        .select("song_ids")
        .eq("id", data.id)
        .single();

      if (reloadError) {
        logSupabaseError("Reload after save", reloadError, reloadStatus);
        throw new Error(reloadError.message || "Unable to confirm the saved setlist.");
      }

      const persistedSongIds = (persisted?.song_ids ?? []) as string[];
      if (persistedSongIds.length !== songIds.length || persistedSongIds.some((id, index) => id !== songIds[index])) {
        console.error("[Setlist] Persistence verification failed", {
          expectedSongIds: songIds,
          persistedSongIds,
        });
        throw new Error("The setlist order could not be confirmed after saving.");
      }

      setMessage("Setlist saved successfully");
    } catch (error) {
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to save the setlist.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-7 sm:mt-10">
      <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-4 shadow-xl shadow-black/10 sm:p-5">
        <label htmlFor="setlist-song" className="text-sm font-semibold text-zinc-300">Add from library</label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <select
            id="setlist-song"
            value={selectedSongId}
            onChange={(event) => setSelectedSongId(event.target.value)}
            className="min-h-12 min-w-0 flex-1 rounded-2xl border border-white/8 bg-zinc-950/60 px-4 text-base text-white outline-none transition-all duration-200 hover:border-white/12 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]"
          >
            <option value="">Select a song</option>
            {availableSongs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
          </select>
          <PrimaryButton type="button" onClick={addSong} disabled={!selectedSongId} className="sm:shrink-0">Add Song</PrimaryButton>
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-bold tracking-tight text-white">Songs</h2>
          <p className="text-xs text-zinc-500">Drag to reorder</p>
        </div>

        {songIds.length > 0 ? (
          <div className="mt-3 divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10">
            {songIds.map((id, index) => {
              const song = songsById.get(id);
              if (!song) return null;

              return (
                <div
                  key={id}
                  draggable
                  onDragStart={() => setDraggedSongId(id)}
                  onDragEnd={() => setDraggedSongId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorderSongs(id)}
                  className={`flex min-h-16 cursor-grab items-center gap-3 px-4 py-3 transition-colors duration-200 active:cursor-grabbing ${draggedSongId === id ? "bg-emerald-400/[0.08]" : "hover:bg-white/[0.035]"}`}
                >
                  <span aria-hidden="true" className="text-zinc-600">⋮⋮</span>
                  <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span>
                  <MusicIcon className="size-4 shrink-0 text-emerald-400/65" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{song.title}</span>
                  <button type="button" onClick={() => removeSong(id)} className="min-h-10 shrink-0 rounded-full px-3 text-sm font-semibold text-rose-300 transition-colors duration-200 hover:bg-rose-400/10 focus-visible:outline-2 focus-visible:outline-rose-400">Remove</button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">No songs in the setlist.</div>
        )}
      </section>

      <div>
        <PrimaryButton type="button" onClick={saveSetlist} disabled={isSaving} className="min-h-14 w-full">{isSaving ? "Saving..." : "Save Setlist"}</PrimaryButton>
        <p role="status" aria-live="polite" className={`mt-4 min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </div>
    </div>
  );
}
