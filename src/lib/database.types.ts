export type SongRecord = {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
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
  "id" | "title" | "artist" | "key" | "bpm" | "duration" | "favorite"
> & {
  cover: string;
};

export type ActiveSetlistRow = {
  id: number;
  service_name: string;
  service_date: string | null;
  service_time: string;
  song_ids: string[];
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
