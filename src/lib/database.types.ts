export type SongRecord = {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  time_signature: string | null;
  duration: string;
  cover_url: string;
  audio_url: string;
  sheet_url: string;
  video_url: string;
  lyrics: string;
  notes: string;
  favorite: boolean;
  created_at: string;
};

export type SongSummary = Pick<
  SongRecord,
  "id" | "title" | "artist" | "key" | "bpm" | "time_signature" | "duration" | "favorite"
> & {
  cover: string;
};

export type ActiveSetlistRow = {
  id: number;
  service_name: string;
  service_date: string | null;
  service_time: string;
  song_ids: string[];
  leader_notes: string | null;
  status: "active" | "archived";
  updated_at: string;
};

export type SongKeyRow = {
  id: string;
  song_id: string;
  key_name: string;
  audio_url: string | null;
  sheet_url: string | null;
  sort_order: number;
  created_at: string;
};

export type SongStemRow = {
  id: string;
  song_key_id: string;
  name: string;
  storage_path: string;
  sort_order: number;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
};
