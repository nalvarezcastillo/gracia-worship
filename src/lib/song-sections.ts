import type { SongSectionRow } from "@/lib/database.types";
export type SongSection = Pick<SongSectionRow, "id" | "label" | "section_type" | "song_key_id" | "sort_order" | "start_seconds">;
export function getCurrentSongSection(sections: SongSection[], currentTime: number) { return [...sections].sort((a, b) => a.start_seconds - b.start_seconds).filter((section) => section.start_seconds <= currentTime).at(-1) ?? null; }
