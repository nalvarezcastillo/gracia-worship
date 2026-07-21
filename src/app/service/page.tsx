import type { Metadata } from "next";
import { ServiceItems } from "@/components/service-items";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Service | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: songsData, error: songsError }, isAdmin] = await Promise.all([
    supabase
      .from("service_items")
      .select("id, position, type, title, details, song_ids, created_at")
      .order("position", { ascending: true }),
    supabase.from("songs").select("id, title").order("title", { ascending: true }),
    hasAuthenticatedUser(),
  ]);

  const items = error ? [] : (data ?? []) as ServiceItem[];
  const songs = songsError ? [] : (songsData ?? []) as ServiceSong[];
  const loadError = error?.message ?? songsError?.message;

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <PageHeader eyebrow="Gracia Worship" title="Service" />
        <ServiceItems initialItems={items} songs={songs} isAdmin={isAdmin} loadError={loadError} />
      </MainContainer>
    </main>
  );
}
