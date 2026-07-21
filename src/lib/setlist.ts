import { createSupabaseClient } from "@/lib/supabase";

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
  const supabase = createSupabaseClient();
  const { data: setlist, error } = await supabase
    .schema("public")
    .from("active_setlist")
    .select("service_name, service_time, song_ids")
    .eq("id", 1)
    .maybeSingle();

  if (error || !setlist) return null;

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
    .schema("public")
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
