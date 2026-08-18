import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ManageSetlist } from "@/components/manage-setlist";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { SetlistSong } from "@/lib/setlist";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Editar servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ManageSetlistPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const requestedService = (await searchParams).service;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=${encodeURIComponent(requestedService ? `/admin/setlist?service=${requestedService}` : "/admin/setlist")}`);
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const supabase = await createSupabaseServerClient();
  const serviceQuery = supabase.from("active_setlist").select("id, service_name, service_time, song_ids, status");
  const [{ data, error }, { data: setlist }] = await Promise.all([
    supabase.schema("public").from("songs").select("id, title, key, bpm, duration").order("title"),
    requestedService
      ? serviceQuery.eq("id", requestedServiceId).maybeSingle()
      : serviceQuery.eq("status", "active").maybeSingle(),
  ]);
  if (requestedService && !setlist) notFound();
  if (setlist?.status === "completed" || setlist?.status === "archived") redirect(`/service/${setlist.id}`);

  const allSongs = error ? [] : (data ?? []) as SetlistSong[];

  return <AppPage title="Editar servicio" description={setlist ? `${setlist.service_name} · ${setlist.service_time}` : "Configura el repertorio del servicio actual."}><ManageSetlist allSongs={allSongs} initialSongIds={(setlist?.song_ids ?? []) as string[]} serviceId={setlist?.id ?? 1} /></AppPage>;
}
