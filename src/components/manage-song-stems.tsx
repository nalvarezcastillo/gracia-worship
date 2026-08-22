"use client";

import { useRef, useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import type { SongKeyRow, SongStemRow } from "@/lib/database.types";
import { isPreferredStemName, normalizeStemIdentity, preferredStemName, PREFERRED_STEM_NAMES } from "@/lib/stem-naming";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

type ManageSongStemsProps = {
  onChange: (stems: SongStemRow[]) => void;
  onClose: () => void;
  songId: string;
  songKey: SongKeyRow;
  stems: SongStemRow[];
};

type BulkStemStatus = "waiting" | "uploading" | "completed" | "failed" | "invalid";

type BulkStemItem = {
  id: string;
  file: File;
  name: string;
  status: BulkStemStatus;
  error: string;
  sortOrder: number | null;
  savedStem: SongStemRow | null;
};

export function ManageSongStems({ onChange, onClose, songId, songKey, stems }: ManageSongStemsProps) {
  const [editingStem, setEditingStem] = useState<SongStemRow | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkStemItem[] | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);
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
    const name = preferredStemName(String(formData.get("name") ?? ""));
    const file = getFile(formData, "file");
    const currentStem = editingStem === "new" ? null : editingStem;
    if (!name) return;
    if (!currentStem && !file) {
      setIsError(true);
      setMessage("Selecciona un archivo de audio.");
      return;
    }
    if (orderedStems.some((stem) => stem.id !== currentStem?.id && normalizeStemIdentity(stem.name) === normalizeStemIdentity(name))) {
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

  function addBulkFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).map(createBulkStemItem);
    setBulkItems((current) => [...(current ?? []), ...selected]);
    if (bulkInputRef.current) bulkInputRef.current.value = "";
  }

  function updateBulkItem(itemId: string, patch: Partial<BulkStemItem>) {
    setBulkItems((current) => current?.map((item) => item.id === itemId ? { ...item, ...patch } : item) ?? null);
  }

  function removeBulkItem(itemId: string) {
    setBulkItems((current) => {
      const next = current?.filter((item) => item.id !== itemId) ?? [];
      return next.length > 0 ? next : null;
    });
  }

  async function runBulkUpload(retryFailed = false) {
    if (!bulkItems || bulkRunning) return;
    const nameErrors = getBulkNameErrors(bulkItems, orderedStems);
    if (nameErrors.size > 0) return;

    const targetIds = new Set(bulkItems
      .filter((item) => retryFailed ? item.status === "failed" : item.status === "waiting")
      .map((item) => item.id));
    if (targetIds.size === 0) return;

    const nextSortOrder = Math.max(-1, ...orderedStems.map((stem) => stem.sort_order)) + 1;
    let assignedCount = 0;
    const queue: BulkStemItem[] = bulkItems
      .filter((item) => targetIds.has(item.id))
      .map((item) => ({
        ...item,
        error: "",
        sortOrder: item.sortOrder ?? nextSortOrder + assignedCount++,
        status: "waiting",
      }));
    const queueById = new Map(queue.map((item) => [item.id, item]));
    setBulkRunning(true);
    setBulkItems((current) => current?.map((item) => queueById.get(item.id) ?? item) ?? null);

    let cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        updateBulkItem(item.id, { status: "uploading", error: "" });
        let uploadedPath: string | null = null;
        try {
          const supabase = await requireSession();
          validateAudioFile(item.file);
          uploadedPath = await uploadStemFile(supabase, item.file);
          const { data, error } = await supabase
            .from("song_stems")
            .insert({
              song_key_id: songKey.id,
              name: preferredStemName(item.name),
              storage_path: uploadedPath,
              sort_order: item.sortOrder,
              mime_type: item.file.type || null,
              file_size_bytes: item.file.size,
            })
            .select("id, song_key_id, name, storage_path, sort_order, mime_type, file_size_bytes, created_at")
            .single();
          if (error) throw error;
          const savedStem = data as SongStemRow;
          item.savedStem = savedStem;
          item.status = "completed";
          updateBulkItem(item.id, { savedStem, status: "completed" });
        } catch (error) {
          let errorMessage = readableStemError(error, "No se pudo subir la pista.");
          if (uploadedPath) {
            const supabase = createSupabaseBrowserClient();
            const { error: cleanupError } = await supabase.storage.from("songs").remove([uploadedPath]);
            if (cleanupError) errorMessage = "No se pudo completar la pista y el archivo puede requerir limpieza manual.";
          }
          item.status = "failed";
          item.error = errorMessage;
          updateBulkItem(item.id, { status: "failed", error: errorMessage });
        }
      }
    }

    await Promise.all([worker(), worker()]);
    const results = new Map(queue.map((item) => [item.id, item]));
    const finalItems = bulkItems.map((item) => results.get(item.id) ?? item);
    const completed = finalItems.flatMap((item) => item.savedStem ? [item.savedStem] : []);
    setBulkItems(finalItems);
    onChange(mergeStems(orderedStems, completed));
    setBulkRunning(false);
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
            <label className="block text-sm font-semibold text-zinc-300">Nombre<input autoFocus required name="name" list="preferred-stem-names" defaultValue={editingStem === "new" ? "" : editingStem.name} onBlur={(event) => { event.currentTarget.value = preferredStemName(event.currentTarget.value); }} className={`mt-2 ${fieldStyles}`} /></label>
            <p className="text-xs text-zinc-500">Usa nombres consistentes para reutilizar presets de routing. También puedes escribir un nombre personalizado.</p>
            <label className="block text-sm font-semibold text-zinc-300">Archivo de audio {editingStem !== "new" ? <span className="font-normal text-zinc-500">(opcional para reemplazar)</span> : null}<input required={editingStem === "new"} name="file" type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,audio/*,.mp3,.m4a,.wav,.aac" className={`mt-2 ${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400`} /></label>
            <div className="flex gap-3">
              <PrimaryButton type="submit" disabled={busyId !== null}>{busyId ? "Guardando..." : "Guardar pista"}</PrimaryButton>
              <button type="button" onClick={() => setEditingStem(null)} disabled={busyId !== null} className="min-h-12 rounded-full px-5 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-40">Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => { setEditingStem("new"); setMessage(""); }} disabled={busyId !== null} className="min-h-12 rounded-full bg-emerald-400 px-6 font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-40">+ Agregar pista</button>
            <button type="button" onClick={() => bulkInputRef.current?.click()} disabled={busyId !== null} className="min-h-12 rounded-full border border-white/10 px-6 font-semibold text-emerald-400 hover:bg-white/[0.05] disabled:opacity-40">+ Subir varias pistas</button>
            <input ref={bulkInputRef} type="file" multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,audio/*,.mp3,.m4a,.wav,.aac" onChange={(event) => addBulkFiles(event.target.files)} className="sr-only" tabIndex={-1} />
          </div>
        )}

        <p role="status" aria-live="polite" className={`mt-4 min-h-5 text-sm ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </section>

      {bulkItems ? (
        <BulkUploadDialog
          existingStems={orderedStems}
          items={bulkItems}
          running={bulkRunning}
          onAddFiles={() => bulkInputRef.current?.click()}
          onClose={() => setBulkItems(null)}
          onRemove={removeBulkItem}
          onRetry={() => void runBulkUpload(true)}
          onStart={() => void runBulkUpload(false)}
          onUpdateName={(itemId, name) => updateBulkItem(itemId, { name })}
        />
      ) : null}
      <StemNameSuggestions />
    </div>
  );
}

function BulkUploadDialog({ existingStems, items, onAddFiles, onClose, onRemove, onRetry, onStart, onUpdateName, running }: {
  existingStems: SongStemRow[];
  items: BulkStemItem[];
  onAddFiles: () => void;
  onClose: () => void;
  onRemove: (itemId: string) => void;
  onRetry: () => void;
  onStart: () => void;
  onUpdateName: (itemId: string, name: string) => void;
  running: boolean;
}) {
  const nameErrors = getBulkNameErrors(items, existingStems);
  const waitingCount = items.filter((item) => item.status === "waiting").length;
  const completedCount = items.filter((item) => item.status === "completed").length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const uploadingCount = items.filter((item) => item.status === "uploading").length;
  const invalidCount = items.filter((item) => item.status === "invalid").length;
  const finished = !running && waitingCount === 0 && uploadingCount === 0;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-black/80 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-8" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-stems-title" className="mx-auto w-full max-w-3xl rounded-3xl border border-white/10 bg-zinc-900 p-4 shadow-2xl shadow-black/60 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Multitracks</p>
            <h2 id="bulk-stems-title" className="mt-1 text-2xl font-bold text-white">Revisar carga masiva</h2>
            <p className="mt-2 text-sm text-zinc-400">{items.length} {items.length === 1 ? "archivo seleccionado" : "archivos seleccionados"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={running} aria-label="Cerrar carga masiva" className="grid size-11 shrink-0 place-items-center rounded-full text-xl text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-30">×</button>
        </div>

        <div className="mt-5 space-y-3">
          {items.map((item) => {
            const nameError = nameErrors.get(item.id);
            return (
              <div key={item.id} className="rounded-2xl border border-white/[0.08] bg-zinc-950/45 p-4 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-4">
                <div className="min-w-0">
                  <label className="block text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                    Nombre
                    <input value={item.name} list="preferred-stem-names" onChange={(event) => onUpdateName(item.id, event.target.value)} onBlur={(event) => onUpdateName(item.id, preferredStemName(event.currentTarget.value))} disabled={running || item.status === "completed"} aria-invalid={Boolean(nameError)} className={`mt-2 ${fieldStyles} ${nameError ? "border-rose-400/60" : ""}`} />
                  </label>
                  {nameError ? <p className="mt-1.5 text-sm text-rose-400">{nameError}</p> : null}
                  {!nameError && item.name.trim() && !isPreferredStemName(item.name) ? <p className="mt-1.5 text-xs text-zinc-500">Nombre personalizado · usa nombres consistentes para reutilizar presets de routing.</p> : null}
                  <p className="mt-3 truncate text-sm text-zinc-300" title={item.file.name}>{item.file.name}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatFileSize(item.file.size)}</p>
                  {item.error ? <p className="mt-2 text-sm text-rose-400">{item.error}</p> : null}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 sm:mt-7 sm:justify-end">
                  <span className={`text-sm font-semibold ${bulkStatusColor(item.status)}`}>{bulkStatusLabel(item.status)}</span>
                  <button type="button" onClick={() => onRemove(item.id)} disabled={running || item.status === "completed"} className="min-h-10 rounded-full px-3 text-sm text-rose-400 hover:bg-rose-400/[0.08] disabled:opacity-30">Eliminar</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.07] bg-zinc-950/35 p-4" aria-live="polite">
          {running ? <p className="font-semibold text-white">Subiendo {completedCount + failedCount} de {items.length} · {uploadingCount} en curso</p> : null}
          {finished && completedCount > 0 ? <p className="font-semibold text-white">{completedCount === items.length ? `${completedCount} pistas subidas correctamente` : `${completedCount} de ${items.length} pistas subidas`}</p> : null}
          {invalidCount > 0 ? <p className="mt-1 text-sm text-amber-300">{invalidCount} {invalidCount === 1 ? "archivo no compatible" : "archivos no compatibles"}; elimínalos o agrega archivos correctos.</p> : null}
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {!finished ? <PrimaryButton type="button" onClick={onStart} disabled={running || waitingCount === 0 || nameErrors.size > 0}>Subir {waitingCount} {waitingCount === 1 ? "pista" : "pistas"}</PrimaryButton> : null}
          {failedCount > 0 && !running ? <PrimaryButton type="button" onClick={onRetry} disabled={nameErrors.size > 0}>Reintentar fallidos</PrimaryButton> : null}
          {!running && completedCount === 0 ? <button type="button" onClick={onAddFiles} className="min-h-12 rounded-full border border-white/10 px-5 font-semibold text-emerald-400 hover:bg-white/[0.05]">Agregar archivos</button> : null}
          {!running ? <button type="button" onClick={onClose} className="min-h-12 rounded-full px-5 font-semibold text-zinc-400 hover:bg-white/[0.05]">{finished && completedCount > 0 ? "Listo" : "Cancelar"}</button> : null}
        </div>
      </section>
    </div>
  );
}

function createBulkStemItem(file: File): BulkStemItem {
  let status: BulkStemStatus = "waiting";
  let error = "";
  try {
    validateAudioFile(file);
  } catch {
    status = "invalid";
    error = "Archivo no compatible";
  }
  return {
    id: crypto.randomUUID(),
    file,
    name: preferredStemName(deriveStemName(file.name)),
    status,
    error,
    sortOrder: null,
    savedStem: null,
  };
}

function deriveStemName(filename: string) {
  const withoutExtension = filename.replace(/\.[^.]+$/, "");
  const withoutNumber = withoutExtension.replace(/^\s*\d+\s*(?:[-_.]+\s*|\s+)/, "");
  return withoutNumber
    .replace(/[_]+/g, " ")
    .replace(/\s+-\s+|\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBulkNameErrors(items: BulkStemItem[], existingStems: SongStemRow[]) {
  const errors = new Map<string, string>();
  const existingNames = new Set(existingStems.map((stem) => normalizeStemIdentity(stem.name)));
  const occurrences = new Map<string, number>();
  for (const item of items) {
    const normalized = normalizeStemIdentity(item.name);
    if (normalized) occurrences.set(normalized, (occurrences.get(normalized) ?? 0) + 1);
  }
  for (const item of items) {
    const normalized = normalizeStemIdentity(item.name);
    if (!normalized) errors.set(item.id, "El nombre es obligatorio.");
    else if (existingNames.has(normalized) && !item.savedStem) errors.set(item.id, "Ya existe una pista con ese nombre para esta tonalidad.");
    else if ((occurrences.get(normalized) ?? 0) > 1) errors.set(item.id, "El nombre está repetido dentro de esta selección.");
  }
  return errors;
}

function StemNameSuggestions() {
  return <datalist id="preferred-stem-names">{PREFERRED_STEM_NAMES.map((name) => <option key={name} value={name} />)}</datalist>;
}

function mergeStems(existingStems: SongStemRow[], completedStems: SongStemRow[]) {
  const byId = new Map(existingStems.map((stem) => [stem.id, stem]));
  for (const stem of completedStems) byId.set(stem.id, stem);
  return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${units[unitIndex]}`;
}

function bulkStatusLabel(status: BulkStemStatus) {
  if (status === "uploading") return "↑ Subiendo";
  if (status === "completed") return "✓ Completada";
  if (status === "failed") return "✕ Falló";
  if (status === "invalid") return "✕ No compatible";
  return "○ En espera";
}

function bulkStatusColor(status: BulkStemStatus) {
  if (status === "completed") return "text-emerald-400";
  if (status === "failed" || status === "invalid") return "text-rose-400";
  if (status === "uploading") return "text-amber-300";
  return "text-zinc-500";
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
