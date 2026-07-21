export type ServiceItem = {
  id: string;
  position: number;
  type: "text" | "worship";
  title: string;
  details: string | null;
  song_ids: string[] | null;
  created_at: string;
};

export type ServiceSong = {
  id: string;
  title: string;
};
