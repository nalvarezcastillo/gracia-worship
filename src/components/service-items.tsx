"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AddStep = "closed" | "type" | "text";

export function ServiceItems({ initialItems, songs, isAdmin, loadError }: { initialItems: ServiceItem[]; songs: ServiceSong[]; isAdmin: boolean; loadError?: string }) {
  const [items, setItems] = useState(initialItems);
  const savedItemsRef = useRef(initialItems);
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [textTitle, setTextTitle] = useState("");
  const [textDetails, setTextDetails] = useState("");
  const [editingText, setEditingText] = useState<{ id: string; title: string; details: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSong, setDraggedSong] = useState<{ blockId: string; songId: string } | null>(null);
  const [songSelectorBlockId, setSongSelectorBlockId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [songNotes, setSongNotes] = useState("");
  const [editingSong, setEditingSong] = useState<{ blockId: string; songId: string; notes: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<ServiceItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(loadError ? `Unable to load service: ${loadError}` : "");
  const [isError, setIsError] = useState(Boolean(loadError));
  const hasUnsavedChanges = serializeService(items) !== serializeService(savedItemsRef.current);

  async function requireSession() {
    if (!isAdmin) throw new Error("You must be signed in to edit the service.");
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("You must be signed in to edit the service.");
    return supabase;
  }

  async function addItem(type: ServiceItem["type"], title: string, details?: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    setIsSaving(true);
    setIsError(false);
    setMessage("Adding item...");

    try {
      const supabase = await requireSession();
      const { data, error } = await supabase
        .from("service_items")
        .insert({
          position: items.length + 1,
          type,
          title: nextTitle,
          details: type === "text" ? details?.trim() || null : null,
          song_ids: type === "worship" ? [] : null,
        })
        .select("id, position, type, title, details, song_ids, created_at")
        .single();

      if (error) throw error;
      savedItemsRef.current = [...savedItemsRef.current, data as ServiceItem];
      setItems((current) => [...current, data as ServiceItem]);
      setAddStep("closed");
      setTextTitle("");
      setTextDetails("");
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
    setIsSaving(true);
    setIsError(false);
    setMessage("Saving text item...");

    try {
      const supabase = await requireSession();
      const title = editingText.title.trim();
      const details = editingText.details.trim() || null;
      const { error } = await supabase
        .from("service_items")
        .update({ title, details })
        .eq("id", editingText.id);

      if (error) throw error;
      savedItemsRef.current = savedItemsRef.current.map((item) => item.id === editingText.id ? { ...item, title, details } : item);
      setItems((current) => current.map((item) => item.id === editingText.id ? { ...item, title, details } : item));
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
    setItems((current) => current.map((item) => {
      if (item.id !== songSelectorBlockId) return item;
      const songEntries = item.song_ids ?? [];
      return songEntries.some((entry) => entry.songId === selectedSongId)
        ? item
        : { ...item, song_ids: [...songEntries, { songId: selectedSongId, notes: songNotes.trim() }] };
    }));
    setSongSelectorBlockId(null);
    setSelectedSongId("");
    setSongNotes("");
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
    setItems((current) => current.map((item) => item.id === editingSong.blockId
      ? {
          ...item,
          song_ids: (item.song_ids ?? []).map((entry) => entry.songId === editingSong.songId
            ? { ...entry, notes: editingSong.notes.trim() }
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
    <div className="mt-10 space-y-8 sm:mt-12">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-white">Service order</h2>
        {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving}>+ Add Item</PrimaryButton> : null}
      </div>

      {items.length ? (
        <div className="divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {items.map((item) => (
            <article
              key={item.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDraggedId(item.id) : undefined}
              onDragEnd={isAdmin ? () => setDraggedId(null) : undefined}
              onDragOver={isAdmin ? (event) => event.preventDefault() : undefined}
              onDrop={isAdmin ? () => reorderItems(item.id) : undefined}
              className={`${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} py-6 transition-colors sm:py-8 ${draggedId === item.id ? "bg-emerald-400/[0.06]" : "hover:bg-white/[0.018]"}`}
            >
              <div className="flex items-start gap-3 px-1 sm:px-2">
                {isAdmin ? <GripIcon className="mt-1 size-4 shrink-0 text-zinc-700" /> : null}
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold leading-6 text-zinc-100 sm:text-lg">{item.title}</h3>
                  {item.type === "text" && item.details ? <p className="mt-1.5 whitespace-pre-wrap text-sm font-normal leading-6 text-zinc-400">{item.details}</p> : null}
                </div>
                {isAdmin ? (
                  <div className="flex shrink-0 items-center">
                    {item.type === "text" ? <button type="button" onClick={() => setEditingText({ id: item.id, title: item.title, details: item.details ?? "" })} disabled={isSaving} className="min-h-11 rounded-full px-3 text-sm font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Edit</button> : null}
                    <button type="button" onClick={() => setDeletingItem(item)} disabled={isSaving} className="min-h-11 rounded-full px-3 text-sm font-medium text-rose-400/80 transition-colors hover:bg-rose-400/[0.07] hover:text-rose-300 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Delete</button>
                  </div>
                ) : null}
              </div>

              {item.type === "worship" && (item.song_ids ?? []).length > 0 ? (
                <ul className={`${isAdmin ? "ml-7" : ""} mt-4 divide-y divide-white/[0.055] sm:mt-5`}>
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
                        className={`grid min-h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 py-2 sm:gap-x-3 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${draggedSong?.songId === entry.songId ? "text-emerald-300" : ""}`}
                      >
                        {isAdmin ? <GripIcon className="size-3.5 text-zinc-700" /> : null}
                        <Link href={`/song/${song.id}`} onClick={(event) => event.stopPropagation()} className="truncate text-sm font-normal text-zinc-300 transition-colors hover:text-emerald-300 sm:text-base">{song.title}</Link>
                        <div className="flex min-w-0 items-center justify-end gap-1">
                          {entry.notes ? <span className="max-w-24 truncate text-right text-sm font-normal text-zinc-500 sm:max-w-40">{entry.notes}</span> : null}
                          {isAdmin ? <button type="button" onClick={(event) => { event.stopPropagation(); setEditingSong({ blockId: item.id, songId: entry.songId, notes: entry.notes }); }} className="min-h-11 shrink-0 rounded-full px-2 text-xs font-medium text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">Edit</button> : null}
                          {isAdmin ? <button type="button" aria-label={`Remove ${song.title}`} onClick={(event) => { event.stopPropagation(); removeSongFromBlock(item.id, entry.songId); }} className="grid size-11 shrink-0 place-items-center rounded-full text-lg text-zinc-600 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400">×</button> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {isAdmin && item.type === "worship" ? (
                <button type="button" onClick={() => setSongSelectorBlockId(item.id)} className="ml-7 mt-3 min-h-11 rounded-full px-3 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-400/[0.06] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400">+ Add Song</button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-zinc-500">No service items yet.</div>
      )}

      {isAdmin && hasUnsavedChanges ? <PrimaryButton type="button" onClick={saveOrder} disabled={isSaving} className="min-h-14 w-full">{isSaving ? "Saving..." : "Save"}</PrimaryButton> : null}
      <p role="status" aria-live="polite" className={`min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>

      {isAdmin && deletingItem ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="alertdialog" aria-modal="true" aria-labelledby="delete-service-item-title" aria-describedby="delete-service-item-description" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="delete-service-item-title" className="text-2xl font-bold tracking-tight text-white">Delete this Service Item?</h2>
            <p id="delete-service-item-description" className="mt-3 text-sm leading-6 text-zinc-400">This action cannot be undone.</p>
            <div className="mt-7 flex justify-end gap-3">
              <button type="button" onClick={() => setDeletingItem(null)} disabled={isSaving} className="min-h-12 rounded-full border border-white/10 px-5 font-semibold text-white transition-colors hover:bg-white/[0.06] disabled:opacity-40">Cancel</button>
              <button type="button" onClick={() => void deleteItem()} disabled={isSaving} className="min-h-12 rounded-full bg-rose-500 px-5 font-semibold text-white transition-colors hover:bg-rose-400 disabled:opacity-40">Delete</button>
            </div>
          </section>
        </div>
      ) : null}

      {isAdmin && addStep !== "closed" ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="add-service-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="add-service-item-title" className="text-2xl font-bold tracking-tight text-white">Add Item</h2>
            {addStep === "type" ? (
              <div className="mt-6 grid gap-3">
                <PrimaryButton type="button" onClick={() => setAddStep("text")} disabled={isSaving}>Agenda Item</PrimaryButton>
                <SecondaryButton type="button" onClick={() => void addItem("worship", "Worship Block")} disabled={isSaving}>Worship Songs</SecondaryButton>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void addItem("text", textTitle, textDetails); }}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Title</span>
                  <input autoFocus required value={textTitle} onChange={(event) => setTextTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Details <span className="font-normal text-zinc-500">(optional)</span></span>
                  <textarea value={textDetails} onChange={(event) => setTextDetails(event.target.value)} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <PrimaryButton type="submit" disabled={isSaving || !textTitle.trim()} className="w-full">Add</PrimaryButton>
              </form>
            )}
            <button type="button" onClick={() => { setAddStep("closed"); setTextTitle(""); setTextDetails(""); }} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingText ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-text-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-text-item-title" className="text-2xl font-bold tracking-tight text-white">Edit Agenda Item</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateTextItem(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Title</span>
                <input autoFocus required value={editingText.title} onChange={(event) => setEditingText({ ...editingText, title: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Details <span className="font-normal text-zinc-500">(optional)</span></span>
                <textarea value={editingText.details} onChange={(event) => setEditingText({ ...editingText, details: event.target.value })} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <PrimaryButton type="submit" disabled={isSaving || !editingText.title.trim()} className="w-full">Save Changes</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingText(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && songSelectorBlockId ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="add-song-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="add-song-title" className="text-2xl font-bold tracking-tight text-white">Add Song</h2>
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
              <input value={songNotes} onChange={(event) => setSongNotes(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
            </label>
            <PrimaryButton type="button" onClick={addSongToBlock} disabled={!selectedSongId} className="mt-5 w-full">Save</PrimaryButton>
            <button type="button" onClick={() => { setSongSelectorBlockId(null); setSelectedSongId(""); setSongNotes(""); }} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingSong ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-song-notes-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-song-notes-title" className="text-2xl font-bold tracking-tight text-white">Edit Song Notes</h2>
            <form className="mt-6" onSubmit={(event) => { event.preventDefault(); saveSongNotes(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Notes <span className="font-normal text-zinc-500">(optional)</span></span>
                <input autoFocus value={editingSong.notes} onChange={(event) => setEditingSong({ ...editingSong, notes: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <PrimaryButton type="submit" className="mt-5 w-full">Save</PrimaryButton>
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
    songIds: item.song_ids,
  })));
}

function GripIcon({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 12 18" className={className} fill="currentColor">
      <circle cx="3" cy="3" r="1.2" /><circle cx="9" cy="3" r="1.2" />
      <circle cx="3" cy="9" r="1.2" /><circle cx="9" cy="9" r="1.2" />
      <circle cx="3" cy="15" r="1.2" /><circle cx="9" cy="15" r="1.2" />
    </svg>
  );
}
