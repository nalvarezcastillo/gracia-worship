import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EditSongForm } from "@/components/edit-song-form";
import { ManageSongKeys } from "@/components/manage-song-keys";
import { AppPage } from "@/components/app-page";
import type { SongRecord } from "@/lib/database.types";
import type { SongKeyRow, SongStemRow } from "@/lib/database.types";
import { hasAuthenticatedUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar canción | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=/admin/song/${id}`);
  let song: SongRecord | null = null;
  let songKeys: SongKeyRow[] = [];
  let songStems: SongStemRow[] = [];
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase.schema("public").from("songs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    song = data as SongRecord | null;
  } catch {
    notFound();
  }

  try {
    const { data: keysData, error: keysError } = await supabase
      .from("song_keys")
      .select("id, song_id, key_name, audio_url, sheet_url, grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds, sort_order, created_at")
      .eq("song_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (keysError) throw keysError;
    songKeys = (keysData ?? []) as SongKeyRow[];
  } catch (error) {
    console.error("Unable to load song keys in the editor:", error);
  }

  if (songKeys.length > 0) {
    try {
      const { data: stemsData, error: stemsError } = await supabase
        .from("song_stems")
        .select("id, song_key_id, name, storage_path, sort_order, mime_type, file_size_bytes, created_at")
        .in("song_key_id", songKeys.map((key) => key.id))
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (stemsError) throw stemsError;
      songStems = (stemsData ?? []) as SongStemRow[];
    } catch (error) {
      console.error("Unable to load song stems in the editor:", error);
    }
  }

  if (!song) notFound();

  return (
      <AppPage maxWidth="max-w-4xl" eyebrow="Biblioteca / Edición" title="Editar canción" description="Actualiza los datos de la canción y administra sus tonalidades y archivos.">
        <div className="pb-16 sm:pb-0"><EditSongForm song={song} />
        <ManageSongKeys songId={song.id} initialKeys={songKeys} initialStems={songStems} /></div>
      </AppPage>
  );
}
