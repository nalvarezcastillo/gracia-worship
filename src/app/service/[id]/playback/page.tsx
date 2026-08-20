import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaybackWorkspace, type PlaybackEntry } from "@/components/playback-workspace";
import { formatDuration } from "@/lib/duration";
import type { ServiceItem, ServiceSongSetting } from "@/lib/service";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { buildServiceSchedule, getOperationalEntryScheduleKey } from "@/lib/service-schedule";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Playback | Gracia Worship" };
export const dynamic = "force-dynamic";

type PlaybackSong = { artist: string | null; bpm: number | null; cover_url: string | null; duration: string | null; id: string; key: string | null; time_signature: string | null; title: string; song_keys: { id: string; key_name: string; grid_bpm: number | null; grid_beats_per_bar: number | null; grid_beat_unit: number | null; grid_offset_seconds: number | null; song_sections: { id: string; label: string; section_type: null; song_key_id: string; sort_order: number; start_seconds: number; bar_number: number | null; beat_number: number | null; beat_fraction: number | null }[]; song_stems: { id: string; mime_type: string | null; name: string; song_key_id: string; sort_order: number; storage_path: string }[] }[] };

export default async function PlaybackPage({ params }: { params: Promise<{ id: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: service }, { data: itemRows, error: itemError }, { data: songs, error: songError }, { data: settings, error: settingsError }] = await Promise.all([
    supabase.from("active_setlist").select("service_name, service_date, service_time, status").eq("id", serviceId).maybeSingle(),
    supabase.from("service_items").select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").eq("service_id", serviceId).order("position"),
    supabase.from("songs").select("id, title, artist, key, bpm, duration, time_signature, cover_url, song_keys(id, key_name, grid_bpm, grid_beats_per_bar, grid_beat_unit, grid_offset_seconds, song_stems(id, song_key_id, name, storage_path, sort_order, mime_type), song_sections(id, song_key_id, label, section_type, start_seconds, bar_number, beat_number, beat_fraction, sort_order))"),
    supabase.from("service_song_settings").select("service_id, service_item_id, song_id, key_override").eq("service_id", serviceId),
  ]);
  if (!service || (service.status !== "active" && service.status !== "planned")) notFound();
  if (itemError || songError || settingsError) throw new Error(itemError?.message ?? songError?.message ?? settingsError?.message);
  const items = (itemRows ?? []).map(normalizeServiceItemSongIds) as ServiceItem[];
  const playbackSongs = (songs ?? []) as PlaybackSong[];
  const operationalEntries = buildOperationalServiceEntries(items, playbackSongs, (settings ?? []) as ServiceSongSetting[]);
  const schedule = buildServiceSchedule(items, playbackSongs, service.service_time);
  const entries = operationalEntries.map<PlaybackEntry>((entry) => {
    const base = { durationLabel: entry.plannedDurationSeconds ? formatDuration(entry.plannedDurationSeconds) : "—", durationSeconds: entry.plannedDurationSeconds, id: entry.id, scheduledTime: schedule.times.get(getOperationalEntryScheduleKey(entry)) ?? "—", title: entry.title };
    if (entry.kind === "moment") return { ...base, artist: null, bpm: null, coverUrl: null, effectiveKey: null, kind: "moment", stems: [], timeSignature: null };
    const keyVariant = entry.song.song_keys.find((variant) => variant.key_name === entry.effectiveKey);
    const stems = (keyVariant?.song_stems ?? []).sort((a, b) => a.sort_order - b.sort_order).map((stem) => ({ id: stem.id, name: stem.name, publicUrl: supabase.storage.from("songs").getPublicUrl(stem.storage_path).data.publicUrl, song_key_id: stem.song_key_id, sort_order: stem.sort_order }));
    const grid = keyVariant?.grid_bpm && keyVariant.grid_beats_per_bar && keyVariant.grid_beat_unit && keyVariant.grid_offset_seconds !== null ? { bpm: keyVariant.grid_bpm, beatsPerBar: keyVariant.grid_beats_per_bar, beatUnit: keyVariant.grid_beat_unit, gridOffsetSeconds: keyVariant.grid_offset_seconds } : null;
    return { ...base, artist: entry.song.artist, bpm: entry.song.bpm, coverUrl: entry.song.cover_url || null, effectiveKey: entry.effectiveKey, grid, kind: "song", sections: keyVariant?.song_sections ?? [], stems, timeSignature: entry.song.time_signature };
  });
  return <PlaybackWorkspace entries={entries} serviceId={serviceId} serviceName={service.service_name} serviceSchedule={[service.service_date, formatTime(service.service_time)].filter(Boolean).join(" · ")} />;
}

function formatTime(value: string | null) { if (!value) return null; const [hour, minute] = value.split(":").map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`; }
