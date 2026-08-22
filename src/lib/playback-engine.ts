export type PlaybackEngineLoop = { end: number; start: number };
export type PlaybackEngineStem = { buffer: AudioBuffer; stemId: string };
export type PlaybackEngineMix = { muted: boolean; solo: boolean; stemId: string; volume: number };

export class PlaybackEngine {
  readonly context: AudioContext;
  private channels = new Map<string, { buffer: AudioBuffer; gain: GainNode }>();
  private duration = 0;
  private loop: PlaybackEngineLoop | null = null;
  private masterGain: GainNode;
  private offset = 0;
  private operation = 0;
  private playing = false;
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;

  constructor(AudioContextConstructor: typeof AudioContext) {
    this.context = new AudioContextConstructor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  get isPlaying() { return this.playing; }
  get currentOffset() { return this.offset; }
  get sampleRates() { return [...new Set([...this.channels.values()].map((channel) => channel.buffer.sampleRate))]; }

  loadChannels(stems: PlaybackEngineStem[], duration: number) {
    this.stopSources();
    this.disconnectChannels();
    this.duration = duration;
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
    this.channels = new Map(stems.map(({ buffer, stemId }) => {
      const gain = this.context.createGain();
      this.connectChannelToOutput(stemId, gain);
      return [stemId, { buffer, gain }];
    }));
  }

  getPosition(audioContextTime = this.context.currentTime, applyLoop = true) {
    if (!this.playing) return this.offset;
    const rawTime = Math.max(0, audioContextTime - this.startedAt);
    if (applyLoop && this.loop && rawTime >= this.loop.end) return this.loop.start + ((rawTime - this.loop.start) % (this.loop.end - this.loop.start));
    return Math.min(this.duration, rawTime);
  }

  async play() {
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("AudioContext did not resume");
    const offset = this.loop && (this.offset < this.loop.start || this.offset >= this.loop.end) ? this.loop.start : this.offset >= this.duration ? 0 : this.offset;
    this.startSources(offset);
    return offset;
  }

  pauseAt(time = this.getPosition()) {
    this.operation += 1;
    this.stopSources();
    this.offset = time;
    this.playing = false;
  }

  stop() { this.pauseAt(0); }

  async seek(time: number) {
    const operation = ++this.operation;
    this.offset = time;
    if (!this.playing) return null;
    this.stopSources();
    await this.context.resume();
    if (operation !== this.operation) return null;
    this.startSources(time >= this.duration ? 0 : time);
    return time >= this.duration ? 0 : time;
  }

  setLoop(loop: PlaybackEngineLoop | null) {
    this.loop = loop;
    if (!loop) for (const source of this.sources) source.loop = false;
  }

  restartAt(time: number) { if (this.playing) this.startSources(time); }

  applyMixes(mixes: PlaybackEngineMix[]) {
    const hasSolo = mixes.some((mix) => mix.solo);
    for (const mix of mixes) {
      const channel = this.channels.get(mix.stemId);
      if (!channel) continue;
      const value = mix.muted || (hasSolo && !mix.solo) ? 0 : mix.volume;
      channel.gain.gain.setValueAtTime(value, this.context.currentTime);
    }
  }

  setMasterVolume(volume: number) { this.masterGain.gain.setValueAtTime(volume, this.context.currentTime); }

  async destroy() {
    this.operation += 1;
    this.playing = false;
    this.stopSources();
    this.disconnectChannels();
    this.masterGain.disconnect();
    await this.context.close();
  }

  private startSources(offset: number) {
    this.stopSources();
    const sharedStartTime = this.context.currentTime + 0.03;
    const nextSources: AudioBufferSourceNode[] = [];
    for (const { buffer, gain } of this.channels.values()) {
      if (offset >= buffer.duration) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      if (this.loop) { source.loop = true; source.loopStart = this.loop.start; source.loopEnd = this.loop.end; }
      source.connect(gain);
      source.start(sharedStartTime, offset);
      nextSources.push(source);
    }
    this.sources = nextSources;
    this.startedAt = sharedStartTime - offset;
    this.offset = offset;
    this.playing = true;
  }

  // Phase 4 routing is inserted here between each stable stem channel and output.
  private connectChannelToOutput(_stemId: string, gain: GainNode) { gain.connect(this.masterGain); }

  private stopSources() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
    }
    this.sources = [];
  }

  private disconnectChannels() {
    for (const { gain } of this.channels.values()) gain.disconnect();
    this.channels.clear();
  }
}
