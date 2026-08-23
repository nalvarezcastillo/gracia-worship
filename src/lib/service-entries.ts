import { getSongDurationSeconds } from "@/lib/duration";
import type { ServiceItem, ServiceSongSetting, WorshipSongEntry } from "@/lib/service";
import { getLegacyServiceSongKey } from "@/lib/service-item-normalization";

export type OperationalSong = { duration: string | null | undefined; id: string; key?: string | null; title: string };

export type OperationalServiceEntry<Song extends OperationalSong = OperationalSong> =
  | {
      id: string;
      item: ServiceItem;
      kind: "moment";
      occurrenceIndex: 0;
      plannedDurationSeconds: number | null;
      title: string;
    }
  | {
      assignmentText: string | null;
      effectiveKey: string | null;
      id: string;
      item: ServiceItem;
      kind: "song";
      occurrenceIndex: number;
      legacyEntry: WorshipSongEntry | null;
      keyOverride: string | null;
      plannedDurationSeconds: number | null;
      song: Song;
      source: "legacy-worship" | "song-item";
      title: string;
    };

export function buildOperationalServiceEntries<Song extends OperationalSong>(items: ServiceItem[], songs: Song[], settings: ServiceSongSetting[] = []) {
  const songsById = new Map(songs.map((song) => [song.id, song]));
  const settingsByOccurrence = new Map(settings.map((setting) => [`${setting.service_item_id}:${setting.song_id}`, setting]));
  return items.flatMap<OperationalServiceEntry<Song>>((item) => {
    if (item.type === "song") {
      const song = item.song_id ? songsById.get(item.song_id) : undefined;
      const keyOverride = song ? settingsByOccurrence.get(`${item.id}:${song.id}`)?.key_override?.trim() || null : null;
      return song ? [{
        assignmentText: item.details,
        effectiveKey: keyOverride ?? song.key?.trim() ?? null,
        id: `song-item:${item.id}`,
        item,
        kind: "song",
        occurrenceIndex: 0,
        legacyEntry: null,
        keyOverride,
        plannedDurationSeconds: getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration),
        song,
        source: "song-item",
        title: song.title,
      }] : [];
    }

    if (item.type === "worship") {
      return (item.song_ids ?? []).flatMap<OperationalServiceEntry<Song>>((entry, songIndex) => {
        const song = songsById.get(entry.songId);
        const keyOverride = song ? settingsByOccurrence.get(`${item.id}:${song.id}`)?.key_override?.trim() || null : null;
        return song ? [{
          assignmentText: entry.notes || null,
          effectiveKey: keyOverride ?? getLegacyServiceSongKey(entry) ?? song.key?.trim() ?? null,
          id: `legacy-song:${item.id}:${song.id}:${songIndex + 1}`,
          item,
          kind: "song",
          occurrenceIndex: songIndex + 1,
          legacyEntry: entry,
          keyOverride,
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
      occurrenceIndex: 0,
      plannedDurationSeconds: item.planned_duration_seconds,
      title: item.title,
    }];
  });
}
