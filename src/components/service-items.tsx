"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrepareNextServiceButton } from "@/components/prepare-next-service-button";
import { AssignmentFields } from "@/components/assignment-fields";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { SongMetadataLine } from "@/components/ui/song-tags";
import { formatDuration, formatDurationInput, getSongDurationSeconds, hasSongDurationOverride, parsePlannedDurationInput } from "@/lib/duration";
import type { ServiceItem, ServiceSong, WorshipSongEntry } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeamMember } from "@/lib/team";

type AddStep = "closed" | "type" | "text";

export function ServiceItems({ initialItems, songs, isAdmin, loadError, serviceId, serviceName, serviceSchedule, showPreparedToast = false, teamMembers = [] }: { initialItems: ServiceItem[]; songs: ServiceSong[]; isAdmin: boolean; loadError?: string; serviceId: number; serviceName: string; serviceSchedule: string; showPreparedToast?: boolean; teamMembers?: TeamMember[] }) {
  const [items, setItems] = useState(initialItems);
  const savedItemsRef = useRef(initialItems);
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [textTitle, setTextTitle] = useState("");
  const [textDetails, setTextDetails] = useState("");
  const [textPlannedDuration, setTextPlannedDuration] = useState("");
  const [editingText, setEditingText] = useState<{ id: string; title: string; details: string; plannedDuration: string } | null>(null);
  const [editingWorship, setEditingWorship] = useState<{ id: string; title: string; plannedDuration: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSong, setDraggedSong] = useState<{ blockId: string; songId: string } | null>(null);
  const [songSelectorBlockId, setSongSelectorBlockId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [songNotes, setSongNotes] = useState("");
  const [songPlannedDuration, setSongPlannedDuration] = useState("");
  const [editingSong, setEditingSong] = useState<{ blockId: string; songId: string; notes: string; plannedDuration: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<ServiceItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(loadError ? `Unable to load service: ${loadError}` : "");
  const [isError, setIsError] = useState(Boolean(loadError));
  const [showSuccessToast, setShowSuccessToast] = useState(showPreparedToast);
  const hasUnsavedChanges = serializeService(items) !== serializeService(savedItemsRef.current);

  useEffect(() => {
    if (!showSuccessToast) return;
    const timeout = window.setTimeout(() => setShowSuccessToast(false), 4000);
    return () => window.clearTimeout(timeout);
  }, [showSuccessToast]);

  async function requireSession() {
    if (!isAdmin) throw new Error("You must be signed in to edit the service.");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("You must be signed in to edit the service.");
    return supabase;
  }

  async function addItem(type: ServiceItem["type"], title: string, details?: string, plannedDuration?: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;
    if (!isValidPlannedDuration(plannedDuration ?? "")) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }

    setIsSaving(true);
    setIsError(false);
    setMessage("Adding item...");

    try {
      const supabase = await requireSession();
      const { data, error } = await supabase
        .from("service_items")
        .insert({
          service_id: serviceId,
          position: items.length + 1,
          type,
          title: nextTitle,
          details: type === "text" ? details?.trim() || null : null,
          planned_duration_seconds: parsePlannedDurationInput(plannedDuration ?? ""),
          song_ids: type === "worship" ? [] : null,
        })
        .select("id, position, type, title, details, planned_duration_seconds, song_ids, created_at")
        .single();

      if (error) throw error;
      savedItemsRef.current = [...savedItemsRef.current, data as ServiceItem];
      setItems((current) => [...current, data as ServiceItem]);
      setAddStep("closed");
      setTextTitle("");
      setTextDetails("");
      setTextPlannedDuration("");
      setMessage("Item added successfully.");
    } catch (error) {
      console.error("Unable to add service item:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to add item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateTextItem() {
    if (!editingText?.title.trim()) return;
    if (!isValidPlannedDuration(editingText.plannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsSaving(true);
    setIsError(false);
    setMessage("Saving text item...");

    try {
      const supabase = await requireSession();
      const title = editingText.title.trim();
      const details = editingText.details.trim() || null;
      const plannedDuration = parsePlannedDurationInput(editingText.plannedDuration);
      const { error } = await supabase
        .from("service_items")
        .update({ title, details, planned_duration_seconds: plannedDuration })
        .eq("id", editingText.id);

      if (error) throw error;
      savedItemsRef.current = savedItemsRef.current.map((item) => item.id === editingText.id ? { ...item, title, details, planned_duration_seconds: plannedDuration } : item);
      setItems((current) => current.map((item) => item.id === editingText.id ? { ...item, title, details, planned_duration_seconds: plannedDuration } : item));
      setEditingText(null);
      setMessage("Text item updated successfully.");
    } catch (error) {
      console.error("Unable to update text item:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to update text item.");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateWorshipBlock() {
    if (!editingWorship?.title.trim()) return;
    if (!isValidPlannedDuration(editingWorship.plannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsSaving(true);
    setIsError(false);
    setMessage("Saving worship block...");

    try {
      const supabase = await requireSession();
      const title = editingWorship.title.trim();
      const plannedDuration = parsePlannedDurationInput(editingWorship.plannedDuration);
      const { error } = await supabase
        .from("service_items")
        .update({ title, planned_duration_seconds: plannedDuration })
        .eq("id", editingWorship.id)
        .eq("type", "worship");

      if (error) throw error;
      savedItemsRef.current = savedItemsRef.current.map((item) => item.id === editingWorship.id ? { ...item, title, planned_duration_seconds: plannedDuration } : item);
      setItems((current) => current.map((item) => item.id === editingWorship.id ? { ...item, title, planned_duration_seconds: plannedDuration } : item));
      setEditingWorship(null);
      setMessage("Worship block updated successfully.");
    } catch (error) {
      console.error("Unable to update worship block:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to update worship block.");
    } finally {
      setIsSaving(false);
    }
  }

  function reorderItems(targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    setItems((current) => {
      const next = [...current];
      const fromIndex = next.findIndex((item) => item.id === draggedId);
      const targetIndex = next.findIndex((item) => item.id === targetId);
      if (fromIndex === -1 || targetIndex === -1) return current;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next.map((item, index) => ({ ...item, position: index + 1 }));
    });
    setDraggedId(null);
    setMessage("");
  }

  function addSongToBlock() {
    if (!songSelectorBlockId || !selectedSongId) return;
    if (!isValidPlannedDuration(songPlannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsError(false);
    setItems((current) => current.map((item) => {
      if (item.id !== songSelectorBlockId) return item;
      const songEntries = item.song_ids ?? [];
      return songEntries.some((entry) => entry.songId === selectedSongId)
        ? item
        : { ...item, song_ids: [...songEntries, { songId: selectedSongId, notes: songNotes.trim(), plannedDurationSeconds: parsePlannedDurationInput(songPlannedDuration) }] };
    }));
    setSongSelectorBlockId(null);
    setSelectedSongId("");
    setSongNotes("");
    setSongPlannedDuration("");
    setMessage("");
  }

  function removeSongFromBlock(blockId: string, songId: string) {
    setItems((current) => current.map((item) => item.id === blockId
      ? { ...item, song_ids: (item.song_ids ?? []).filter((entry) => entry.songId !== songId) }
      : item));
    setMessage("");
  }

  function reorderBlockSongs(blockId: string, targetSongId: string) {
    if (!draggedSong || draggedSong.blockId !== blockId || draggedSong.songId === targetSongId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== blockId) return item;
      const next = [...(item.song_ids ?? [])];
      const fromIndex = next.findIndex((entry) => entry.songId === draggedSong.songId);
      const targetIndex = next.findIndex((entry) => entry.songId === targetSongId);
      if (fromIndex === -1 || targetIndex === -1) return item;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...item, song_ids: next };
    }));
    setDraggedSong(null);
    setMessage("");
  }

  function saveSongNotes() {
    if (!editingSong) return;
    if (!isValidPlannedDuration(editingSong.plannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsError(false);
    setItems((current) => current.map((item) => item.id === editingSong.blockId
      ? {
          ...item,
          song_ids: (item.song_ids ?? []).map((entry) => entry.songId === editingSong.songId
            ? { ...entry, notes: editingSong.notes.trim(), plannedDurationSeconds: parsePlannedDurationInput(editingSong.plannedDuration) }
            : entry),
        }
      : item));
    setEditingSong(null);
    setMessage("");
  }

  async function saveOrder() {
    setIsSaving(true);
    setIsError(false);
    setMessage("Saving service...");

    try {
      const supabase = await requireSession();
      const results = await Promise.all(
        items.map((item, index) => supabase
          .from("service_items")
          .update({ position: index + 1, song_ids: item.song_ids })
          .eq("id", item.id)),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
      setItems((current) => {
        const savedItems = current.map((item, index) => ({ ...item, position: index + 1 }));
        savedItemsRef.current = savedItems;
        return savedItems;
      });
      setMessage("Service saved successfully.");
    } catch (error) {
      console.error("Unable to save service:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to save service.");
    } finally {
      setIsSaving(false);
    }
  }

  function logSupabaseError(operation: string, error: unknown) {
    const databaseError = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error(`Service item ${operation} failed:`, {
      code: databaseError.code ?? null,
      message: databaseError.message ?? (error instanceof Error ? error.message : String(error)),
      details: databaseError.details ?? null,
      hint: databaseError.hint ?? null,
      status: databaseError.status ?? null,
    });
  }

  function formatSupabaseError(error: unknown) {
    if (!error || typeof error !== "object") return error instanceof Error ? error.message : String(error);
    const databaseError = error as Record<string, unknown>;
    return [
      databaseError.message,
      databaseError.code ? `Code: ${databaseError.code}` : null,
      databaseError.details ? `Details: ${databaseError.details}` : null,
      databaseError.hint ? `Hint: ${databaseError.hint}` : null,
      databaseError.status ? `Status: ${databaseError.status}` : null,
    ].filter(Boolean).join(" · ") || "Unable to delete service item.";
  }

  async function deleteItem() {
    if (!deletingItem) return;

    const itemToDelete = deletingItem;
    const previousItems = items;
    const previousSavedItems = savedItemsRef.current;
    const remainingItems = items
      .filter((item) => item.id !== itemToDelete.id)
      .map((item, index) => ({ ...item, position: index + 1 }));
    const remainingSavedItems = savedItemsRef.current
      .filter((item) => item.id !== itemToDelete.id)
      .map((item, index) => ({ ...item, position: index + 1 }));

    setDeletingItem(null);
    setItems(remainingItems);
    setIsSaving(true);
    setIsError(false);
    setMessage("Deleting service item...");

    try {
      const supabase = await requireSession();
      const { data, error } = await supabase
        .from("service_items")
        .delete()
        .eq("id", itemToDelete.id)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Supabase did not delete the service item.");

      savedItemsRef.current = remainingSavedItems;
      const positionResults = await Promise.all(
        remainingItems.map((item, index) => supabase
          .from("service_items")
          .update({ position: index + 1 })
          .eq("id", item.id)),
      );
      const failedPositionUpdate = positionResults.find((result) => result.error);
      if (failedPositionUpdate?.error) throw failedPositionUpdate.error;

      setMessage("Service item deleted successfully.");
    } catch (error) {
      logSupabaseError("delete", error);
      const rowWasDeleted = savedItemsRef.current === remainingSavedItems;
      if (!rowWasDeleted) {
        savedItemsRef.current = previousSavedItems;
        setItems(previousItems);
      }
      setIsError(true);
      setMessage(formatSupabaseError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-white/[0.08] pb-6">
        <h1 className="col-start-1 row-start-1 min-w-0 text-[1.75rem] font-bold tracking-[-0.035em] text-white sm:text-[2rem]">{serviceName}</h1>
        {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving} className="col-start-2 row-start-1 min-h-11 rounded-xl px-4 text-sm shadow-none">+ Agregar elemento</PrimaryButton> : null}
        {serviceSchedule ? <p className="col-start-1 row-start-2 min-w-0 text-sm text-zinc-400 sm:text-base">{serviceSchedule}</p> : <span />}
        <p className="col-start-2 row-start-2 text-right text-sm text-zinc-500">{items.length} {items.length === 1 ? "elemento" : "elementos"}</p>
        {isAdmin ? <div className="col-span-2 row-start-3 mt-2 flex flex-col gap-2 sm:flex-row sm:justify-end"><SecondaryButton href={`/admin?service=${serviceId}`} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Editar fecha</SecondaryButton><PrepareNextServiceButton /><SecondaryButton href="/archive" className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Archivo</SecondaryButton></div> : null}
      </header>

      {showSuccessToast ? <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Próximo servicio preparado correctamente.</div> : null}

      {items.length ? (
        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          {items.map((item) => (
            <article
              key={item.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDraggedId(item.id) : undefined}
              onDragEnd={isAdmin ? () => setDraggedId(null) : undefined}
              onDragOver={isAdmin ? (event) => event.preventDefault() : undefined}
              onDrop={isAdmin ? () => reorderItems(item.id) : undefined}
              className={`group px-1 py-3 transition-colors duration-200 sm:px-2 sm:py-4 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${draggedId === item.id ? "bg-emerald-400/[0.055]" : "hover:bg-white/[0.018]"}`}
            >
              <div className="flex items-start gap-2.5">
                <div className="min-w-0 flex-1">
                  <h3 className={item.type === "worship" ? "text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80" : "text-base font-semibold leading-6 text-zinc-100"}>{item.title}</h3>
                  {item.type === "text" && item.details ? <p className="mt-1 whitespace-pre-wrap text-sm font-normal leading-5 text-zinc-500">{item.details}</p> : null}
                  {item.planned_duration_seconds ? <p className="mt-1 text-xs text-zinc-500">{formatDuration(item.planned_duration_seconds)}</p> : null}
                </div>
                {isAdmin ? (
                  <details className="relative shrink-0">
                    <summary aria-label={`Acciones para ${item.title}`} className="grid size-11 cursor-pointer list-none place-items-center rounded-xl text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">⋮</summary>
                    <div className="absolute right-0 z-20 mt-1 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40">
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); if (item.type === "text") setEditingText({ id: item.id, title: item.title, details: item.details ?? "", plannedDuration: formatDurationInput(item.planned_duration_seconds) }); else setEditingWorship({ id: item.id, title: item.title, plannedDuration: formatDurationInput(item.planned_duration_seconds) }); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Editar</button>
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDeletingItem(item); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.08] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Eliminar</button>
                    </div>
                  </details>
                ) : null}
                {isAdmin ? <GripIcon label={`Drag ${item.title} to reorder`} className="mt-3 size-3.5 shrink-0 text-zinc-600" /> : null}
              </div>

              {item.type === "worship" && (item.song_ids ?? []).length > 0 ? (
                <ul className="mt-2 divide-y divide-white/[0.06] border-t border-white/[0.06]">
                  {(item.song_ids ?? []).map((entry) => {
                    const song = songs.find((candidate) => candidate.id === entry.songId);
                    if (!song) return null;
                    return (
                      <li
                        key={entry.songId}
                        draggable={isAdmin}
                        onDragStart={isAdmin ? (event) => { event.stopPropagation(); setDraggedSong({ blockId: item.id, songId: entry.songId }); } : undefined}
                        onDragEnd={isAdmin ? (event) => { event.stopPropagation(); setDraggedSong(null); } : undefined}
                        onDragOver={isAdmin ? (event) => { event.stopPropagation(); event.preventDefault(); } : undefined}
                        onDrop={isAdmin ? (event) => { event.stopPropagation(); reorderBlockSongs(item.id, entry.songId); } : undefined}
                        className={`grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 rounded-xl px-2 py-3 transition-colors duration-200 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:rounded-none md:px-0 md:py-2 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${draggedSong?.songId === entry.songId ? "bg-emerald-400/[0.04] text-emerald-300" : ""}`}
                      >
                        <div className="min-w-0 md:col-start-1 md:row-start-1">
                          <Link href={`/song/${song.id}`} onClick={(event) => event.stopPropagation()} className="line-clamp-2 text-base font-semibold leading-6 text-white transition-colors duration-200 hover:text-emerald-300 md:line-clamp-1 md:text-zinc-200">{song.title}</Link>
                          <SongMetadataLine songKey={song.key} bpm={song.bpm} timeSignature={song.time_signature} className="mt-1 text-[0.8125rem] font-normal" />
                          {entry.notes ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-zinc-500 sm:text-[0.8125rem]">{entry.notes}</p> : null}
                          <SongDurationLine entry={entry} libraryDuration={song.duration} />
                        </div>
                        <div className="col-span-2 row-start-2 mt-2 flex min-w-0 items-center justify-end gap-1 border-t border-white/[0.05] pt-2 md:col-span-1 md:col-start-2 md:row-start-1 md:mt-0 md:border-t-0 md:pt-0">
                          <div className="mr-auto md:mr-0"><ResourceIndicators song={song} /></div>
                          {isAdmin ? <button type="button" aria-label={`Editar notas y duración de ${song.title}`} onClick={(event) => { event.stopPropagation(); setEditingSong({ blockId: item.id, songId: entry.songId, notes: entry.notes, plannedDuration: formatDurationInput(entry.plannedDurationSeconds) }); }} className="min-h-11 shrink-0 rounded-full px-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">Cambiar duración</button> : null}
                          {isAdmin ? <details className="relative shrink-0 md:hidden"><summary aria-label={`Más acciones para ${song.title}`} onClick={(event) => event.stopPropagation()} className="grid size-11 cursor-pointer list-none place-items-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">⋯</summary><div className="absolute bottom-full right-0 z-20 mb-1 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40"><button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); removeSongFromBlock(item.id, entry.songId); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.08] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Eliminar canción</button></div></details> : null}
                          {isAdmin ? <button type="button" aria-label={`Quitar canción ${song.title}`} onClick={(event) => { event.stopPropagation(); removeSongFromBlock(item.id, entry.songId); }} className="hidden size-11 shrink-0 place-items-center rounded-full text-lg text-zinc-600 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400 md:grid">×</button> : null}
                        </div>
                        {isAdmin ? <GripIcon label={`Drag ${song.title} to reorder`} className="col-start-2 row-start-1 mt-1 size-3.5 justify-self-end text-zinc-600 md:col-start-3 md:mt-0" /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {isAdmin && item.type === "worship" ? (
                <button type="button" aria-label={`Agregar canción a ${item.title}`} onClick={() => setSongSelectorBlockId(item.id)} className="mt-3 min-h-11 rounded-xl px-3 text-sm font-medium text-emerald-400/80 transition-colors hover:bg-emerald-400/[0.06] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400 md:mt-1">+ Agregar canción</button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="border-y border-white/[0.07] py-12 text-center">
          <p className="text-sm text-zinc-500">Este servicio aún no tiene elementos.</p>
          {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving} className="mt-4">Agregar elemento</PrimaryButton> : null}
        </div>
      )}

      {isAdmin && hasUnsavedChanges ? <PrimaryButton type="button" onClick={saveOrder} disabled={isSaving} className="min-h-14 w-full">{isSaving ? "Guardando..." : "Guardar"}</PrimaryButton> : null}
      <p role="status" aria-live="polite" className={`min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>

      {isAdmin && deletingItem ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-service-item-title" aria-describedby="delete-service-item-description" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="delete-service-item-title" className="text-2xl font-bold tracking-tight text-white">¿Eliminar este elemento?</h2>
            <p id="delete-service-item-description" className="mt-3 text-sm leading-6 text-zinc-400">Esta acción no se puede deshacer.</p>
            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setDeletingItem(null)} disabled={isSaving} className="min-h-12 rounded-full border border-white/10 px-5 font-semibold text-white transition-colors hover:bg-white/[0.06] disabled:opacity-40">Cancelar</button>
              <button type="button" onClick={() => void deleteItem()} disabled={isSaving} className="min-h-12 rounded-full bg-rose-500 px-5 font-semibold text-white transition-colors hover:bg-rose-400 disabled:opacity-40">Eliminar</button>
            </div>
          </section>
        </div>
      ) : null}

      {isAdmin && addStep !== "closed" ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="add-service-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="add-service-item-title" className="text-2xl font-bold tracking-tight text-white">Agregar elemento</h2>
            {addStep === "type" ? (
              <div className="mt-6 grid gap-3">
                <PrimaryButton type="button" onClick={() => setAddStep("text")} disabled={isSaving}>Texto</PrimaryButton>
                <SecondaryButton type="button" onClick={() => void addItem("worship", "Bloque de alabanza")} disabled={isSaving}>Bloque de alabanza</SecondaryButton>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void addItem("text", textTitle, textDetails, textPlannedDuration); }}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Title</span>
                  <input autoFocus required value={textTitle} onChange={(event) => setTextTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Details <span className="font-normal text-zinc-500">(optional)</span></span>
                  <span className="mb-2 block"><AssignmentFields members={teamMembers} value={textDetails} onChange={setTextDetails} /></span>
                  <textarea value={textDetails} onChange={(event) => setTextDetails(event.target.value)} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <PlannedDurationField value={textPlannedDuration} onChange={setTextPlannedDuration} />
                <PrimaryButton type="submit" disabled={isSaving || !textTitle.trim()} className="w-full">Add</PrimaryButton>
              </form>
            )}
            <button type="button" onClick={() => { setAddStep("closed"); setTextTitle(""); setTextDetails(""); setTextPlannedDuration(""); }} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingText ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-text-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-text-item-title" className="text-2xl font-bold tracking-tight text-white">Editar texto</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateTextItem(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Title</span>
                <input autoFocus required value={editingText.title} onChange={(event) => setEditingText({ ...editingText, title: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Details <span className="font-normal text-zinc-500">(optional)</span></span>
                <span className="mb-2 block"><AssignmentFields members={teamMembers} value={editingText.details} onChange={(value) => setEditingText({ ...editingText, details: value })} /></span>
                <textarea value={editingText.details} onChange={(event) => setEditingText({ ...editingText, details: event.target.value })} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <PlannedDurationField value={editingText.plannedDuration} onChange={(plannedDuration) => setEditingText({ ...editingText, plannedDuration })} />
              <PrimaryButton type="submit" disabled={isSaving || !editingText.title.trim()} className="w-full">Save Changes</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingText(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingWorship ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-worship-block-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-worship-block-title" className="text-2xl font-bold tracking-tight text-white">Editar bloque de alabanza</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateWorshipBlock(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Título</span>
                <input autoFocus required value={editingWorship.title} onChange={(event) => setEditingWorship({ ...editingWorship, title: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <PlannedDurationField value={editingWorship.plannedDuration} onChange={(plannedDuration) => setEditingWorship({ ...editingWorship, plannedDuration })} />
              <PrimaryButton type="submit" disabled={isSaving || !editingWorship.title.trim()} className="w-full">Guardar cambios</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingWorship(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40">Cancelar</button>
          </section>
        </div>
      ) : null}

      {isAdmin && songSelectorBlockId ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="add-song-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="add-song-title" className="text-2xl font-bold tracking-tight text-white">Agregar canción</h2>
            <label className="mt-6 block">
              <span className="mb-2 block text-sm font-semibold text-zinc-300">Song library</span>
              <select autoFocus value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]">
                <option value="" disabled>Select a song</option>
                {songs
                  .filter((song) => !items.find((item) => item.id === songSelectorBlockId)?.song_ids?.some((entry) => entry.songId === song.id))
                  .map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
              </select>
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-zinc-300">Notes <span className="font-normal text-zinc-500">(optional)</span></span>
              <span className="mb-2 block"><AssignmentFields members={teamMembers} value={songNotes} onChange={setSongNotes} /></span>
              <input value={songNotes} onChange={(event) => setSongNotes(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
            </label>
            <div className="mt-4"><PlannedDurationField value={songPlannedDuration} onChange={setSongPlannedDuration} /></div>
            <PrimaryButton type="button" onClick={addSongToBlock} disabled={!selectedSongId} className="mt-5 w-full">Guardar</PrimaryButton>
            <button type="button" onClick={() => { setSongSelectorBlockId(null); setSelectedSongId(""); setSongNotes(""); setSongPlannedDuration(""); }} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingSong ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-song-notes-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-song-notes-title" className="text-2xl font-bold tracking-tight text-white">Editar notas de la canción</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); saveSongNotes(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Notes <span className="font-normal text-zinc-500">(optional)</span></span>
                <span className="mb-2 block"><AssignmentFields members={teamMembers} value={editingSong.notes} onChange={(value) => setEditingSong({ ...editingSong, notes: value })} /></span>
                <input autoFocus value={editingSong.notes} onChange={(event) => setEditingSong({ ...editingSong, notes: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <PlannedDurationField value={editingSong.plannedDuration} onChange={(plannedDuration) => setEditingSong({ ...editingSong, plannedDuration })} />
              {editingSong.plannedDuration ? <button type="button" onClick={() => setEditingSong({ ...editingSong, plannedDuration: "" })} className="min-h-11 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300">Usar duración original</button> : null}
              <PrimaryButton type="submit" className="w-full">Guardar</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingSong(null)} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function serializeService(items: ServiceItem[]) {
  return JSON.stringify(items.map((item) => ({
    id: item.id,
    position: item.position,
    title: item.title,
    details: item.details,
    plannedDurationSeconds: item.planned_duration_seconds,
    songIds: item.song_ids,
  })));
}

function PlannedDurationField({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-zinc-300">Duración planeada <span className="font-normal text-zinc-500">(MM:SS, opcional)</span></span>
      <input type="text" inputMode="numeric" pattern="\d+:[0-5]\d" placeholder="05:00" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 font-medium tabular-nums text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
    </label>
  );
}

function SongDurationLine({ entry, libraryDuration }: { entry: WorshipSongEntry; libraryDuration: string }) {
  const duration = getSongDurationSeconds(entry, libraryDuration);
  if (!duration) return null;
  return <p className="mt-1 text-xs text-zinc-500">Duración: {formatDuration(duration)} · {hasSongDurationOverride(entry) ? "Personalizada" : "Biblioteca"}</p>;
}

function isValidPlannedDuration(value: string) {
  return !value.trim() || parsePlannedDurationInput(value) !== null;
}

function ResourceIndicators({ song }: { song: ServiceSong }) {
  const keys = song.song_keys ?? [];
  const hasAudio = Boolean(song.audio_url || keys.some((key) => key.audio_url));
  const hasPdf = Boolean(song.sheet_url || keys.some((key) => key.sheet_url));
  const hasMultitrack = keys.some((key) => (key.song_stems?.length ?? 0) > 0);

  return (
    <div className="flex items-center gap-1" aria-label="Recursos disponibles">
      <ResourceIcon available={hasAudio} label={hasAudio ? "Audio disponible" : "Audio no disponible"}><HeadphonesIcon /></ResourceIcon>
      <ResourceIcon available={hasPdf} label={hasPdf ? "Partitura disponible" : "Partitura no disponible"}><FileIcon /></ResourceIcon>
      <ResourceIcon available={hasMultitrack} label={hasMultitrack ? "Multitrack disponible" : "Multitrack no disponible"}><WaveformIcon /></ResourceIcon>
    </div>
  );
}

function ResourceIcon({ available, children, label }: { available: boolean; children: React.ReactNode; label: string }) {
  return <span role="img" aria-label={label} className={`grid size-7 place-items-center ${available ? "text-emerald-400" : "text-zinc-700"}`}>{children}</span>;
}

function HeadphonesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v7H5a1 1 0 0 1-1-1v-6Zm16 0h-3v7h2a1 1 0 0 0 1-1v-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>;
}

function FileIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4"><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M14 3v5h4" stroke="currentColor" strokeWidth="1.6" /></svg>;
}

function WaveformIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4"><path d="M3 12h2l1.5-5 3 10 3-13 3 16 2.5-8H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function GripIcon({ className, label }: { className: string; label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 12 18" className={className} fill="currentColor">
      <circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="9" r="1.2" /><circle cx="9" cy="9" r="1.2" />
      <circle cx="3" cy="15" r="1.2" /><circle cx="9" cy="15" r="1.2" />
    </svg>
  );
}
