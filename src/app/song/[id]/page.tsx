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

type SongDetail = Pick<SongRecord, "id" | "title" | "artist" | "key" | "bpm" | "time_signature" | "duration" | "audio_url" | "cover_url" | "lyrics" | "sheet_url">;

export default async function SongPage({ params, searchParams }: SongPageProps & { searchParams: Promise<{ service?: string }> }) {
  const { id } = await params;
  const requestedService = (await searchParams).service;
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const serviceId = requestedService ? requestedServiceId : undefined;
  let song: SongDetail | null = null;
  let songKeys: Pick<SongKeyRow, "id" | "key_name" | "audio_url" | "sheet_url" | "sort_order" | "grid_bpm" | "grid_beats_per_bar" | "grid_beat_unit" | "grid_offset_seconds">[] = [];
  const supabase = createSupabaseClient();

  try {
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, artist, key, bpm, time_signature, duration, audio_url, cover_url, lyrics, sheet_url")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    song = data as SongDetail | null;
  } catch {
    notFound();
  }

  const { data: keysData, error: keysError } = await supabase
    .from("song_keys")
    .select("id, key_name, audio_url, sheet_url, sort_order, grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds")
    .eq("song_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (keysError) {
    console.error("Unable to load public song keys:", keysError);
  } else {
    songKeys = (keysData ?? []) as Pick<SongKeyRow, "id" | "key_name" | "audio_url" | "sheet_url" | "sort_order" | "grid_bpm" | "grid_beats_per_bar" | "grid_beat_unit" | "grid_offset_seconds">[];
  }

  if (!song) notFound();
  const isAdmin = await hasAuthenticatedUser();

  return (
    <main className="min-h-screen pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:py-12">
      <MainContainer className="max-w-6xl">
        <SongDetailContent
          key={song.id}
          artist={song.artist}
          bpm={song.bpm}
          canAddToService={isAdmin}
          editHref={isAdmin ? `/admin/song/${song.id}` : undefined}
          keys={songKeys}
          legacyAudioUrl={song.audio_url}
          legacyKey={song.key}
          legacySheetUrl={song.sheet_url}
          lyrics={song.lyrics}
          coverUrl={song.cover_url}
          duration={song.duration}
          songId={song.id}
          serviceId={serviceId}
          enableMultitrack
          timeSignature={song.time_signature}
          title={song.title}
        />
      </MainContainer>
    </main>
  );
}
