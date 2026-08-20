const decodeCountByStemUrl = new Map<string, number>();
let audioContexts = 0;
let multitrackPlayerInstances = 0;

export function recordMultitrackPlayerMount(delta: 1 | -1) {
  multitrackPlayerInstances = Math.max(0, multitrackPlayerInstances + delta);
  if (multitrackPlayerInstances === 0) decodeCountByStemUrl.clear();
}

export function recordAudioContext(delta: 1 | -1) { audioContexts = Math.max(0, audioContexts + delta); }
export function recordStemDecode(url: string) { decodeCountByStemUrl.set(url, (decodeCountByStemUrl.get(url) ?? 0) + 1); }
export function getPlaybackRuntimeDiagnostics(waveformPeakSets: number) { return { multitrackPlayerInstances, audioContexts, decodeCountByStemUrl: Object.fromEntries(decodeCountByStemUrl), waveformPeakSets }; }
