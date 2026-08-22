"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DesktopAudioDeviceManager, type ChannelCountProbe, type PlaybackOutputCapabilities } from "@/lib/desktop-audio-device-manager";
import type { PublicSongStem } from "@/lib/audio-buffer-cache";
import { isValidStemOutputRoute, type PlaybackEngine, type StemOutputRoute } from "@/lib/playback-engine";

export function DesktopAudioOutput({ engine, onTransportStopped, stems }: { engine: PlaybackEngine | null; onTransportStopped: () => void; stems: PublicSongStem[] }) {
  const manager = useMemo(() => engine ? new DesktopAudioDeviceManager(engine) : null, [engine]);
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [configuredId, setConfiguredId] = useState("");
  const [selectedLabel, setSelectedLabel] = useState("Salida predeterminada");
  const [capabilities, setCapabilities] = useState<PlaybackOutputCapabilities | null>(null);
  const [probe, setProbe] = useState<ChannelCountProbe | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [routes, setRoutes] = useState<Map<string, StemOutputRoute>>(new Map());
  const appliedEngineRef = useRef<PlaybackEngine | null>(null);

  const refresh = useCallback(async () => {
    if (!manager) return [];
    const outputs = await manager.enumerateOutputs();
    setDevices(outputs);
    setCapabilities(manager.getCapabilities());
    return outputs;
  }, [manager]);

  useEffect(() => {
    if (!manager) { setCapabilities(null); return; }
    setCapabilities(manager.getCapabilities());
    void refresh().catch(() => setMessage("No se pudieron consultar las salidas de audio."));
    return manager.onDeviceChange(() => {
      void refresh().then((outputs) => {
        if (!configuredId || outputs.some((device) => device.deviceId === configuredId)) return;
        manager.markOutputUnavailable();
        onTransportStopped();
        setUnavailable(true);
        setMessage("Dispositivo de audio desconectado");
        setProbe(null);
      }).catch(() => setMessage("No se pudieron actualizar las salidas de audio."));
    });
  }, [configuredId, manager, onTransportStopped, refresh]);

  useEffect(() => {
    if (!engine || !manager) { appliedEngineRef.current = null; return; }
    if (!configuredId || unavailable || appliedEngineRef.current === engine) return;
    appliedEngineRef.current = engine;
    void manager.selectOutput(configuredId).then(setCapabilities).catch(() => setMessage("No se pudo restaurar la salida seleccionada."));
  }, [configuredId, engine, manager, unavailable]); // Reapply an explicit selection to a replacement song engine.

  useEffect(() => { setRoutes(new Map()); setProbe(null); }, [engine]);

  async function select(device: MediaDeviceInfo) {
    if (!manager) return;
    setBusy(true); setMessage(null); setProbe(null);
    try {
      onTransportStopped();
      engine?.setStemOutputRoutes(new Map(), 2);
      setCapabilities(await manager.selectOutput(device.deviceId));
      appliedEngineRef.current = engine;
      setSelectedId(device.deviceId);
      setConfiguredId(device.deviceId);
      setSelectedLabel(device.label || "Salida de audio seleccionada");
      setUnavailable(false);
      setMessage(routes.size ? "Salida conectada. Prueba sus canales para validar las rutas guardadas en memoria." : "Salida conectada. Playback permanece detenido.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo seleccionar la salida.");
    } finally { setBusy(false); }
  }

  async function requestDevice() {
    if (!manager) return;
    setBusy(true); setMessage(null);
    try { await select(await manager.requestOutput()); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo autorizar la salida."); setBusy(false); }
  }

  const support = manager?.support;
  const multichannel = probe ? probe.applied > 2 ? "Disponible" : "No disponible" : capabilities && capabilities.maxChannelCount > 2 ? "Posible; falta probar" : capabilities ? "No disponible" : "Desconocido";
  const routingChannelCount = configuredId && !unavailable && probe?.supported && probe.applied > 2 ? probe.applied : 0;

  function updateRoute(stemId: string, route: StemOutputRoute) {
    if (!engine || !routingChannelCount || !isValidStemOutputRoute(route, routingChannelCount)) return;
    const next = new Map(routes);
    if (route.mode === "standard") next.delete(stemId); else next.set(stemId, route);
    onTransportStopped();
    engine.setStemOutputRoutes(next, routingChannelCount);
    setRoutes(next);
    setMessage("Ruta aplicada. Playback permanece detenido.");
  }

  return <section className="mb-3 hidden border border-white/[0.08] bg-black/20 lg:block" aria-label="Salida de audio">
    <div className="flex min-h-12 items-center justify-between gap-4 px-4"><div className="min-w-0"><p className="text-[0.625rem] font-bold uppercase tracking-[0.14em] text-zinc-600">Audio Output</p><p className="truncate text-xs font-semibold text-zinc-300">{selectedLabel}</p></div><button type="button" onClick={() => { setOpen((value) => !value); if (!open) void refresh(); }} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 hover:bg-white/[0.05]">Configurar</button></div>
    {open ? <div className="border-t border-white/[0.07] p-4"><p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Audio Device</p>{!engine ? <p className="mt-3 text-xs text-zinc-500">Preparando motor de audio…</p> : <><label className="mt-3 block text-xs font-semibold text-zinc-500">Dispositivo<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={!support?.setSinkId || busy} className="mt-1.5 min-h-10 w-full border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-200"><option value="">Seleccionar salida…</option>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Salida de audio ${index + 1}`}</option>)}</select></label><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={!selectedId || !support?.setSinkId || busy} onClick={() => { const device = devices.find((item) => item.deviceId === selectedId); if (device) void select(device); }} className="min-h-9 rounded-lg bg-emerald-400 px-3 text-xs font-bold text-zinc-950 disabled:opacity-35">Usar dispositivo</button>{support?.selectAudioOutput ? <button type="button" disabled={busy} onClick={() => void requestDevice()} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-35">Autorizar otra salida</button> : null}<button type="button" disabled={engine.isPlaying || busy || !capabilities?.maxChannelCount} onClick={() => { if (!manager) return; const result = manager.probeMaximumChannelCount(); setProbe(result); setCapabilities(manager.getCapabilities()); if (result.supported) engine.setStemOutputRoutes(routes, result.applied); }} className="min-h-9 rounded-lg border border-white/10 px-3 text-xs font-semibold text-zinc-300 disabled:opacity-35">Probar canales</button></div>{message ? <p role="status" className={`mt-3 text-xs ${unavailable ? "text-rose-300" : "text-zinc-400"}`}>{message}</p> : null}<dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 text-xs xl:grid-cols-4"><Metric label="Estado" value={unavailable ? "Desconectado" : capabilities?.state ?? "—"} /><Metric label="Sample Rate" value={capabilities ? `${capabilities.sampleRate / 1000} kHz` : "—"} /><Metric label="Latencia base" value={formatLatency(capabilities?.baseLatency)} /><Metric label="Latencia salida" value={formatLatency(capabilities?.outputLatency)} /><Metric label="Canales máximos" value={String(capabilities?.maxChannelCount ?? "—")} /><Metric label="Canales actuales" value={String(capabilities?.channelCount ?? "—")} /><Metric label="Multicanal" value={multichannel} /><Metric label="mediaDevices" value={support?.mediaDevices ? "Compatible" : "No compatible"} /><Metric label="enumerateDevices" value={support?.enumerateDevices ? "Compatible" : "No compatible"} /><Metric label="selectAudioOutput" value={support?.selectAudioOutput ? "Compatible" : "No compatible"} /><Metric label="setSinkId" value={support?.setSinkId ? "Compatible" : "No compatible"} /><Metric label="sinkId" value={support?.sinkId ? "Expuesto" : "No expuesto"} /><Metric label="devicechange" value={support?.deviceChange ? "Compatible" : "No compatible"} /><Metric label="Modo de canales" value={capabilities?.channelCountMode ?? "—"} /><Metric label="Interpretación" value={capabilities?.channelInterpretation ?? "—"} /></dl>{probe?.error ? <p className="mt-3 text-xs text-amber-300">{probe.error}</p> : null}{routingChannelCount ? <RoutingPanel channelCount={routingChannelCount} routes={routes} stems={stems} onChange={updateRoute} /> : null}</>}</div> : null}
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-zinc-600">{label}</dt><dd className="mt-0.5 truncate font-medium text-zinc-300">{value}</dd></div>; }
function formatLatency(value: number | null | undefined) { return value === null || value === undefined ? "—" : `${(value * 1000).toFixed(1)} ms`; }

function RoutingPanel({ channelCount, onChange, routes, stems }: { channelCount: number; onChange: (stemId: string, route: StemOutputRoute) => void; routes: ReadonlyMap<string, StemOutputRoute>; stems: PublicSongStem[] }) {
  const outputs = Array.from({ length: channelCount }, (_, index) => index + 1);
  const invalidCount = [...routes.values()].filter((route) => !isValidStemOutputRoute(route, channelCount)).length;
  return <div className="mt-5 border-t border-white/[0.07] pt-4"><p className="text-[0.625rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Output Routing</p><p className="mt-1 text-xs text-zinc-500">Los cambios detienen Playback. Las asignaciones duplicadas se suman.</p>{invalidCount ? <p role="alert" className="mt-2 text-xs text-amber-300">{invalidCount} {invalidCount === 1 ? "ruta requiere" : "rutas requieren"} una salida disponible antes de reproducir.</p> : null}<div className="mt-3 divide-y divide-white/[0.06]">{stems.map((stem) => { const route = routes.get(stem.id) ?? { mode: "standard" as const }; return <div key={stem.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(8rem,1fr)_8rem_minmax(10rem,1fr)] sm:items-center"><span className="truncate text-xs font-semibold text-zinc-300">{stem.name}</span><select aria-label={`Modo de salida de ${stem.name}`} value={route.mode} onChange={(event) => { const mode = event.target.value; onChange(stem.id, mode === "mono" ? { mode, output: 1 } : mode === "stereo" ? { mode, left: 1, right: 2 } : { mode: "standard" }); }} className={selectClass}><option value="standard">Standard</option><option value="mono">Mono</option><option value="stereo">Stereo</option></select>{route.mode === "standard" ? <span className="text-xs text-zinc-600">Salida estéreo normal</span> : route.mode === "mono" ? <OutputSelect label={`Salida de ${stem.name}`} outputs={outputs} value={route.output} onChange={(output) => onChange(stem.id, { mode: "mono", output })} /> : <div className="grid grid-cols-2 gap-2"><OutputSelect label={`Salida izquierda de ${stem.name}`} outputs={outputs} value={route.left} onChange={(left) => { if (left !== route.right) onChange(stem.id, { ...route, left }); }} /><OutputSelect label={`Salida derecha de ${stem.name}`} outputs={outputs} value={route.right} onChange={(right) => { if (right !== route.left) onChange(stem.id, { ...route, right }); }} /></div>}</div>; })}</div></div>;
}

function OutputSelect({ label, onChange, outputs, value }: { label: string; onChange: (value: number) => void; outputs: number[]; value: number }) { return <select aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} className={selectClass}>{outputs.map((output) => <option key={output} value={output}>Output {output}</option>)}</select>; }
const selectClass = "min-h-9 w-full border border-white/10 bg-zinc-950 px-2 text-xs text-zinc-200";
