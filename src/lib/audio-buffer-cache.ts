export type PublicSongStem = { id: string; name: string; publicUrl: string; song_key_id: string; sort_order: number };
export type LoadedStem = { buffer: AudioBuffer; decodeMs: number; downloadMs: number; stem: PublicSongStem };
export type StemLoadFailure = { decodeMs: number; downloadMs: number; fetched: boolean; message: string; stem: PublicSongStem };
export type LoadMode = "foreground" | "preload";
export type BundleDiagnostics = { approximateBytes: number; cacheHit: boolean; decodeMs: number; decodedDurationSeconds: number; decodedStems: number; downloadMs: number; evictions: number; fetchedStems: number; loadMode: LoadMode; readyMs: number; requestedStems: number };
export type StemBundleResult = { diagnostics: BundleDiagnostics; failures: StemLoadFailure[]; loaded: LoadedStem[] };
type CacheEntry = { key: string; label: string; lastUsed: number; promise: Promise<StemBundleResult> };
const bundleCache = new Map<string, CacheEntry>();
const MAX_CACHED_SONGS = 3;
let evictionCount = 0;

export function stemBundleKey(stems: PublicSongStem[]) { return stems.map((stem) => `${stem.id}:${stem.publicUrl}`).join("|"); }
export function loadStemBundle(context: AudioContext, stems: PublicSongStem[], options: { label?: string; mode?: LoadMode } = {}) {
  const key = stemBundleKey(stems); const cached = bundleCache.get(key);
  if (cached) { cached.lastUsed = Date.now(); return cached.promise.then((result) => ({ ...result, diagnostics: { ...result.diagnostics, cacheHit: true, loadMode: options.mode ?? "foreground" } })); }
  return createBundleLoad(context, stems, [], options, key);
}
export async function retryStemBundle(context: AudioContext, stems: PublicSongStem[], options: { label?: string; mode?: LoadMode } = {}) {
  const key = stemBundleKey(stems); const previous = await bundleCache.get(key)?.promise; const successful = previous?.loaded ?? [];
  bundleCache.delete(key); return createBundleLoad(context, stems, successful, options, key);
}
export function getAudioCacheDiagnostics() {
  const entries = [...bundleCache.values()];
  return Promise.all(entries.map((entry) => entry.promise)).then((results) => ({ approximateBytes: results.reduce((t, r) => t + r.diagnostics.approximateBytes, 0), decodedDurationSeconds: results.reduce((t, r) => t + r.diagnostics.decodedDurationSeconds, 0), evictions: evictionCount, songs: entries.length, stems: results.reduce((t, r) => t + r.loaded.length, 0) }));
}
function createBundleLoad(context: AudioContext, stems: PublicSongStem[], retained: LoadedStem[], options: { label?: string; mode?: LoadMode }, key: string) {
  const started = performance.now(); const retainedIds = new Set(retained.map((item) => item.stem.id));
  const promise = Promise.allSettled(stems.filter((stem) => !retainedIds.has(stem.id)).map((stem) => fetchAndDecode(context, stem))).then((settled): StemBundleResult => {
    const newlyLoaded = settled.flatMap((r) => r.status === "fulfilled" ? [r.value] : []); const all = [...retained, ...newlyLoaded];
    const loaded = stems.flatMap((stem) => all.find((item) => item.stem.id === stem.id) ?? []);
    const failures = settled.flatMap((r) => r.status === "rejected" ? [r.reason as StemLoadFailure] : []);
    return { failures, loaded, diagnostics: summarize(stems.length, loaded, failures, performance.now() - started, options.mode ?? "foreground") };
  });
  bundleCache.set(key, { key, label: options.label ?? "Canción", lastUsed: Date.now(), promise }); void promise.then(() => evictOldBundles(key)); return promise;
}
async function fetchAndDecode(context: AudioContext, stem: PublicSongStem) {
  let fetched = false; let downloadMs = 0; let decodeStarted = 0;
  try { const ds = performance.now(); const response = await fetch(stem.publicUrl); if (!response.ok) throw new Error(`HTTP ${response.status}`); const encoded = await response.arrayBuffer(); downloadMs = performance.now() - ds; fetched = true; decodeStarted = performance.now(); const buffer = await context.decodeAudioData(encoded); return { buffer, decodeMs: performance.now() - decodeStarted, downloadMs, stem } satisfies LoadedStem; }
  catch (error) { throw { decodeMs: decodeStarted ? performance.now() - decodeStarted : 0, downloadMs, fetched, message: error instanceof Error ? error.message : "Error desconocido", stem } satisfies StemLoadFailure; }
}
function summarize(requestedStems: number, loaded: LoadedStem[], failures: StemLoadFailure[], readyMs: number, loadMode: LoadMode): BundleDiagnostics {
  return { approximateBytes: loaded.reduce((t, i) => t + i.buffer.length * i.buffer.numberOfChannels * 4, 0), cacheHit: false, decodeMs: loaded.reduce((t, i) => t + i.decodeMs, 0) + failures.reduce((t, i) => t + i.decodeMs, 0), decodedDurationSeconds: loaded.reduce((t, i) => t + i.buffer.duration, 0), decodedStems: loaded.length, downloadMs: loaded.reduce((t, i) => t + i.downloadMs, 0) + failures.reduce((t, i) => t + i.downloadMs, 0), evictions: evictionCount, fetchedStems: loaded.length + failures.filter((item) => item.fetched).length, loadMode, readyMs, requestedStems };
}
function evictOldBundles(currentKey: string) { while (bundleCache.size > MAX_CACHED_SONGS) { const oldest = [...bundleCache.values()].filter((entry) => entry.key !== currentKey).sort((a, b) => a.lastUsed - b.lastUsed)[0]; if (!oldest) return; bundleCache.delete(oldest.key); evictionCount += 1; if (process.env.NODE_ENV === "development") console.info("Playback cache evicted:", oldest.label); } }
