import Link from "next/link";
import { MusicIcon } from "@/components/icons";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createSupabaseClient();
  const [{ data: recentSongs, count, error }, isAdmin] = await Promise.all([
    supabase
      .schema("public")
      .from("songs")
      .select("id, title, key, bpm", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(5),
    hasAuthenticatedUser(),
  ]);

  if (error) throw error;

  const totalSongs = count ?? 0;

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-4xl">
        <PageHeader title="Gracia Worship" description="Bienvenidos a Gracia Worship." />
        <p className="mt-2 text-sm font-medium text-zinc-500">{totalSongs} Songs Available</p>

        <section className="mt-7 sm:mt-8">
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-zinc-400">Quick Actions</h2>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <PrimaryButton href="/songs" className="w-full sm:w-auto">Browse Songs</PrimaryButton>
            {isAdmin ? <SecondaryButton href="/admin/song/new" className="w-full sm:w-auto">Add Song</SecondaryButton> : null}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">Recently Added</h2>

          {recentSongs && recentSongs.length > 0 ? (
            <div className="mt-3 divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10">
              {recentSongs.map((song) => (
                <Link key={song.id} href={`/song/${song.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 transition-colors duration-200 ease-out hover:bg-white/[0.035] active:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:px-5">
                  <MusicIcon className="size-4 shrink-0 text-emerald-400/65" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-white">{song.title}</span>
                  <span className="shrink-0 text-sm font-medium text-zinc-500">{song.key} <span aria-hidden="true">•</span> {song.bpm} BPM</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-white/10 py-8 text-center text-zinc-500">No songs available</p>
          )}
        </section>
      </MainContainer>
    </main>
  );
}
