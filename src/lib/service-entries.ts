import { getSongDurationSeconds } from "@/lib/duration";
import type { ServiceItem, WorshipSongEntry } from "@/lib/service";

export type OperationalSong = { duration: string | null | undefined; id: string; title: string };

export type OperationalServiceEntry<Song extends OperationalSong = OperationalSong> =
  | {
      id: string;
      item: ServiceItem;
      kind: "moment";
      plannedDurationSeconds: number | null;
      title: string;
    }
  | {
      assignmentText: string | null;
      id: string;
      item: ServiceItem;
      kind: "song";
      legacyEntry: WorshipSongEntry | null;
      plannedDurationSeconds: number | null;
      song: Song;
      source: "legacy-worship" | "song-item";
      title: string;
    };

export function buildOperationalServiceEntries<Song extends OperationalSong>(items: ServiceItem[], songs: Song[]) {
  const songsById = new Map(songs.map((song) => [song.id, song]));
  return items.flatMap<OperationalServiceEntry<Song>>((item) => {
    if (item.type === "song") {
      const song = item.song_id ? songsById.get(item.song_id) : undefined;
      return song ? [{
        assignmentText: item.details,
        id: `song-item:${item.id}`,
        item,
        kind: "song",
        legacyEntry: null,
        plannedDurationSeconds: getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration),
        song,
        source: "song-item",
        title: song.title,
      }] : [];
    }

    if (item.type === "worship") {
      return (item.song_ids ?? []).flatMap<OperationalServiceEntry<Song>>((entry) => {
        const song = songsById.get(entry.songId);
        return song ? [{
          assignmentText: entry.notes || null,
          id: `legacy-song:${item.id}:${song.id}`,
          item,
          kind: "song",
          legacyEntry: entry,
          plannedDurationSeconds: getSongDurationSeconds(entry, song.duration),
          song,
          source: "legacy-worship",
          title: song.title,
        }] : [];
      });
    }

    return [{
      id: `moment:${item.id}`,
      item,
      kind: "moment",
      plannedDurationSeconds: item.planned_duration_seconds,
      title: item.title,
    }];
  });
}
