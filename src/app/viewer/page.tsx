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

  if (!songId || type !== "pdf") notFound();

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
  const source = song.sheet_url;

  return (
    <main className="fixed inset-0 z-[60] flex flex-col bg-zinc-950">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] bg-zinc-950/90 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-lg shadow-black/20 backdrop-blur-2xl sm:gap-4 sm:px-6 sm:pb-4 sm:pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href={`/song/${song.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.055] px-4 text-sm font-semibold text-white shadow-sm shadow-black/20 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/10 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:min-h-12 sm:px-5 sm:text-base">← Back</Link>
        <h1 className="min-w-0 truncate text-lg font-semibold text-white sm:text-xl">{song.title}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden bg-zinc-900">
        {source ? <iframe src={`${source}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} title={`Sheet music for ${song.title}`} className="h-full w-full border-0 bg-white" /> : <UnavailableMessage>Sheet music not available</UnavailableMessage>}
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
