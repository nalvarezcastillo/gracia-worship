import songData from "../../data/songs.json";

export type Song = {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  duration: string;
  cover: string;
  audio: string;
  sheet: string;
  video: string;
  lyrics: Array<{ label: string; lines: string[] }>;
  notes: Array<{ label: string; value: string }>;
};

export const songs: Song[] = songData;

export function getSongById(id: string) {
  return songs.find((song) => song.id === id);
}
