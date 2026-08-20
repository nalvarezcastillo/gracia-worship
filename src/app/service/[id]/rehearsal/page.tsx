import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RehearsalMode, type RehearsalSong } from "@/components/rehearsal-mode";
import type { PublicSongKey } from "@/components/song-key-selector";
import { MainContainer } from "@/components/ui/main-container";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceSongSetting } from "@/lib/service";
import { isRecord, normalizeServiceItemSongIds, normalizeSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ensayo | Gracia Worship" };
export const dynamic = "force-dynamic";

type RehearsalService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export default async function ServiceRehearsalPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();

  const supabase = await createSupabaseServerClient();
  const [serviceResult, itemsResult, settingsResult] = await Promise.all([
    supabase.from("active_setlist").select("id, service_name, service_date, service_time").eq("id", serviceId).maybeSingle(),
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position", { ascending: true }),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
  ]);

  const { data: serviceData, error: serviceError } = serviceResult;
  const { data: itemsData, error: itemsError, status: itemsStatus } = itemsResult;
  if (serviceError || !serviceData) notFound();
  if (itemsError) logSupabaseError("service items", itemsError, itemsStatus);

  const service = serviceData as RehearsalService;
  const rawItems = itemsError ? [] : itemsData ?? [];
  const items = rawItems.map((item) => normalizeServiceItemSongIds(item));
  const songIds = Array.from(new Set(items.flatMap((item) => [
    ...(item.song_ids ?? []).map((entry) => entry.songId),
    ...(item.song_id ? [item.song_id] : []),
  ])));
  let songs: RehearsalSong[] = [];

  if (songIds.length) {
    const [songsResult, keysResult] = await Promise.all([
      supabase.from("songs").select("id, title, key, bpm, duration, time_signature, audio_url, sheet_url, lyrics").in("id", songIds),
      supabase.from("song_keys").select("id, song_id, key_name, audio_url, sheet_url, grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds, sort_order").in("song_id", songIds).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    ]);
    const itemSummaries = rawItems.filter((item) => item.type === "worship").map((item) => ({
      serviceItemId: item.id,
      itemType: item.type,
      rawSongIds: item.song_ids,
      normalizedSongIds: normalizeSongIds(item.song_ids).entries.map((entry) => entry.songId),
    }));
    if (songsResult.error) logSupabaseError("rehearsal songs", songsResult.error, songsResult.status, itemSummaries);
    if (keysResult.error) logSupabaseError("rehearsal song keys", keysResult.error, keysResult.status, itemSummaries);
    if (!songsResult.error) {
      const keysBySong = new Map<string, PublicSongKey[]>();
      if (!keysResult.error) {
        for (const key of keysResult.data ?? []) {
          const current = keysBySong.get(key.song_id) ?? [];
          current.push({ id: key.id, key_name: key.key_name, audio_url: key.audio_url, sheet_url: key.sheet_url, grid_bpm: key.grid_bpm, grid_beats_per_bar: key.grid_beats_per_bar, grid_beat_unit: key.grid_beat_unit, grid_offset_seconds: key.grid_offset_seconds, sort_order: key.sort_order });
          keysBySong.set(key.song_id, current);
        }
      }
      songs = (songsResult.data ?? []).map((song) => ({ ...song, keys: keysBySong.get(song.id) ?? [] })) as RehearsalSong[];
    }
  }

  return (
    <main className="min-h-screen py-2 sm:py-10">
      <MainContainer className="max-w-4xl">
        <RehearsalMode service={service} serviceId={serviceId} items={items} songSettings={(settingsResult.data ?? []) as ServiceSongSetting[]} songs={songs} loadError={itemsError?.message ?? settingsResult.error?.message} />
      </MainContainer>
    </main>
  );
}

function logSupabaseError(operation: string, error: unknown, status: number, serviceItems?: unknown) {
  const databaseError = isRecord(error) ? error : {};
  console.error(`[Rehearsal] ${operation} load failed`, {
    code: databaseError.code ?? null,
    message: databaseError.message ?? (error instanceof Error ? error.message : String(error)),
    details: databaseError.details ?? null,
    hint: databaseError.hint ?? null,
    status,
    serviceItems: serviceItems ?? null,
  });
}
