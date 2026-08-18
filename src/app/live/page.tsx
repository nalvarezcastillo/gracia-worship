import type { Metadata } from "next";
import { LiveMode, type LiveRun, type LiveSong } from "@/components/live-mode";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "En Vivo | Gracia Worship" };
export const dynamic = "force-dynamic";

type LiveService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export default async function LivePage() {
  const supabase = await createSupabaseServerClient();
  const { data: serviceData, error: serviceError } = await supabase
      .from("active_setlist")
      .select("id, service_name, service_date, service_time")
      .eq("status", "active")
      .maybeSingle();
  const { data: itemsData, error: itemsError } = await supabase
      .from("service_items")
      .select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at")
      .eq("service_id", serviceData?.id ?? -1)
      .order("position", { ascending: true });

  const service = serviceError ? null : serviceData as LiveService | null;
  const items = itemsError ? [] : (itemsData ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const songIds = Array.from(new Set(items.flatMap((item) => [
    ...(item.song_ids ?? []).map((entry) => entry.songId),
    ...(item.song_id ? [item.song_id] : []),
  ])));
  const { data: songsData, error: songsError } = songIds.length > 0
    ? await supabase
        .from("songs")
        .select("id, title, key, bpm, duration, time_signature, audio_url, sheet_url, lyrics, song_keys(key_name, audio_url, sheet_url, song_stems(id))")
        .in("id", songIds)
    : { data: [], error: null };
  const songs = songsError ? [] : (songsData ?? []) as LiveSong[];
  const [{ data: stateData, error: stateError }, { data: runsData, error: runsError }, canControl] = await Promise.all([
    serviceData?.id
      ? supabase
          .from("live_service_state")
          .select("service_id, current_item_id, current_song_id, started_at, finished_at, updated_at")
          .eq("service_id", serviceData.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    serviceData?.id
      ? supabase
          .from("service_item_runs")
          .select("started_at, ended_at")
          .eq("service_id", serviceData.id)
          .order("started_at")
      : Promise.resolve({ data: [], error: null }),
    hasAuthenticatedUser(),
  ]);
  if (stateError && process.env.NODE_ENV !== "production") {
    console.info("[Live] Realtime state is not available yet", stateError.message);
  }
  const loadError = serviceError?.message ?? itemsError?.message ?? songsError?.message;

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <MainContainer className="max-w-6xl">
        <LiveMode
          canControl={canControl}
          initialRuns={runsError ? [] : runsData as LiveRun[]}
          initialState={stateError ? null : stateData}
          items={items}
          loadError={loadError}
          service={service}
          serviceId={serviceData?.id ?? null}
          songs={songs}
        />
      </MainContainer>
    </main>
  );
}
