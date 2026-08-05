"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import type { SongKeyRow, SongStemRow } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

type ManageSongStemsProps = {
  onChange: (stems: SongStemRow[]) => void;
  onClose: () => void;
  songId: string;
  songKey: SongKeyRow;
  stems: SongStemRow[];
};

export function ManageSongStems({ onChange, onClose, songId, songKey, stems }: ManageSongStemsProps) {
  const [editingStem, setEditingStem] = useState<SongStemRow | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const orderedStems = [...stems].sort((a, b) => a.sort_order - b.sort_order);

  async function requireSession() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return supabase;
  }

  async function uploadStemFile(supabase: Awaited<ReturnType<typeof requireSession>>, file: File) {
    validateAudioFile(file);
    const safeFilename = makeSafeFilename(file.name);
    const storagePath = `${songId}/keys/${songKey.id}/stems/${crypto.randomUUID()}-${safeFilename}`;
    const { error } = await supabase.storage.from("songs").upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw new Error(`No se pudo subir ${file.name}: ${error.message}`);
    return storagePath;
  }

  async function saveStem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const file = getFile(formData, "file");
    const currentStem = editingStem === "new" ? null : editingStem;
    if (!name) return;
    if (!currentStem && !file) {
      setIsError(true);
      setMessage("Selecciona un archivo de audio.");
      return;
    }
    if (orderedStems.some((stem) => stem.id !== currentStem?.id && stem.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setIsError(true);
      setMessage("Ya existe una pista con ese nombre para esta tonalidad.");
      return;
    }

    const operationId = currentStem?.id ?? crypto.randomUUID();
    let uploadedPath: string | null = null;
    setBusyId(operationId);
    setMessage("");
    try {
      const supabase = await requireSession();
      if (file) uploadedPath = await uploadStemFile(supabase, file);

      if (currentStem) {
        const payload = {
          name,
          ...(file && uploadedPath ? {
            storage_path: uploadedPath,
            mime_type: file.type || null,
            file_size_bytes: file.size,
          } : {}),
        };
        const { data, error } = await supabase
          .from("song_stems")
          .update(payload)
          .eq("id", currentStem.id)
          .eq("song_key_id", songKey.id)
          .select("id, song_key_id, name, storage_path, sort_order, mime_type, file_size_bytes, created_at")
          .single();
        if (error) throw error;

        const savedStem = data as SongStemRow;
        onChange(orderedStems.map((stem) => stem.id === savedStem.id ? savedStem : stem));
        setEditingStem(null);
        setIsError(false);
        setMessage("Pista actualizada.");

        if (uploadedPath && currentStem.storage_path !== uploadedPath) {
          const { error: cleanupError } = await supabase.storage.from("songs").remove([currentStem.storage_path]);
          if (cleanupError) {
            console.error("Unable to remove replaced stem file:", cleanupError);
            setIsError(true);
            setMessage("La pista se actualizó, pero no se pudo eliminar el archivo anterior.");
          }
        }
      } else {
        const { data, error } = await supabase
          .from("song_stems")
          .insert({
            song_key_id: songKey.id,
            name,
            storage_path: uploadedPath,
            sort_order: orderedStems.length,
            mime_type: file?.type || null,
            file_size_bytes: file?.size ?? null,
          })
          .select("id, song_key_id, name, storage_path, sort_order, mime_type, file_size_bytes, created_at")
          .single();
        if (error) throw error;

        onChange([...orderedStems, data as SongStemRow]);
        setEditingStem(null);
        setIsError(false);
        setMessage("Pista agregada.");
      }
      form.reset();
    } catch (error) {
      console.error("Unable to save song stem:", error);
      if (uploadedPath) {
        const supabase = createSupabaseBrowserClient();
        await supabase.storage.from("songs").remove([uploadedPath]);
      }
      setIsError(true);
      setMessage(readableStemError(error, "No se pudo guardar la pista."));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStem(stem: SongStemRow) {
    if (!window.confirm(`¿Eliminar la pista ${stem.name}?`)) return;
    setBusyId(stem.id);
    setMessage("");
    try {
      const supabase = await requireSession();
      const { error } = await supabase
        .from("song_stems")
        .delete()
        .eq("id", stem.id)
        .eq("song_key_id", songKey.id);
      if (error) throw error;

      const remaining = orderedStems
        .filter((item) => item.id !== stem.id)
        .map((item, index) => ({ ...item, sort_order: index }));
      onChange(remaining);

      const [{ error: storageError }, ...orderResults] = await Promise.all([
        supabase.storage.from("songs").remove([stem.storage_path]),
        ...remaining.map((item) => supabase
          .from("song_stems")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
          .eq("song_key_id", songKey.id)),
      ]);
      const orderError = orderResults.find((result) => result.error)?.error;
      if (storageError || orderError) {
        console.error("Stem cleanup after deletion failed:", { storageError, orderError });
        setIsError(true);
        setMessage("La pista se eliminó, pero falló la limpieza del archivo o del orden.");
      } else {
        setIsError(false);
        setMessage("Pista eliminada.");
      }
    } catch (error) {
      console.error("Unable to delete song stem:", error);
      setIsError(true);
      setMessage(readableStemError(error, "No se pudo eliminar la pista."));
    } finally {
      setBusyId(null);
    }
  }

  async function moveStem(stemId: string, direction: -1 | 1) {
    const currentIndex = orderedStems.findIndex((stem) => stem.id === stemId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedStems.length) return;
    const next = [...orderedStems];
    [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
    const reordered = next.map((stem, index) => ({ ...stem, sort_order: index }));

    setBusyId(stemId);
    setMessage("");
    try {
      const supabase = await requireSession();
      const results = await Promise.all(reordered.map((stem) => supabase
        .from("song_stems")
        .update({ sort_order: stem.sort_order })
        .eq("id", stem.id)
        .eq("song_key_id", songKey.id)));
      const error = results.find((result) => result.error)?.error;
      if (error) throw error;
      onChange(reordered);
      setIsError(false);
      setMessage("Orden guardado.");
    } catch (error) {
      console.error("Unable to reorder song stems:", error);
      setIsError(true);
      setMessage(readableStemError(error, "No se pudo guardar el orden."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm sm:py-10" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="manage-stems-title" className="mx-auto w-full max-w-2xl rounded-3xl border border-white/10 bg-zinc-900 p-5 shadow-2xl shadow-black/60 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Multitrack</p>
            <h2 id="manage-stems-title" className="mt-1 text-2xl font-bold text-white">Multitrack · {songKey.key_name}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={busyId !== null} aria-label="Cerrar administración de pistas" className="grid size-11 shrink-0 place-items-center rounded-full text-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-40">×</button>
        </div>

        {orderedStems.length > 0 ? (
          <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {orderedStems.map((stem, index) => (
              <div key={stem.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] sm:items-center">
                <p className="truncate font-semibold text-white">{stem.name}</p>
                <a href={getStemPublicUrl(stem.storage_path)} target="_blank" rel="noreferrer" className="truncate text-sm text-zinc-500 hover:text-emerald-300">{getFilename(stem.storage_path)}</a>
                <div className="flex items-center justify-end gap-1">
                  <button type="button" onClick={() => void moveStem(stem.id, -1)} disabled={busyId !== null || index === 0} aria-label={`Mover ${stem.name} hacia arriba`} className="grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-25">↑</button>
                  <button type="button" onClick={() => void moveStem(stem.id, 1)} disabled={busyId !== null || index === orderedStems.length - 1} aria-label={`Mover ${stem.name} hacia abajo`} className="grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-white/[0.05] hover:text-white disabled:opacity-25">↓</button>
                  <button type="button" onClick={() => { setEditingStem(stem); setMessage(""); }} disabled={busyId !== null} className="min-h-10 rounded-full px-2 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white disabled:opacity-40">Editar</button>
                  <button type="button" onClick={() => void deleteStem(stem)} disabled={busyId !== null} className="min-h-10 rounded-full px-2 text-sm text-rose-400 hover:bg-rose-400/[0.08] disabled:opacity-40">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="mt-6 text-sm text-zinc-500">Esta tonalidad todavía no tiene pistas.</p>}

        {editingStem ? (
          <form key={editingStem === "new" ? "new" : editingStem.id} onSubmit={saveStem} className="mt-6 space-y-4 border-t border-white/[0.07] pt-6">
            <label className="block text-sm font-semibold text-zinc-300">Nombre<input autoFocus required name="name" defaultValue={editingStem === "new" ? "" : editingStem.name} className={`mt-2 ${fieldStyles}`} /></label>
            <label className="block text-sm font-semibold text-zinc-300">Archivo de audio {editingStem !== "new" ? <span className="font-normal text-zinc-500">(opcional para reemplazar)</span> : null}<input required={editingStem === "new"} name="file" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,audio/*,.mp3,.m4a,.wav,.aac" className={`mt-2 ${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400`} /></label>
            <div className="flex gap-3">
              <PrimaryButton type="submit" disabled={busyId !== null}>{busyId ? "Guardando..." : "Guardar pista"}</PrimaryButton>
              <button type="button" onClick={() => setEditingStem(null)} disabled={busyId !== null} className="min-h-12 rounded-full px-5 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-40">Cancelar</button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => { setEditingStem("new"); setMessage(""); }} disabled={busyId !== null} className="mt-6 min-h-12 rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-40">+ Agregar pista</button>
        )}

        <p role="status" aria-live="polite" className={`mt-4 min-h-5 text-sm ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </section>
    </div>
  );
}

function validateAudioFile(file: File) {
  const acceptedExtension = /\.(mp3|m4a|mp4|wav|aac)$/i.test(file.name);
  if (!file.type.startsWith("audio/") && !acceptedExtension) throw new Error("Selecciona un archivo de audio válido.");
}

function makeSafeFilename(filename: string) {
  const normalized = filename.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "audio";
}

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function getFilename(storagePath: string) {
  return storagePath.split("/").pop() ?? storagePath;
}

function getStemPublicUrl(storagePath: string) {
  return createSupabaseBrowserClient().storage.from("songs").getPublicUrl(storagePath).data.publicUrl;
}

function readableStemError(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    if ("code" in error && error.code === "23505") return "Ya existe una pista con ese nombre para esta tonalidad.";
    if ("message" in error && typeof error.message === "string") return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}
