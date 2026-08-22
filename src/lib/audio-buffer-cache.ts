import { recordStemDecode } from "@/lib/playback-runtime-diagnostics";
import type { AudioDataDecoder } from "@/lib/audio-data-decoder";
export type PublicSongStem = { id: string; name: string; publicUrl: string; song_key_id: string; sort_order: number };
export type LoadedStem = { buffer: AudioBuffer; decodeMs: number; downloadMs: number; stem: PublicSongStem };
export type StemLoadFailure = { decodeMs: number; downloadMs: number; fetched: boolean; message: string; stem: PublicSongStem };
export type LoadMode = "foreground" | "preload";
export type AudioCachePolicy = { maxCachedSongs?: number; retainOnlyCurrent?: boolean };
export type BundleDiagnostics = { approximateBytes: number; cacheHit: boolean; decodeMs: number; decodedDurationSeconds: number; decodedStems: number; downloadMs: number; evictions: number; fetchedStems: number; loadMode: LoadMode; readyMs: number; requestedStems: number };
export type StemBundleResult = { diagnostics: BundleDiagnostics; failures: StemLoadFailure[]; loaded: LoadedStem[] };
type CacheEntry = { controller: AbortController; consumers: Set<symbol>; key: string; label: string; lastUsed: number; promise: Promise<StemBundleResult>; settled: boolean };
const bundleCache = new Map<string, CacheEntry>();
const MAX_CACHED_SONGS = 3;
let evictionCount = 0;

export function stemBundleKey(stems: PublicSongStem[]) { return stems.map((stem) => `${stem.id}:${stem.publicUrl}`).join("|"); }
export function loadStemBundle(decoder: AudioDataDecoder, stems: PublicSongStem[], options: { label?: string; mode?: LoadMode; policy?: AudioCachePolicy; signal?: AbortSignal } = {}) {
  const key = stemBundleKey(stems); applyCachePolicy(key, options.policy); const cached = bundleCache.get(key);
  if (cached) { cached.lastUsed = Date.now(); return consumeEntry(cached, options.signal).then((result) => ({ ...result, diagnostics: { ...result.diagnostics, cacheHit: true, loadMode: options.mode ?? "foreground" } })); }
  return createBundleLoad(decoder, stems, [], options, key);
}
export async function retryStemBundle(decoder: AudioDataDecoder, stems: PublicSongStem[], options: { label?: string; mode?: LoadMode; policy?: AudioCachePolicy; signal?: AbortSignal } = {}) {
  const key = stemBundleKey(stems); applyCachePolicy(key, options.policy); const cached = bundleCache.get(key); const previous = cached ? await consumeEntry(cached, options.signal) : undefined; const successful = previous?.loaded ?? [];
  removeEntry(key, "explicit retry"); return createBundleLoad(decoder, stems, successful, options, key);
}
export function releaseStemBundle(stems: PublicSongStem[]) { removeEntry(stemBundleKey(stems), "release"); }
export function getAudioCacheDiagnostics() {
  const entries = [...bundleCache.values()];
  return Promise.allSettled(entries.map((entry) => entry.promise)).then((settled) => { const results = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []); return { approximateBytes: results.reduce((t, r) => t + r.diagnostics.approximateBytes, 0), decodedDurationSeconds: results.reduce((t, r) => t + r.diagnostics.decodedDurationSeconds, 0), evictions: evictionCount, songs: results.length, stems: results.reduce((t, r) => t + r.loaded.length, 0) }; });
}
function createBundleLoad(decoder: AudioDataDecoder, stems: PublicSongStem[], retained: LoadedStem[], options: { label?: string; mode?: LoadMode; policy?: AudioCachePolicy; signal?: AbortSignal }, key: string) {
  const started = performance.now(); const retainedIds = new Set(retained.map((item) => item.stem.id)); const controller = new AbortController();
  const entry: CacheEntry = { controller, consumers: new Set(), key, label: options.label ?? "Canción", lastUsed: Date.now(), promise: undefined as unknown as Promise<StemBundleResult>, settled: false };
  entry.promise = Promise.allSettled(stems.filter((stem) => !retainedIds.has(stem.id)).map((stem) => fetchAndDecode(decoder, stem, controller.signal))).then((settled): StemBundleResult => {
    if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const newlyLoaded = settled.flatMap((r) => r.status === "fulfilled" ? [r.value] : []); const all = [...retained, ...newlyLoaded];
    const loaded = stems.flatMap((stem) => all.find((item) => item.stem.id === stem.id) ?? []);
    const failures = settled.flatMap((r) => r.status === "rejected" ? [r.reason as StemLoadFailure] : []);
    return { failures, loaded, diagnostics: summarize(stems.length, loaded, failures, performance.now() - started, options.mode ?? "foreground") };
  }).then((result) => { if (!result.loaded.length) removeEntry(key, "zero-success load", entry); else evictOldBundles(key, options.policy?.maxCachedSongs ?? MAX_CACHED_SONGS); return result; }).catch((error) => { removeEntry(key, isAbortError(error) ? "aborted load" : "fatal load", entry); throw error; }).finally(() => { entry.settled = true; });
  bundleCache.set(key, entry); return consumeEntry(entry, options.signal);
}
async function fetchAndDecode(decoder: AudioDataDecoder, stem: PublicSongStem, signal?: AbortSignal) {
  let fetched = false; let downloadMs = 0; let decodeStarted = 0;
  try { const ds = performance.now(); const response = await fetch(stem.publicUrl, { signal }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const encoded = await response.arrayBuffer(); downloadMs = performance.now() - ds; fetched = true; if (signal?.aborted) throw new DOMException("Aborted", "AbortError"); decodeStarted = performance.now(); if (process.env.NODE_ENV === "development") recordStemDecode(stem.publicUrl, decoder.owner); const buffer = await decoder.decode(encoded); return { buffer, decodeMs: performance.now() - decodeStarted, downloadMs, stem } satisfies LoadedStem; }
  catch (error) { throw { decodeMs: decodeStarted ? performance.now() - decodeStarted : 0, downloadMs, fetched, message: error instanceof Error ? error.message : "Error desconocido", stem } satisfies StemLoadFailure; }
}
function summarize(requestedStems: number, loaded: LoadedStem[], failures: StemLoadFailure[], readyMs: number, loadMode: LoadMode): BundleDiagnostics {
  return { approximateBytes: loaded.reduce((t, i) => t + i.buffer.length * i.buffer.numberOfChannels * 4, 0), cacheHit: false, decodeMs: loaded.reduce((t, i) => t + i.decodeMs, 0) + failures.reduce((t, i) => t + i.decodeMs, 0), decodedDurationSeconds: loaded.reduce((t, i) => t + i.buffer.duration, 0), decodedStems: loaded.length, downloadMs: loaded.reduce((t, i) => t + i.downloadMs, 0) + failures.reduce((t, i) => t + i.downloadMs, 0), evictions: evictionCount, fetchedStems: loaded.length + failures.filter((item) => item.fetched).length, loadMode, readyMs, requestedStems };
}
function consumeEntry(entry: CacheEntry, signal?: AbortSignal) {
  const consumer = Symbol(); entry.consumers.add(consumer);
  return new Promise<StemBundleResult>((resolve, reject) => {
    let finished = false;
    const finish = () => { if (finished) return false; finished = true; entry.consumers.delete(consumer); signal?.removeEventListener("abort", onAbort); return true; };
    const onAbort = () => { if (!finish()) return; if (!entry.settled && entry.consumers.size === 0) removeEntry(entry.key, "all consumers aborted", entry); reject(new DOMException("Aborted", "AbortError")); };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener("abort", onAbort, { once: true });
    entry.promise.then((result) => { if (finish()) resolve(result); }, (error) => { if (finish()) reject(error); });
  });
}
function removeEntry(key: string, reason: string, expected?: CacheEntry) { const entry = bundleCache.get(key); if (!entry || (expected && entry !== expected)) return; bundleCache.delete(key); if (!entry.settled) entry.controller.abort(); if (process.env.NODE_ENV === "development") console.info("Playback cache removed:", { label: entry.label, reason }); }
function isAbortError(error: unknown) { return error instanceof DOMException && error.name === "AbortError"; }
function applyCachePolicy(currentKey: string, policy?: AudioCachePolicy) { if (!policy?.retainOnlyCurrent) return; for (const [key, entry] of bundleCache) { if (key === currentKey) continue; removeEntry(key, "mobile retain-current policy"); evictionCount += 1; if (process.env.NODE_ENV === "development") console.info("Playback mobile cache released:", entry.label); } }
function evictOldBundles(currentKey: string, limit: number) { while (bundleCache.size > limit) { const oldest = [...bundleCache.values()].filter((entry) => entry.key !== currentKey).sort((a, b) => a.lastUsed - b.lastUsed)[0]; if (!oldest) return; removeEntry(oldest.key, "LRU eviction"); evictionCount += 1; if (process.env.NODE_ENV === "development") console.info("Playback cache evicted:", oldest.label); } }
