export type PlaybackEngineLoop = { end: number; start: number };
export type PlaybackEngineStem = { buffer: AudioBuffer; stemId: string };
export type PlaybackEngineMix = { muted: boolean; solo: boolean; stemId: string; volume: number };
export type StemOutputRoute =
  | { mode: "standard" }
  | { mode: "mono"; output: number }
  | { mode: "stereo"; left: number; right: number };
export type PlaybackRoutingDiagnostics = {
  activeChannelCount: number;
  invalidRouteCount: number;
  mergerChannelCount: number;
  mode: "standard" | "multichannel";
  routes: Record<string, StemOutputRoute>;
};
export type PlaybackOutputCapabilities = {
  baseLatency: number;
  channelCount: number;
  channelCountMode: ChannelCountMode;
  channelInterpretation: ChannelInterpretation;
  maxChannelCount: number;
  outputLatency: number | null;
  sampleRate: number;
  sinkId: string | null;
  state: AudioContextState | "interrupted";
};

type SinkAudioContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void>; sinkId?: string };

export class PlaybackEngine {
  readonly context: AudioContext;
  private channels = new Map<string, { buffer: AudioBuffer; gain: GainNode }>();
  private duration = 0;
  private loop: PlaybackEngineLoop | null = null;
  private masterGain: GainNode;
  private outputBus: ChannelMergerNode | null = null;
  private outputNodes: AudioNode[] = [];
  private offset = 0;
  private operation = 0;
  private outputAvailable = true;
  private playing = false;
  private sources: AudioBufferSourceNode[] = [];
  private startedAt = 0;
  private routes = new Map<string, StemOutputRoute>();
  private activeOutputChannelCount = 2;
  private invalidRouteCount = 0;
  private readonly standardDestinationMode: ChannelCountMode;
  private readonly standardDestinationInterpretation: ChannelInterpretation;

  constructor(AudioContextConstructor: typeof AudioContext) {
    this.context = new AudioContextConstructor();
    this.standardDestinationMode = this.context.destination.channelCountMode;
    this.standardDestinationInterpretation = this.context.destination.channelInterpretation;
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
  }

  get isPlaying() { return this.playing; }
  get currentOffset() { return this.offset; }
  get sampleRates() { return [...new Set([...this.channels.values()].map((channel) => channel.buffer.sampleRate))]; }

  getRoutingDiagnostics(): PlaybackRoutingDiagnostics {
    return {
      activeChannelCount: this.activeOutputChannelCount,
      invalidRouteCount: this.invalidRouteCount,
      mergerChannelCount: this.outputBus?.numberOfInputs ?? 0,
      mode: this.outputBus ? "multichannel" : "standard",
      routes: Object.fromEntries(this.routes),
    };
  }

  getOutputCapabilities(): PlaybackOutputCapabilities {
    const context = this.context as SinkAudioContext;
    const destination = context.destination;
    return {
      baseLatency: context.baseLatency,
      channelCount: destination.channelCount,
      channelCountMode: destination.channelCountMode,
      channelInterpretation: destination.channelInterpretation,
      maxChannelCount: destination.maxChannelCount,
      outputLatency: "outputLatency" in context && typeof context.outputLatency === "number" ? context.outputLatency : null,
      sampleRate: context.sampleRate,
      sinkId: typeof context.sinkId === "string" ? context.sinkId : null,
      state: context.state,
    };
  }

  async setOutputDevice(deviceId: string) {
    const context = this.context as SinkAudioContext;
    if (!context.setSinkId) throw new Error("AudioContext.setSinkId is not supported");
    this.stop();
    await context.setSinkId(deviceId);
    this.outputAvailable = true;
  }

  markOutputUnavailable() {
    this.stop();
    this.outputAvailable = false;
  }

  loadChannels(stems: PlaybackEngineStem[], duration: number) {
    this.stopSources();
    this.disconnectChannels();
    this.duration = duration;
    this.offset = 0;
    this.startedAt = 0;
    this.playing = false;
    this.channels = new Map(stems.map(({ buffer, stemId }) => {
      const gain = this.context.createGain();
      return [stemId, { buffer, gain }];
    }));
    this.rebuildOutputGraph();
  }

  setStemOutputRoutes(routes: ReadonlyMap<string, StemOutputRoute>, activeChannelCount: number) {
    this.stop();
    const nextRoutes = new Map<string, StemOutputRoute>();
    let invalid = 0;
    for (const [stemId, route] of routes) {
      if (!isValidStemOutputRoute(route, activeChannelCount)) { invalid += 1; continue; }
      if (route.mode !== "standard") nextRoutes.set(stemId, route);
    }
    this.routes = nextRoutes;
    this.activeOutputChannelCount = Math.max(2, activeChannelCount);
    this.invalidRouteCount = invalid;
    this.rebuildOutputGraph();
    const diagnostics = this.getRoutingDiagnostics();
    if (process.env.NODE_ENV === "development") console.info("Playback output routing:", diagnostics);
    return diagnostics;
  }

  getPosition(audioContextTime = this.context.currentTime, applyLoop = true) {
    if (!this.playing) return this.offset;
    const rawTime = Math.max(0, audioContextTime - this.startedAt);
    if (applyLoop && this.loop && rawTime >= this.loop.end) return this.loop.start + ((rawTime - this.loop.start) % (this.loop.end - this.loop.start));
    return Math.min(this.duration, rawTime);
  }

  async play() {
    if (!this.outputAvailable) throw new Error("The selected audio output is unavailable");
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
    this.disconnectOutputGraph();
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

  private rebuildOutputGraph() {
    for (const { gain } of this.channels.values()) gain.disconnect();
    this.disconnectOutputGraph();
    this.masterGain.disconnect();
    const routed = [...this.routes.values()].some((route) => route.mode !== "standard");
    if (!routed) {
      this.activeOutputChannelCount = 2;
      this.context.destination.channelCountMode = this.standardDestinationMode;
      this.context.destination.channelInterpretation = this.standardDestinationInterpretation;
      this.masterGain.channelCount = 2;
      this.masterGain.channelCountMode = "max";
      this.masterGain.channelInterpretation = "speakers";
      for (const { gain } of this.channels.values()) gain.connect(this.masterGain);
      this.masterGain.connect(this.context.destination);
      return;
    }

    const channelCount = this.activeOutputChannelCount;
    const destination = this.context.destination;
    if (channelCount > destination.maxChannelCount || destination.channelCount < channelCount) {
      throw new Error(`La salida no tiene ${channelCount} canales disponibles.`);
    }
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "discrete";
    this.masterGain.channelCount = channelCount;
    this.masterGain.channelCountMode = "explicit";
    this.masterGain.channelInterpretation = "discrete";
    const bus = this.context.createChannelMerger(channelCount);
    bus.channelInterpretation = "discrete";
    this.outputBus = bus;
    for (const [stemId, channel] of this.channels) this.connectChannelToBus(channel, this.routes.get(stemId) ?? { mode: "standard" }, bus);
    bus.connect(this.masterGain);
    this.masterGain.connect(destination);
  }

  private connectChannelToBus(channel: { buffer: AudioBuffer; gain: GainNode }, route: StemOutputRoute, bus: ChannelMergerNode) {
    const sourceChannels = channel.buffer.numberOfChannels;
    if (route.mode === "mono") {
      if (sourceChannels === 1) channel.gain.connect(bus, 0, toChannelIndex(route.output));
      else {
        const splitter = this.context.createChannelSplitter(sourceChannels);
        const leftGain = this.context.createGain();
        const rightGain = this.context.createGain();
        leftGain.gain.value = 0.5;
        rightGain.gain.value = 0.5;
        channel.gain.connect(splitter);
        splitter.connect(leftGain, 0);
        splitter.connect(rightGain, 1);
        leftGain.connect(bus, 0, toChannelIndex(route.output));
        rightGain.connect(bus, 0, toChannelIndex(route.output));
        this.outputNodes.push(splitter, leftGain, rightGain);
      }
      return;
    }

    const left = route.mode === "stereo" ? route.left : 1;
    const right = route.mode === "stereo" ? route.right : 2;
    if (sourceChannels === 1) {
      channel.gain.connect(bus, 0, toChannelIndex(left));
      channel.gain.connect(bus, 0, toChannelIndex(right));
      return;
    }
    const splitter = this.context.createChannelSplitter(sourceChannels);
    channel.gain.connect(splitter);
    splitter.connect(bus, 0, toChannelIndex(left));
    splitter.connect(bus, 1, toChannelIndex(right));
    this.outputNodes.push(splitter);
  }

  private disconnectOutputGraph() {
    this.outputBus?.disconnect();
    this.outputBus = null;
    for (const node of this.outputNodes) node.disconnect();
    this.outputNodes = [];
  }

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

export function toChannelIndex(output: number) { return output - 1; }

export function isValidStemOutputRoute(route: StemOutputRoute, channelCount: number) {
  if (route.mode === "standard") return true;
  if (route.mode === "mono") return Number.isInteger(route.output) && route.output >= 1 && route.output <= channelCount;
  return Number.isInteger(route.left) && Number.isInteger(route.right)
    && route.left >= 1 && route.right >= 1
    && route.left <= channelCount && route.right <= channelCount
    && route.left !== route.right;
}
