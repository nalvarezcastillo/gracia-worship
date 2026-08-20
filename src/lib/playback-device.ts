export const PHONE_HIGH_DECODED_PCM_BYTES = 512 * 1024 * 1024;

export function isPhonePlaybackDevice() {
  if (typeof window === "undefined") return false;
  const navigatorWithHints = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (navigatorWithHints.userAgentData?.mobile) return true;
  if (/(iPhone|iPod|Android.*Mobile)/i.test(navigator.userAgent)) return true;
  return window.matchMedia("(pointer: coarse)").matches && Math.min(window.screen.width, window.screen.height) <= 480;
}

export function estimateDecodedPcmBytes(stemCount: number, durationSeconds: number) {
  const conservativeSampleRate = 48_000;
  const stereoChannels = 2;
  return Math.max(0, stemCount) * Math.max(0, durationSeconds) * conservativeSampleRate * stereoChannels * 4;
}
