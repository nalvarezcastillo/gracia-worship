"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import type { SongKeyRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function ManageSongKeys({ initialKeys, songId }: { initialKeys: SongKeyRow[]; songId: string }) {
  const [keys, setKeys] = useState(initialKeys);
  const [editingKey, setEditingKey] = useState<SongKeyRow | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function requireSession() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return supabase;
  }

  async function uploadKeyFile(supabase: Awaited<ReturnType<typeof requireSession>>, keyId: string, name: "audio" | "sheet", file: File | null) {
    if (!file) return null;
    if (name === "audio" && !file.type.startsWith("audio/")) throw new Error("Selecciona un archivo de audio válido.");
    if (name === "sheet" && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Selecciona un archivo PDF válido.");
    const extension = file.name.split(".").pop()?.toLowerCase() || (name === "audio" ? "audio" : "pdf");
    const path = `${songId}/keys/${keyId}/${name}.${extension}`;
    const { error } = await supabase.storage.from("songs").upload(path, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: true,
    });
    if (error) throw error;
    return supabase.storage.from("songs").getPublicUrl(path).data.publicUrl;
  }

  async function saveKey(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const keyName = String(formData.get("key_name") ?? "").trim();
    if (!keyName) return;
    if (keys.some((item) => item.key_name.toLocaleLowerCase() === keyName.toLocaleLowerCase() && item.id !== editingKey?.id)) {
      setIsError(true);
      setMessage("Esta tonalidad ya existe para la canción.");
      return;
    }

    const operationId = editingKey?.id ?? crypto.randomUUID();
    setBusyId(operationId);
    setMessage("");
    try {
      const supabase = await requireSession();
      const audioFile = getFile(formData, "audio");
      const sheetFile = getFile(formData, "sheet");
      const [uploadedAudioUrl, uploadedSheetUrl] = await Promise.all([
        uploadKeyFile(supabase, operationId, "audio", audioFile),
        uploadKeyFile(supabase, operationId, "sheet", sheetFile),
      ]);
      const payload = {
        song_id: songId,
        key_name: keyName,
        audio_url: uploadedAudioUrl ?? editingKey?.audio_url ?? null,
        sheet_url: uploadedSheetUrl ?? editingKey?.sheet_url ?? null,
        sort_order: editingKey?.sort_order ?? (keys.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1),
      };

      const query = editingKey
        ? supabase.from("song_keys").update(payload).eq("id", editingKey.id)
        : supabase.from("song_keys").insert(payload);
      const { data, error } = await query
        .select("id, song_id, key_name, audio_url, sheet_url, sort_order, created_at")
        .single();
      if (error) throw error;

      const savedKey = data as SongKeyRow;
      setKeys((current) => editingKey
        ? current.map((item) => item.id === savedKey.id ? savedKey : item)
        : [...current, savedKey].sort((a, b) => a.sort_order - b.sort_order));
      setEditingKey(null);
      setIsAdding(false);
      setIsError(false);
      setMessage("Tonalidad guardada.");
      form.reset();
    } catch (error) {
      console.error("Unable to save song key:", error);
      setIsError(true);
      setMessage(readableError(error, "No se pudo guardar la tonalidad."));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteKey(key: SongKeyRow) {
    if (!window.confirm(`¿Eliminar la tonalidad ${key.key_name}?`)) return;
    setBusyId(key.id);
    setMessage("");
    try {
      const supabase = await requireSession();
      const { error } = await supabase.from("song_keys").delete().eq("id", key.id).eq("song_id", songId);
      if (error) throw error;
      setKeys((current) => current.filter((item) => item.id !== key.id));
      setIsError(false);
      setMessage("Tonalidad eliminada.");
    } catch (error) {
      console.error("Unable to delete song key:", error);
      setIsError(true);
      setMessage(readableError(error, "No se pudo eliminar la tonalidad."));
    } finally {
      setBusyId(null);
    }
  }

  const formKey = editingKey?.id ?? (isAdding ? "new" : "closed");

  return (
    <section className="mt-8 rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-xl shadow-black/10 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-200">Tonalidades</h2>
        <button type="button" onClick={() => { setEditingKey(null); setIsAdding(true); setMessage(""); }} disabled={busyId !== null} className="min-h-11 rounded-full px-3 text-sm font-semibold text-emerald-400 hover:bg-emerald-400/[0.08] disabled:opacity-40">+ Agregar tonalidad</button>
      </div>

      {keys.length > 0 ? (
        <div className="mt-5 divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {keys.map((key) => (
            <div key={key.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
              <p className="font-semibold text-white">{key.key_name}</p>
              <FileLink url={key.audio_url} label="Audio" />
              <FileLink url={key.sheet_url} label="PDF" />
              <div className="flex gap-1 sm:justify-end">
                <button type="button" onClick={() => { setIsAdding(false); setEditingKey(key); setMessage(""); }} disabled={busyId !== null} className="min-h-11 rounded-full px-3 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40">Editar</button>
                <button type="button" onClick={() => void deleteKey(key)} disabled={busyId !== null} className="min-h-11 rounded-full px-3 text-sm text-rose-400 hover:bg-rose-400/[0.08] disabled:opacity-40">Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      ) : <p className="mt-5 text-sm text-zinc-500">No hay tonalidades configuradas.</p>}

      {isAdding || editingKey ? (
        <form key={formKey} onSubmit={saveKey} className="mt-6 space-y-4 border-t border-white/[0.07] pt-6">
          <label className="block text-sm font-semibold text-zinc-300">Tonalidad<input required name="key_name" defaultValue={editingKey?.key_name ?? ""} className={`mt-2 ${fieldStyles}`} /></label>
          <label className="block text-sm font-semibold text-zinc-300">Audio<input name="audio" type="file" accept="audio/*" className={`mt-2 ${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400`} /></label>
          <label className="block text-sm font-semibold text-zinc-300">PDF<input name="sheet" type="file" accept="application/pdf,.pdf" className={`mt-2 ${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400`} /></label>
          <div className="flex gap-3">
            <PrimaryButton type="submit" disabled={busyId !== null}>{busyId ? "Guardando..." : "Guardar"}</PrimaryButton>
            <button type="button" onClick={() => { setEditingKey(null); setIsAdding(false); }} disabled={busyId !== null} className="min-h-12 rounded-full px-5 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05]">Cancelar</button>
          </div>
        </form>
      ) : null}

      <p role="status" aria-live="polite" className={`mt-4 min-h-5 text-sm ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
    </section>
  );
}

function FileLink({ label, url }: { label: string; url: string | null }) {
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="truncate text-sm text-emerald-400 hover:text-emerald-300">{label}</a>
    : <span className="text-sm text-zinc-600">Sin {label.toLocaleLowerCase()}</span>;
}

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return error instanceof Error ? error.message : fallback;
}
