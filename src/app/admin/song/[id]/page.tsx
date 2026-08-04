import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EditSongForm } from "@/components/edit-song-form";
import { ManageSongKeys } from "@/components/manage-song-keys";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import type { SongRecord } from "@/lib/database.types";
import type { SongKeyRow } from "@/lib/database.types";
import { hasAuthenticatedUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar canción | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=/admin/song/${id}`);
  let song: SongRecord | null = null;
  let songKeys: SongKeyRow[] = [];
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
      .select("id, song_id, key_name, audio_url, sheet_url, sort_order, created_at")
      .eq("song_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (keysError) throw keysError;
    songKeys = (keysData ?? []) as SongKeyRow[];
  } catch (error) {
    console.error("Unable to load song keys in the editor:", error);
  }

  if (!song) notFound();

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <PageHeader title="Editar canción" description="Actualiza los datos de la canción o reemplaza sus archivos." />
        <EditSongForm song={song} />
        <ManageSongKeys songId={song.id} initialKeys={songKeys} />
      </MainContainer>
    </main>
  );
}
