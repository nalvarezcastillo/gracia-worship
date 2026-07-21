import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AudioPlayer } from "@/components/audio-player";
import { SongContentTabs } from "@/components/song-content-tabs";
import { SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { BpmTag, KeyTag } from "@/components/ui/song-tags";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { SongRecord } from "@/lib/database.types";
import { createSupabaseClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Song | Gracia Worship" };
export const dynamic = "force-dynamic";

type SongPageProps = {
  params: Promise<{ id: string }>;
};

type SongDetail = Pick<SongRecord, "id" | "title" | "key" | "bpm" | "audio_url" | "lyrics" | "sheet_url">;

export default async function SongPage({ params }: SongPageProps) {
  const { id } = await params;
  let song: SongDetail | null = null;

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, key, bpm, audio_url, lyrics, sheet_url")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    song = data as SongDetail | null;
  } catch {
    notFound();
  }

  if (!song) notFound();
  const isAdmin = await hasAuthenticatedUser();

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <header>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">{song.title}</h1>
          <div className="mt-4 flex items-center gap-2">
            <KeyTag value={song.key} />
            <BpmTag value={song.bpm} />
          </div>
          {isAdmin ? <SecondaryButton href={`/admin/song/${song.id}`} className="mt-5">Edit Song</SecondaryButton> : null}
        </header>

        <div className="sticky top-0 z-30 -mx-2 mt-5 border-b border-white/[0.04] bg-zinc-950/90 px-2 py-3 shadow-[0_10px_24px_rgba(0,0,0,0.18)] backdrop-blur-xl sm:mt-7">
          <section className="rounded-2xl border border-white/[0.07] bg-zinc-900/90 p-4 shadow-xl shadow-black/15 sm:p-5">
            <AudioPlayer key={song.id} src={song.audio_url} title={song.title} />
          </section>
        </div>

        <SongContentTabs lyrics={song.lyrics} sheetUrl={song.sheet_url} title={song.title} />
      </MainContainer>
    </main>
  );
}
