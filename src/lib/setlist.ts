import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseConfig } from "@/lib/supabase";
import type { ActiveSetlistRow } from "@/lib/database.types";

export type SetlistSong = {
  id: string;
  title: string;
  key: string;
  bpm: number;
  duration: string;
};

export type ActiveSetlist = {
  id: number;
  serviceName: string;
  serviceDate: string | null;
  serviceTime: string;
  leaderNotes: string | null;
  songIds: string[];
  songs: SetlistSong[];
};

export type DashboardServiceSelection =
  | { service: ActiveSetlist; state: "active" | "planned" }
  | { state: "empty" }
  | { message: string; state: "error" };

export async function getDashboardServiceSelection(): Promise<DashboardServiceSelection> {
  const supabase = await createSupabaseServerClient();
  const activeResult = await supabase
    .from("active_setlist")
    .select("id, service_name, service_date, service_time, song_ids, leader_notes")
    .eq("status", "active")
    .maybeSingle();
  if (activeResult.error) return { message: activeResult.error.message, state: "error" };
  if (activeResult.data) return loadDashboardService(activeResult.data, "active", supabase);

  const plannedResult = await supabase
    .from("active_setlist")
    .select("id, service_name, service_date, service_time, song_ids, leader_notes")
    .eq("status", "planned")
    .gte("service_date", toLocalDateKey(new Date()))
    .order("service_date", { ascending: true, nullsFirst: false })
    .order("service_time", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (plannedResult.error) return { message: plannedResult.error.message, state: "error" };
  if (!plannedResult.data) return { state: "empty" };
  return loadDashboardService(plannedResult.data, "planned", supabase);
}

async function loadDashboardService(row: { id: number; leader_notes: string | null; service_date: string | null; service_name: string; service_time: string; song_ids: string[] }, state: "active" | "planned", supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>): Promise<DashboardServiceSelection> {
  const songIds = row.song_ids ?? [];
  if (!songIds.length) return { service: mapDashboardService(row, []), state };
  const { data, error } = await supabase.from("songs").select("id, title, key, bpm, duration").in("id", songIds);
  if (error) return { message: error.message, state: "error" };
  const songsById = new Map((data ?? []).map((song) => [song.id, song as SetlistSong]));
  return { service: mapDashboardService(row, songIds.flatMap((id) => { const song = songsById.get(id); return song ? [song] : []; })), state };
}

function mapDashboardService(row: { id: number; leader_notes: string | null; service_date: string | null; service_name: string; service_time: string; song_ids: string[] }, songs: SetlistSong[]): ActiveSetlist {
  return { id: row.id, leaderNotes: row.leader_notes, serviceDate: row.service_date, serviceName: row.service_name, serviceTime: row.service_time, songIds: row.song_ids ?? [], songs };
}

export async function getActiveSetlist(): Promise<ActiveSetlist | null> {
  const supabase = await createSupabaseServerClient();
  const { url } = getSupabaseConfig();
  console.info("[Setlist] Supabase operation", {
    SUPABASE_URL: url,
    table: "active_setlist",
    operation: "select",
  });

  let { data: setlist, error, status } = await supabase
    .from("active_setlist")
    .select("id, service_name, service_date, service_time, song_ids, leader_notes")
    .eq("status", "active")
    .maybeSingle();

  if (error?.code === "42703" || error?.code === "PGRST204") {
    const legacyResult = await supabase
      .from("active_setlist")
      .select("id, service_name, service_date, service_time, song_ids")
      .eq("status", "active")
      .maybeSingle();
    setlist = legacyResult.data ? { ...legacyResult.data, leader_notes: null } : null;
    error = legacyResult.error;
    status = legacyResult.status;
  }

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
      id: setlist.id,
      serviceDate: (setlist as Pick<ActiveSetlistRow, "service_date">).service_date,
      serviceTime: setlist.service_time,
      leaderNotes: setlist.leader_notes,
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
    id: setlist.id,
    serviceName: setlist.service_name,
    serviceDate: (setlist as Pick<ActiveSetlistRow, "service_date">).service_date,
    serviceTime: setlist.service_time,
    leaderNotes: setlist.leader_notes,
    songIds,
    songs: songIds.flatMap((id) => {
      const song = songsById.get(id);
      return song ? [song] : [];
    }),
  };
}

function toLocalDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
