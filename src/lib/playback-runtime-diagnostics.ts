const decodeCountByStemUrl = new Map<string, number>();
const decodeCountByOwner = new Map<string, number>();
let audioContexts = 0;
let decoderContexts = 0;
let multitrackPlayerInstances = 0;

export function recordMultitrackPlayerMount(delta: 1 | -1) {
  multitrackPlayerInstances = Math.max(0, multitrackPlayerInstances + delta);
  if (multitrackPlayerInstances === 0) { decodeCountByStemUrl.clear(); decodeCountByOwner.clear(); }
}

export function recordAudioContext(delta: 1 | -1) { audioContexts = Math.max(0, audioContexts + delta); }
export function recordDecoderContext(delta: 1 | -1) { decoderContexts = Math.max(0, decoderContexts + delta); }
export function recordStemDecode(url: string, owner = "unknown") { decodeCountByStemUrl.set(url, (decodeCountByStemUrl.get(url) ?? 0) + 1); decodeCountByOwner.set(owner, (decodeCountByOwner.get(owner) ?? 0) + 1); }
export function getPlaybackRuntimeDiagnostics(waveformPeakSets: number) { return { multitrackPlayerInstances, audioContexts, decoderContexts, decodeCountByOwner: Object.fromEntries(decodeCountByOwner), decodeCountByStemUrl: Object.fromEntries(decodeCountByStemUrl), waveformPeakSets }; }
