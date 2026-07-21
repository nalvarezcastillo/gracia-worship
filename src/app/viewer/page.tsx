import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { SongRecord } from "@/lib/database.types";
import { createSupabaseClient } from "@/lib/supabase";

export const metadata: Metadata = { title: "Viewer | Gracia Worship" };
export const dynamic = "force-dynamic";

type ViewerPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ViewerPage({ searchParams }: ViewerPageProps) {
  const params = await searchParams;
  const type = getSingleValue(params.type);
  const songId = getSingleValue(params.song);

  if (!songId || (type !== "pdf" && type !== "video")) notFound();

  let song: SongRecord | null = null;
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.from("songs").select("*").eq("id", songId).maybeSingle();
    if (error) throw error;
    song = data as SongRecord | null;
  } catch {
    notFound();
  }

  if (!song) notFound();
  const source = type === "pdf" ? song.sheet_url : song.video_url;

  return (
    <main className="fixed inset-0 z-[60] flex flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center gap-4 border-b border-white/8 bg-zinc-950/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
        <Link href={`/song/${song.id}`} className="inline-flex min-h-12 shrink-0 items-center rounded-full border border-white/12 bg-white/6 px-5 text-base font-semibold text-white transition duration-200 active:scale-[0.98] hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">← Back</Link>
        <h1 className="min-w-0 truncate text-lg font-semibold text-white sm:text-xl">{song.title}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden bg-zinc-900">
        {type === "pdf" ? (
          source ? <iframe src={`${source}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} title={`Sheet music for ${song.title}`} className="h-full w-full border-0 bg-white" /> : <UnavailableMessage>Sheet music not available</UnavailableMessage>
        ) : source ? (
          <div className="grid h-full place-items-center bg-black sm:p-6"><video controls playsInline preload="metadata" src={source} className="aspect-video max-h-full w-full object-contain">Your browser does not support the video element.</video></div>
        ) : <UnavailableMessage>Video not available</UnavailableMessage>}
      </div>
    </main>
  );
}

function UnavailableMessage({ children }: { children: React.ReactNode }) {
  return <div className="grid h-full place-items-center px-6 text-center text-lg font-medium text-zinc-400">{children}</div>;
}

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
