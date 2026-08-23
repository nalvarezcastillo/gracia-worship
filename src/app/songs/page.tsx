import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";
import { MainContainer } from "@/components/ui/main-container";
import type { SongSummary } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getSongCoverSource } from "@/lib/song-cover";

export const metadata: Metadata = { title: "Canciones | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function SongsPage({ searchParams }: { searchParams: Promise<{ deleted?: string | string[] }> }) {
  try {
    const deleted = (await searchParams).deleted;
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema("public")
      .from("songs")
      .select("id, title, artist, key, bpm, time_signature, duration, cover_url")
      .order("title", { ascending: true });

    if (error) throw error;

    const songs: SongSummary[] = (data ?? []).map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key,
      bpm: song.bpm,
      time_signature: song.time_signature,
      duration: song.duration,
      favorite: false,
      cover: getSongCoverSource(song.cover_url),
    }));

    return <LibraryView songs={songs} isAdmin={await hasAuthenticatedUser()} notice={deleted === "1" ? "Song deleted successfully." : undefined} />;
  } catch {
    return (
      <main className="min-h-screen py-8 sm:py-12">
        <MainContainer>
          <h1 className="text-[1.75rem] font-bold tracking-tight text-white sm:text-[2rem]">Canciones</h1>
          <p className="mt-6 text-zinc-400">No se pudieron cargar las canciones. Inténtalo nuevamente.</p>
        </MainContainer>
      </main>
    );
  }
}
