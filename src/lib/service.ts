export type WorshipSongEntry = {
  plannedDurationSeconds: number | null;
  songId: string;
  notes: string;
};

export type ServiceItem = {
  id: string;
  position: number;
  type: "text" | "worship";
  title: string;
  details: string | null;
  planned_duration_seconds: number | null;
  song_ids: WorshipSongEntry[] | null;
  created_at: string;
};

export type ServiceSong = {
  audio_url: string;
  bpm: number;
  duration: string;
  id: string;
  key: string;
  sheet_url: string;
  song_keys?: {
    audio_url: string | null;
    sheet_url: string | null;
    song_stems?: { id: string }[];
  }[];
  time_signature: string | null;
  title: string;
};
