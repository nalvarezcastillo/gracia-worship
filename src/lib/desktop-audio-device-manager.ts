import { PlaybackEngine, type PlaybackOutputCapabilities } from "@/lib/playback-engine";

type OutputMediaDevices = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};

export type DesktopAudioDeviceSupport = {
  deviceChange: boolean;
  enumerateDevices: boolean;
  mediaDevices: boolean;
  selectAudioOutput: boolean;
  setSinkId: boolean;
  sinkId: boolean;
};

export type ChannelCountProbe = {
  applied: number;
  error: string | null;
  requested: number;
  supported: boolean;
};

export class DesktopAudioDeviceManager {
  constructor(private readonly engine: PlaybackEngine) {}

  get support(): DesktopAudioDeviceSupport {
    const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices as OutputMediaDevices | undefined : undefined;
    const context = this.engine.context as AudioContext & { setSinkId?: (sinkId: string) => Promise<void>; sinkId?: string };
    return {
      deviceChange: Boolean(mediaDevices && "ondevicechange" in mediaDevices),
      enumerateDevices: typeof mediaDevices?.enumerateDevices === "function",
      mediaDevices: Boolean(mediaDevices),
      selectAudioOutput: typeof mediaDevices?.selectAudioOutput === "function",
      setSinkId: typeof context.setSinkId === "function",
      sinkId: "sinkId" in context,
    };
  }

  getCapabilities() { return this.engine.getOutputCapabilities(); }

  async enumerateOutputs() {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return [];
    return (await mediaDevices.enumerateDevices()).filter((device) => device.kind === "audiooutput");
  }

  async requestOutput() {
    const mediaDevices = navigator.mediaDevices as OutputMediaDevices | undefined;
    if (!mediaDevices?.selectAudioOutput) throw new Error("selectAudioOutput is not supported");
    return mediaDevices.selectAudioOutput();
  }

  async selectOutput(deviceId: string) {
    await this.engine.setOutputDevice(deviceId);
    return this.getCapabilities();
  }

  probeMaximumChannelCount(): ChannelCountProbe {
    const destination = this.engine.context.destination;
    const requested = destination.maxChannelCount;
    if (this.engine.isPlaying) return { applied: destination.channelCount, error: "Detén Playback antes de probar los canales.", requested, supported: false };
    try {
      destination.channelCount = requested;
      const applied = destination.channelCount;
      return { applied, error: applied === requested ? null : `Chrome aplicó ${applied} de ${requested} canales.`, requested, supported: applied === requested };
    } catch (error) {
      return { applied: destination.channelCount, error: error instanceof Error ? error.message : "Chrome rechazó el cambio de canales.", requested, supported: false };
    }
  }

  onDeviceChange(listener: () => void) {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices) return () => undefined;
    mediaDevices.addEventListener("devicechange", listener);
    return () => mediaDevices.removeEventListener("devicechange", listener);
  }

  markOutputUnavailable() { this.engine.markOutputUnavailable(); }
}

export type { PlaybackOutputCapabilities };
