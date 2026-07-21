import type { Metadata } from "next";
import Link from "next/link";
import { MusicIcon } from "@/components/icons";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveSetlist } from "@/lib/setlist";

export const metadata: Metadata = { title: "Setlist | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function SetlistPage() {
  const setlist = await getActiveSetlist();

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-4xl">
        <PageHeader
          eyebrow="Next Service"
          title={setlist?.serviceName ?? "Setlist"}
          description={setlist?.serviceTime ?? "Next service is not configured."}
        />

        {setlist && setlist.songs.length > 0 ? (
          <div className="mt-7 divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10 sm:mt-9">
            {setlist.songs.map((song, index) => (
              <Link key={song.id} href={`/song/${song.id}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-200 hover:bg-white/[0.035] active:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:px-5">
                <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span>
                <MusicIcon className="size-4 shrink-0 text-emerald-400/65" />
                <span className="min-w-0 flex-1 truncate font-semibold text-white">{song.title}</span>
                <span className="shrink-0 text-right text-xs font-medium text-zinc-500 sm:text-sm">
                  {song.key} <span aria-hidden="true">•</span> {song.bpm} BPM <span aria-hidden="true">•</span> {song.duration}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-7 rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-zinc-500 sm:mt-9">No songs in the setlist.</div>
        )}
      </MainContainer>
    </main>
  );
}
