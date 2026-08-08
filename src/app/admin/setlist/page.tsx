import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageSetlist } from "@/components/manage-setlist";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getActiveSetlist, type SetlistSong } from "@/lib/setlist";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ManageSetlistPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/setlist");

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, setlist] = await Promise.all([
    supabase.schema("public").from("songs").select("id, title, key, bpm, duration").order("title"),
    getActiveSetlist(),
  ]);

  const allSongs = error ? [] : (data ?? []) as SetlistSong[];

  return <AppPage title="Editar servicio" description={setlist ? `${setlist.serviceName} · ${setlist.serviceTime}` : "Configura el repertorio del servicio actual."}><ManageSetlist allSongs={allSongs} initialSongIds={setlist?.songIds ?? []} serviceId={setlist?.id ?? 1} /></AppPage>;
}
