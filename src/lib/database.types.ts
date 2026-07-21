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
