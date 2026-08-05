import type { ServiceItem, WorshipSongEntry } from "@/lib/service";

type RawServiceItem = Omit<ServiceItem, "song_ids"> & { song_ids: unknown };

export function normalizeServiceItemSongIds(rawItem: RawServiceItem): ServiceItem {
  if (rawItem.type !== "worship") return { ...rawItem, song_ids: null };

  const normalized = normalizeSongIds(rawItem.song_ids);
  if (normalized.invalidEntries.length > 0 && process.env.NODE_ENV !== "production") {
    console.warn("[Service] Normalized incomplete Worship Block song data", {
      serviceItemId: rawItem.id,
      itemType: rawItem.type,
      rawSongIds: rawItem.song_ids,
      normalizedSummary: {
        validCount: normalized.entries.length,
        validSongIds: normalized.entries.map((entry) => entry.songId),
        ignoredCount: normalized.invalidEntries.length,
        ignoredEntries: normalized.invalidEntries,
      },
    });
  }

  return { ...rawItem, song_ids: normalized.entries };
}

export function normalizeSongIds(rawValue: unknown) {
  const invalidEntries: unknown[] = [];
  const sourceEntries = Array.isArray(rawValue)
    ? rawValue
    : isRecord(rawValue) && Array.isArray(rawValue.songs)
      ? rawValue.songs
      : rawValue == null
        ? []
        : [rawValue];
  const entries = sourceEntries.flatMap((value) => {
    const entry = normalizeSongEntry(value);
    if (entry) return [entry];
    invalidEntries.push(value);
    return [];
  });
  return { entries, invalidEntries };
}

function normalizeSongEntry(rawEntry: unknown): WorshipSongEntry | null {
  if (typeof rawEntry === "string") {
    const value = rawEntry.trim();
    if (isValidSongId(value)) return { songId: value, notes: "" };
    try {
      return normalizeSongEntry(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (!isRecord(rawEntry)) return null;
  const rawId = rawEntry.songId ?? rawEntry.song_id ?? rawEntry.id;
  if (typeof rawId !== "string" || !isValidSongId(rawId.trim())) return null;

  const notes = firstString(
    rawEntry.notes,
    rawEntry.leader,
    rawEntry.leaderName,
    rawEntry.leader_name,
    rawEntry.responsible,
    rawEntry.responsiblePerson,
  );
  const normalizedEntry: WorshipSongEntry & Record<string, unknown> = {
    songId: rawId.trim(),
    notes: notes?.trim() ?? "",
  };
  for (const key of ["keyName", "key_name", "selectedKey", "selected_key", "key"] as const) {
    if (typeof rawEntry[key] === "string") normalizedEntry[key] = rawEntry[key];
  }
  return normalizedEntry;
}

function isValidSongId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function firstString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string");
}
