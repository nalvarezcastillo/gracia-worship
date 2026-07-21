import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageSetlist } from "@/components/manage-setlist";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getActiveSetlist, type SetlistSong } from "@/lib/setlist";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Manage Setlist | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ManageSetlistPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/setlist");

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, setlist] = await Promise.all([
    supabase.schema("public").from("songs").select("id, title, key, bpm, duration").order("title"),
    getActiveSetlist(),
  ]);

  const allSongs = error ? [] : (data ?? []) as SetlistSong[];

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <PageHeader
          title="Manage Setlist"
          description={setlist ? `${setlist.serviceName} · ${setlist.serviceTime}` : "Configure the active service setlist."}
        />
        <ManageSetlist allSongs={allSongs} initialSongIds={setlist?.songIds ?? []} />
      </MainContainer>
    </main>
  );
}
