import type { PublicSongStem } from "@/lib/audio-buffer-cache";
import { isValidStemOutputRoute, type StemOutputRoute } from "@/lib/playback-engine";

export const PLAYBACK_ROUTING_STORAGE_KEY = "gracia-worship.playback-routing.v1";
export const PLAYBACK_ROUTING_VERSION = 1;

export type PersistedOutputDevice = {
  deviceId: string;
  label: string;
  maxChannelCount: number;
  sampleRate: number;
};

export type LogicalStemRoute = { label: string; route: StemOutputRoute };
export type PlaybackRoutingPreset = {
  createdAt: string;
  device: PersistedOutputDevice;
  id: string;
  isDefault: boolean;
  name: string;
  routes: Record<string, LogicalStemRoute>;
  updatedAt: string;
};
export type PlaybackRoutingPreferences = {
  lastSelectedPresetId: string | null;
  preferredDevice: PersistedOutputDevice | null;
  presets: PlaybackRoutingPreset[];
  version: 1;
};
export type PresetRouteResolution = {
  invalid: LogicalStemRoute[];
  matched: number;
  routes: Map<string, StemOutputRoute>;
  unmatched: LogicalStemRoute[];
};

export function emptyPlaybackRoutingPreferences(): PlaybackRoutingPreferences {
  return { lastSelectedPresetId: null, preferredDevice: null, presets: [], version: PLAYBACK_ROUTING_VERSION };
}

export function loadPlaybackRoutingPreferences(storage: Pick<Storage, "getItem"> = window.localStorage) {
  try {
    const raw = storage.getItem(PLAYBACK_ROUTING_STORAGE_KEY);
    if (!raw) return emptyPlaybackRoutingPreferences();
    return parsePreferences(JSON.parse(raw));
  } catch {
    return emptyPlaybackRoutingPreferences();
  }
}

export function savePlaybackRoutingPreferences(preferences: PlaybackRoutingPreferences, storage: Pick<Storage, "setItem"> = window.localStorage) {
  try { storage.setItem(PLAYBACK_ROUTING_STORAGE_KEY, JSON.stringify(preferences)); return true; }
  catch { return false; }
}

// Intentionally conservative: only Unicode/case/whitespace variants share an identity.
export function normalizeStemIdentity(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function logicalRoutesFromRuntime(stems: PublicSongStem[], routes: ReadonlyMap<string, StemOutputRoute>) {
  const logical: Record<string, LogicalStemRoute> = {};
  for (const stem of stems) {
    const route = routes.get(stem.id);
    if (!route || route.mode === "standard") continue;
    const identity = normalizeStemIdentity(stem.name);
    if (identity && !logical[identity]) logical[identity] = { label: stem.name, route };
  }
  return logical;
}

export function resolvePresetRoutes(preset: PlaybackRoutingPreset, stems: PublicSongStem[], channelCount: number): PresetRouteResolution {
  const stemsByIdentity = new Map<string, PublicSongStem[]>();
  for (const stem of stems) {
    const identity = normalizeStemIdentity(stem.name);
    stemsByIdentity.set(identity, [...(stemsByIdentity.get(identity) ?? []), stem]);
  }
  const routes = new Map<string, StemOutputRoute>();
  const invalid: LogicalStemRoute[] = [];
  const unmatched: LogicalStemRoute[] = [];
  for (const [identity, entry] of Object.entries(preset.routes)) {
    if (!isValidStemOutputRoute(entry.route, channelCount)) { invalid.push(entry); continue; }
    const candidates = stemsByIdentity.get(identity);
    if (!candidates || candidates.length !== 1) { unmatched.push(entry); continue; }
    routes.set(candidates[0].id, entry.route);
  }
  return { invalid, matched: routes.size, routes, unmatched };
}

function parsePreferences(value: unknown): PlaybackRoutingPreferences {
  if (!isRecord(value) || value.version !== PLAYBACK_ROUTING_VERSION) return emptyPlaybackRoutingPreferences();
  const presets = Array.isArray(value.presets) ? value.presets.flatMap(parsePreset) : [];
  const preferredDevice = parseDevice(value.preferredDevice);
  const selected = typeof value.lastSelectedPresetId === "string" && presets.some((preset) => preset.id === value.lastSelectedPresetId) ? value.lastSelectedPresetId : null;
  return { lastSelectedPresetId: selected, preferredDevice, presets, version: PLAYBACK_ROUTING_VERSION };
}

function parsePreset(value: unknown): PlaybackRoutingPreset[] {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || !value.name.trim()) return [];
  const device = parseDevice(value.device); if (!device || !isRecord(value.routes)) return [];
  const routes: Record<string, LogicalStemRoute> = {};
  for (const [identity, entry] of Object.entries(value.routes)) {
    if (!identity || !isRecord(entry) || typeof entry.label !== "string" || !isRoute(entry.route)) continue;
    routes[identity] = { label: entry.label, route: entry.route };
  }
  return [{ createdAt: typeof value.createdAt === "string" ? value.createdAt : "", device, id: value.id, isDefault: value.isDefault === true, name: value.name.trim(), routes, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "" }];
}

function parseDevice(value: unknown): PersistedOutputDevice | null {
  if (!isRecord(value) || typeof value.deviceId !== "string" || typeof value.label !== "string" || !positiveInteger(value.maxChannelCount) || typeof value.sampleRate !== "number" || !Number.isFinite(value.sampleRate)) return null;
  return { deviceId: value.deviceId, label: value.label, maxChannelCount: value.maxChannelCount, sampleRate: value.sampleRate };
}
function isRoute(value: unknown): value is StemOutputRoute {
  if (!isRecord(value) || typeof value.mode !== "string") return false;
  if (value.mode === "standard") return true;
  if (value.mode === "mono") return positiveInteger(value.output);
  return value.mode === "stereo" && positiveInteger(value.left) && positiveInteger(value.right) && value.left !== value.right;
}
function positiveInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value > 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
