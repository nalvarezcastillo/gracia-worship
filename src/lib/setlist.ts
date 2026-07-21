import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase";

export type SetlistSong = {
  id: string;
  title: string;
  key: string;
  bpm: number;
  duration: string;
};

export type ActiveSetlist = {
  serviceName: string;
  serviceTime: string;
  songIds: string[];
  songs: SetlistSong[];
};

export async function getActiveSetlist(): Promise<ActiveSetlist | null> {
  const supabase = await createSupabaseServerClient();
  const { url } = getSupabaseConfig();
  console.info("[Setlist] Supabase operation", {
    SUPABASE_URL: url,
    table: "active_setlist",
    operation: "select",
  });

  const { data: setlist, error, status } = await supabase
    .from("active_setlist")
    .select("service_name, service_time, song_ids")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[Setlist] Load failed in src/lib/setlist.ts", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      status,
    });
    return null;
  }
  if (!setlist) return null;

  const songIds = setlist.song_ids as string[];
  if (songIds.length === 0) {
    return {
      serviceName: setlist.service_name,
      serviceTime: setlist.service_time,
      songIds,
      songs: [],
    };
  }

  const { data: songs, error: songsError } = await supabase
    .from("songs")
    .select("id, title, key, bpm, duration")
    .in("id", songIds);

  if (songsError) return null;

  const songsById = new Map((songs ?? []).map((song) => [song.id, song as SetlistSong]));

  return {
    serviceName: setlist.service_name,
    serviceTime: setlist.service_time,
    songIds,
    songs: songIds.flatMap((id) => {
      const song = songsById.get(id);
      return song ? [song] : [];
    }),
  };
}
