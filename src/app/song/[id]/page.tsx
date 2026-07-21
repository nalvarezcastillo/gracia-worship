import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AudioPlayer } from "@/components/audio-player";
import { SongResourceButtons } from "@/components/song-resource-buttons";
import { SecondaryButton } from "@/components/ui/action-button";
import type { SongRecord } from "@/lib/database.types";
import { createSupabaseClient } from "@/lib/supabase";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Song | Gracia Worship" };
export const dynamic = "force-dynamic";

type SongPageProps = {
  params: Promise<{ id: string }>;
};

export default async function SongPage({ params }: SongPageProps) {
  const { id } = await params;
  let song: SongRecord | null = null;

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    song = data as SongRecord | null;
  } catch {
    notFound();
  }

  if (!song) notFound();
  const isAdmin = await hasAuthenticatedUser();

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <Link href="/songs" className="inline-flex rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">← Back</Link>

        <header className="mt-8 grid gap-7 sm:grid-cols-[240px_1fr] sm:items-end lg:grid-cols-[300px_1fr]">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-800 shadow-2xl shadow-black/40">
            <Image src={song.cover_url || "/song-placeholder.svg"} alt={`Cover for ${song.title}`} fill priority sizes="(max-width: 640px) calc(100vw - 32px), 300px" className="object-cover" />
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">{song.title}</h1>
            <p className="mt-3 text-lg text-zinc-300">{song.artist}</p>
            <dl className="mt-7 flex flex-wrap gap-3">
              <SongFact label="Key" value={song.key} />
              <SongFact label="BPM" value={String(song.bpm)} />
              <SongFact label="Duration" value={song.duration} />
            </dl>
            {isAdmin ? <SecondaryButton href={`/admin/song/${song.id}`} className="mt-6 w-full sm:w-auto">Edit Song</SecondaryButton> : null}
          </div>
        </header>

        <div className="mt-14 space-y-12 sm:mt-20 sm:space-y-16">
          <SongSection title="Audio"><AudioPlayer key={song.id} src={song.audio_url} title={song.title} /></SongSection>
          <SongSection title="Lyrics"><p className="whitespace-pre-wrap text-base leading-8 text-zinc-300 sm:text-lg">{song.lyrics}</p></SongSection>
          <SongSection title="Resources"><SongResourceButtons songId={song.id} /></SongSection>
          <SongSection title="Notes"><p className="whitespace-pre-wrap text-base leading-8 text-zinc-300">{song.notes}</p></SongSection>
        </div>
      </div>
    </main>
  );
}

function SongFact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/5 px-4 py-3"><dt className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</dt><dd className="mt-1 font-semibold text-white">{value}</dd></div>;
}

function SongSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-5 text-sm font-bold uppercase tracking-[0.2em] text-white">{title}</h2><div className="rounded-2xl border border-white/8 bg-zinc-900/65 p-5 sm:p-7">{children}</div></section>;
}
