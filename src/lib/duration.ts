type DurationServiceItem = {
  planned_duration_minutes?: number | null;
  planned_duration_seconds?: number | null;
};

type DurationSongEntry = {
  plannedDurationMinutes?: number | null;
  plannedDurationSeconds?: number | null;
};

export function parseSongDuration(value: string | null | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d+):([0-5]\d)$/);
  if (!match) return null;
  const total = Number(match[1]) * 60 + Number(match[2]);
  return total > 0 ? total : null;
}

export function parsePlannedDurationInput(value: string) {
  return parseSongDuration(value);
}

export function formatDurationInput(seconds: number | null | undefined) {
  if (!seconds || seconds <= 0) return "";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes % 60).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function getServiceItemDurationSeconds(item: DurationServiceItem) {
  return positiveInteger(item.planned_duration_seconds)
    ?? multiplyLegacyMinutes(item.planned_duration_minutes);
}

export function getSongDurationSeconds(entry: DurationSongEntry, libraryDuration: string | null | undefined) {
  return positiveInteger(entry.plannedDurationSeconds)
    ?? multiplyLegacyMinutes(entry.plannedDurationMinutes)
    ?? parseSongDuration(libraryDuration);
}

export function hasSongDurationOverride(entry: DurationSongEntry) {
  return positiveInteger(entry.plannedDurationSeconds) !== null
    || multiplyLegacyMinutes(entry.plannedDurationMinutes) !== null;
}

function positiveInteger(value: number | null | undefined) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value as number : null;
}

function multiplyLegacyMinutes(value: number | null | undefined) {
  const minutes = positiveInteger(value);
  return minutes === null ? null : minutes * 60;
}
