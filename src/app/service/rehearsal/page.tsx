import type { Metadata } from "next";
import { RehearsalMode, type RehearsalSong } from "@/components/rehearsal-mode";
import type { PublicSongKey } from "@/components/song-key-selector";
import { MainContainer } from "@/components/ui/main-container";
import type { ActiveSetlistRow } from "@/lib/database.types";
import { isRecord, normalizeServiceItemSongIds, normalizeSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ensayo | Gracia Worship" };
export const dynamic = "force-dynamic";

type RehearsalService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export default async function RehearsalPage() {
  const supabase = await createSupabaseServerClient();
  const serviceResult = await supabase
      .from("active_setlist")
      .select("id, service_name, service_date, service_time")
      .eq("status", "active")
      .maybeSingle();
  const itemsResult = await supabase
      .from("service_items")
      .select("id, position, type, title, details, song_ids, created_at")
      .eq("service_id", serviceResult.data?.id ?? -1)
      .order("position", { ascending: true });

  const { data: serviceData, error: serviceError, status: serviceStatus } = serviceResult;
  const { data: itemsData, error: itemsError, status: itemsStatus } = itemsResult;
  if (serviceError) logSupabaseError("active service", serviceError, serviceStatus);
  if (itemsError) logSupabaseError("service items", itemsError, itemsStatus);

  const service = serviceError ? null : serviceData as RehearsalService | null;
  const rawItems = itemsError ? [] : itemsData ?? [];
  const items = rawItems.map((item) => normalizeServiceItemSongIds(item));
  const songIds = Array.from(new Set(items.flatMap((item) =>
    (item.song_ids ?? []).map((entry) => entry.songId),
  )));

  let songs: RehearsalSong[] = [];

  if (songIds.length > 0) {
    const [songsResult, keysResult] = await Promise.all([
      supabase
        .from("songs")
        .select("id, title, key, bpm, time_signature, audio_url, sheet_url, lyrics")
        .in("id", songIds),
      supabase
        .from("song_keys")
        .select("id, song_id, key_name, audio_url, sheet_url, sort_order")
        .in("song_id", songIds)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);

    const { data: songsData, error: songsError, status: songsStatus } = songsResult;
    const { data: keysData, error: keysError, status: keysStatus } = keysResult;
    const itemSummaries = rawItems
      .filter((item) => item.type === "worship")
      .map((item) => ({
        serviceItemId: item.id,
        itemType: item.type,
        rawSongIds: item.song_ids,
        normalizedSongIds: normalizeSongIds(item.song_ids).entries.map((entry) => entry.songId),
      }));

    if (songsError) logSupabaseError("rehearsal songs", songsError, songsStatus, itemSummaries);
    if (keysError) logSupabaseError("rehearsal song keys", keysError, keysStatus, itemSummaries);

    if (!songsError) {
      const keysBySong = new Map<string, PublicSongKey[]>();
      if (!keysError) {
      for (const key of keysData ?? []) {
        const current = keysBySong.get(key.song_id) ?? [];
        current.push({
          id: key.id,
          key_name: key.key_name,
          audio_url: key.audio_url,
          sheet_url: key.sheet_url,
          sort_order: key.sort_order,
        });
        keysBySong.set(key.song_id, current);
      }
      }

      songs = (songsData ?? []).map((song) => ({
        ...song,
        keys: keysBySong.get(song.id) ?? [],
      })) as RehearsalSong[];
    }
  }

  const loadError = serviceError?.message ?? itemsError?.message;

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <MainContainer className="max-w-4xl">
        <RehearsalMode service={service} items={items} songs={songs} loadError={loadError} />
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
