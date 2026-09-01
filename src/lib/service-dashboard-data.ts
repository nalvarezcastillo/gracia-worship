import type { ServiceItem, ServiceSongSetting } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ServiceDashboardSong = {
  artist: string | null;
  bpm: number | null;
  cover_url: string | null;
  duration: string | null;
  id: string;
  key: string | null;
  time_signature: string | null;
  title: string;
};

export async function getServiceDashboardData(serviceId: number) {
  const supabase = await createSupabaseServerClient();
  const [{ data: itemData, error: itemError }, { data: settingsData, error: settingsError }, { data: noteData }] = await Promise.all([
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position", { ascending: true }),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
    supabase.from("service_item_notes").select("service_item_id").eq("service_id", serviceId).limit(1),
  ]);

  if (itemError) return { hasItemNotes: false, items: [] as ServiceItem[], settings: [] as ServiceSongSetting[], songs: [] as ServiceDashboardSong[] };
  const items = (itemData ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const settings = settingsError ? [] : (settingsData ?? []) as ServiceSongSetting[];
  const songIds = Array.from(new Set(items.flatMap((item) => [...(item.song_ids ?? []).map((entry) => entry.songId), ...(item.song_id ? [item.song_id] : [])])));
  if (!songIds.length) return { hasItemNotes: Boolean(noteData?.length), items, settings, songs: [] as ServiceDashboardSong[] };

  const { data: songData, error: songError } = await supabase
    .from("songs")
    .select("id, title, artist, key, bpm, duration, time_signature, cover_url")
    .in("id", songIds);

  return {
    hasItemNotes: Boolean(noteData?.length),
    items,
    settings,
    songs: songError ? [] as ServiceDashboardSong[] : (songData ?? []) as ServiceDashboardSong[],
  };
}
