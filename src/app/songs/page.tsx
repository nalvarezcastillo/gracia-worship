import type { Metadata } from "next";
import { LibraryView } from "@/components/library-view";
import { MainContainer } from "@/components/ui/main-container";
import type { SongSummary } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Songs | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function SongsPage() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .schema("public")
      .from("songs")
      .select("id, title, artist, key, bpm, duration, cover_url")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const songs: SongSummary[] = (data ?? []).map((song) => ({
      id: song.id,
      title: song.title,
      artist: song.artist,
      key: song.key,
      bpm: song.bpm,
      duration: song.duration,
      favorite: false,
      cover: song.cover_url || "/song-placeholder.svg",
    }));

    return <LibraryView songs={songs} isAdmin={await hasAuthenticatedUser()} />;
  } catch {
    return (
      <main className="min-h-screen py-8 sm:py-12">
        <MainContainer>
          <h1 className="text-4xl font-bold tracking-tight text-white">Songs</h1>
          <p className="mt-6 text-zinc-400">We couldn&apos;t load songs. Please try again later.</p>
        </MainContainer>
      </main>
    );
  }
}
