import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SongDetailContent } from "@/components/song-detail-content";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { SongKeyRow, SongRecord } from "@/lib/database.types";
import { createSupabaseClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Song | Gracia Worship" };
export const dynamic = "force-dynamic";

type SongPageProps = {
  params: Promise<{ id: string }>;
};

type SongDetail = Pick<SongRecord, "id" | "title" | "key" | "bpm" | "time_signature" | "audio_url" | "lyrics" | "sheet_url">;

export default async function SongPage({ params }: SongPageProps) {
  const { id } = await params;
  let song: SongDetail | null = null;
  let songKeys: Pick<SongKeyRow, "id" | "key_name" | "audio_url" | "sheet_url" | "sort_order">[] = [];
  const supabase = createSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, key, bpm, time_signature, audio_url, lyrics, sheet_url")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    song = data as SongDetail | null;
  } catch {
    notFound();
  }

  const { data: keysData, error: keysError } = await supabase
    .from("song_keys")
    .select("id, key_name, audio_url, sheet_url, sort_order")
    .eq("song_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (keysError) {
    console.error("Unable to load public song keys:", keysError);
  } else {
    songKeys = (keysData ?? []) as Pick<SongKeyRow, "id" | "key_name" | "audio_url" | "sheet_url" | "sort_order">[];
  }

  if (!song) notFound();
  const isAdmin = await hasAuthenticatedUser();

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <header>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">{song.title}</h1>
        </header>

        <SongDetailContent
          key={song.id}
          bpm={song.bpm}
          editHref={isAdmin ? `/admin/song/${song.id}` : undefined}
          keys={songKeys}
          legacyAudioUrl={song.audio_url}
          legacyKey={song.key}
          legacySheetUrl={song.sheet_url}
          lyrics={song.lyrics}
          enableMultitrack
          timeSignature={song.time_signature}
          title={song.title}
        />
      </MainContainer>
    </main>
  );
}
