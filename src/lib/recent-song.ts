export const RECENT_SONG_STORAGE_KEY = "gracia-worship:recent-song";

export type RecentSong = {
  bpm: number | null;
  id: string;
  selectedKey: string;
  timeSignature: string | null;
  timestamp: number;
  title: string;
};

export function saveRecentSong(song: RecentSong) {
  try {
    window.localStorage.setItem(RECENT_SONG_STORAGE_KEY, JSON.stringify(song));
  } catch {
    // Browsing can continue normally when storage is unavailable.
  }
}

export function readRecentSong(): RecentSong | null {
  try {
    const stored = window.localStorage.getItem(RECENT_SONG_STORAGE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<RecentSong>;
    if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.selectedKey !== "string" || typeof value.timestamp !== "number") return null;
    return {
      bpm: typeof value.bpm === "number" ? value.bpm : null,
      id: value.id,
      selectedKey: value.selectedKey,
      timeSignature: typeof value.timeSignature === "string" ? value.timeSignature : null,
      timestamp: value.timestamp,
      title: value.title,
    };
  } catch {
    return null;
  }
}
