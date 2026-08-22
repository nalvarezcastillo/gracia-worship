export type AudioDataDecoder = {
  decode: (encodedAudio: ArrayBuffer) => Promise<AudioBuffer>;
  owner: "desktop-preload" | "playback";
};

// AudioBuffers are context-independent data and may be scheduled by a context
// other than the BaseAudioContext that decoded them (Web Audio specification).
export function createAudioDataDecoder(context: BaseAudioContext, owner: AudioDataDecoder["owner"]): AudioDataDecoder {
  return { decode: (encodedAudio) => context.decodeAudioData(encodedAudio), owner };
}
