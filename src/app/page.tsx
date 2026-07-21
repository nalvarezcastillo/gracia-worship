import { PrimaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { createSupabaseClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createSupabaseClient();
  const { count, error } = await supabase
    .schema("public")
    .from("songs")
    .select("id", { count: "exact", head: true });

  if (error) throw error;

  const totalSongs = count ?? 0;

  return (
    <main className="min-h-screen py-10 sm:py-14">
      <MainContainer className="max-w-4xl">
        <PageHeader title="Gracia Worship" description="Song Library" />

        <section className="mt-10 rounded-3xl border border-white/8 bg-gradient-to-br from-emerald-400/12 to-zinc-900/70 p-6 sm:p-8">
          {totalSongs > 0 ? (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Total Songs</p>
              <p className="mt-4 text-5xl font-bold tracking-tight text-white">{totalSongs}</p>
              <PrimaryButton href="/songs" className="mt-8 w-full sm:w-auto">Browse Library</PrimaryButton>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-white">Your library is empty.</p>
              <PrimaryButton href="/admin/song/new" className="mt-8 w-full sm:w-auto">Add First Song</PrimaryButton>
            </>
          )}
        </section>
      </MainContainer>
    </main>
  );
}
