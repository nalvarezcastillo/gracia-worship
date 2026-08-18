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

export default async function SongPage({ params, searchParams }: SongPageProps & { searchParams: Promise<{ service?: string }> }) {
  const { id } = await params;
  const requestedService = (await searchParams).service;
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const serviceId = requestedService ? requestedServiceId : undefined;
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
    <main className="min-h-screen py-6 sm:py-8">
      <MainContainer className="max-w-3xl lg:max-w-5xl">
        <header className="border-b border-white/[0.07] pb-5 lg:flex lg:items-end lg:justify-between">
          <div><p className="mb-2 hidden text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400 lg:block">Biblioteca / Canción</p>
          <h1 className="text-[1.75rem] font-bold tracking-[-0.035em] text-white sm:text-[2rem]">{song.title}</h1>
          </div>
        </header>

        <SongDetailContent
          key={song.id}
          bpm={song.bpm}
          canAddToService={isAdmin}
          editHref={isAdmin ? `/admin/song/${song.id}` : undefined}
          keys={songKeys}
          legacyAudioUrl={song.audio_url}
          legacyKey={song.key}
          legacySheetUrl={song.sheet_url}
          lyrics={song.lyrics}
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
