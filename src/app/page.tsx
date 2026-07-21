import { MusicIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveSetlist } from "@/lib/setlist";

export const dynamic = "force-dynamic";

export default async function Home() {
  const setlist = await getActiveSetlist();
  const previewSongs = setlist?.songs.slice(0, 5) ?? [];
  const remainingSongs = Math.max((setlist?.songs.length ?? 0) - previewSongs.length, 0);

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-4xl">
        <PageHeader title="Gracia Worship" description="Bienvenidos a Gracia Worship." />

        <section className="mt-7 overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-900/60 shadow-2xl shadow-black/15 sm:mt-9">
          <div className="border-b border-white/[0.06] bg-gradient-to-br from-emerald-400/[0.09] to-transparent p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Next Service</p>
            {setlist ? (
              <>
                <h2 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">{setlist.serviceName}</h2>
                <p className="mt-2 text-sm font-medium text-zinc-400 sm:text-base">{setlist.serviceTime}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-zinc-500">Next service is not configured.</p>
            )}
          </div>

          <div className="p-4 sm:p-6">
            {previewSongs.length > 0 ? (
              <ol className="divide-y divide-white/[0.055]">
                {previewSongs.map((song, index) => (
                  <li key={song.id} className="flex min-h-11 items-center gap-3 px-1 py-2 text-sm font-semibold text-zinc-200 sm:text-base">
                    <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span>
                    <MusicIcon className="size-4 shrink-0 text-emerald-400/65" />
                    <span className="truncate">{song.title}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="py-5 text-center text-sm text-zinc-500">No songs in the setlist.</p>
            )}

            {remainingSongs > 0 ? <p className="mt-3 text-sm font-medium text-zinc-500">+{remainingSongs} more</p> : null}
            <PrimaryButton href="/setlist" className="mt-5 w-full sm:w-auto">Open Setlist</PrimaryButton>
          </div>
        </section>
      </MainContainer>
    </main>
  );
}
