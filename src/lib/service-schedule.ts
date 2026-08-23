import { getSongDurationSeconds } from "@/lib/duration";
import type { ServiceItem } from "@/lib/service";
import type { OperationalServiceEntry, OperationalSong } from "@/lib/service-entries";

type ScheduledSong = OperationalSong;

export function buildServiceSchedule(items: ServiceItem[], songs: ScheduledSong[], serviceTime: string | null) {
  const times = new Map<string, string>();
  const match = serviceTime?.match(/^(\d{2}):(\d{2})/);
  let elapsed = 0;
  let timeKnown = Boolean(match);
  const startSeconds = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 : 0;

  for (const item of items) {
    if (item.type === "worship") {
      for (const [songIndex, entry] of (item.song_ids ?? []).entries()) {
        const song = songs.find((candidate) => candidate.id === entry.songId);
        times.set(`${item.id}:${entry.songId}:${songIndex + 1}`, timeKnown ? formatClock(startSeconds + elapsed) : "—");
        const duration = song ? getSongDurationSeconds(entry, song.duration) : null;
        if (duration) elapsed += duration;
        else timeKnown = false;
      }
    } else if (item.type === "song") {
      times.set(item.id, timeKnown ? formatClock(startSeconds + elapsed) : "—");
      const song = item.song_id ? songs.find((candidate) => candidate.id === item.song_id) : null;
      const duration = song ? getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration) : null;
      if (duration) elapsed += duration;
      else timeKnown = false;
    } else {
      times.set(item.id, timeKnown ? formatClock(startSeconds + elapsed) : "—");
      if (item.planned_duration_seconds) elapsed += item.planned_duration_seconds;
      else timeKnown = false;
    }
  }

  return { times, totalSeconds: elapsed };
}

export function getOperationalEntryScheduleKey(entry: OperationalServiceEntry) {
  return entry.kind === "song" && entry.source === "legacy-worship"
    ? `${entry.item.id}:${entry.song.id}:${entry.occurrenceIndex}`
    : entry.item.id;
}

function formatClock(seconds: number) {
  const normalized = seconds % 86400;
  const hour24 = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  const secs = normalized % 60;
  return `${hour24 % 12 || 12}:${String(minutes).padStart(2, "0")}${secs ? `:${String(secs).padStart(2, "0")}` : ""} ${hour24 >= 12 ? "PM" : "AM"}`;
}
