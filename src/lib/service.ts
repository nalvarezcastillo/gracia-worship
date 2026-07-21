export type WorshipSongEntry = {
  songId: string;
  notes: string;
};

export type ServiceItem = {
  id: string;
  position: number;
  type: "text" | "worship";
  title: string;
  details: string | null;
  song_ids: WorshipSongEntry[] | null;
  created_at: string;
};

export type ServiceSong = {
  id: string;
  title: string;
};
