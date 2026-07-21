"use client";

import { useState } from "react";
import Link from "next/link";
import { MusicIcon } from "@/components/icons";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type AddStep = "closed" | "type" | "text";

export function ServiceItems({ initialItems, songs, isAdmin, loadError }: { initialItems: ServiceItem[]; songs: ServiceSong[]; isAdmin: boolean; loadError?: string }) {
  const [items, setItems] = useState(initialItems);
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [textTitle, setTextTitle] = useState("");
  const [textDetails, setTextDetails] = useState("");
  const [editingText, setEditingText] = useState<{ id: string; title: string; details: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSong, setDraggedSong] = useState<{ blockId: string; songId: string } | null>(null);
  const [songSelectorBlockId, setSongSelectorBlockId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(loadError ? `Unable to load service: ${loadError}` : "");
  const [isError, setIsError] = useState(Boolean(loadError));

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

  function addSongToBlock(songId: string) {
    if (!songSelectorBlockId || !songId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== songSelectorBlockId) return item;
      const songIds = item.song_ids ?? [];
      return songIds.includes(songId) ? item : { ...item, song_ids: [...songIds, songId] };
    }));
    setSongSelectorBlockId(null);
    setMessage("");
  }

  function removeSongFromBlock(blockId: string, songId: string) {
    setItems((current) => current.map((item) => item.id === blockId
      ? { ...item, song_ids: (item.song_ids ?? []).filter((id) => id !== songId) }
      : item));
    setMessage("");
  }

  function reorderBlockSongs(blockId: string, targetSongId: string) {
    if (!draggedSong || draggedSong.blockId !== blockId || draggedSong.songId === targetSongId) return;
    setItems((current) => current.map((item) => {
      if (item.id !== blockId) return item;
      const next = [...(item.song_ids ?? [])];
      const fromIndex = next.indexOf(draggedSong.songId);
      const targetIndex = next.indexOf(targetSongId);
      if (fromIndex === -1 || targetIndex === -1) return item;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return { ...item, song_ids: next };
    }));
    setDraggedSong(null);
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
      setItems((current) => current.map((item, index) => ({ ...item, position: index + 1 })));
      setMessage("Service saved successfully.");
    } catch (error) {
      console.error("Unable to save service:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to save service.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="mt-8 space-y-7 sm:mt-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight text-white">Order</h2>
        {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving}>+ Add Item</PrimaryButton> : null}
      </div>

      {items.length ? (
        <div className="space-y-3">
          {items.map((item, index) => (
            <article
              key={item.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDraggedId(item.id) : undefined}
              onDragEnd={isAdmin ? () => setDraggedId(null) : undefined}
              onDragOver={isAdmin ? (event) => event.preventDefault() : undefined}
              onDrop={isAdmin ? () => reorderItems(item.id) : undefined}
              className={`${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} rounded-2xl border border-white/[0.07] bg-zinc-900/60 px-4 py-4 shadow-lg shadow-black/10 transition-colors ${draggedId === item.id ? "bg-emerald-400/[0.08]" : "hover:bg-white/[0.035]"}`}
            >
              <div className="flex min-h-10 items-center gap-4">
                {isAdmin ? <span aria-hidden="true" className="text-zinc-600">⋮⋮</span> : null}
                <span className="w-5 shrink-0 text-xs tabular-nums text-zinc-600">{index + 1}</span>
                {item.type === "worship" ? <MusicIcon className="size-5 shrink-0 text-emerald-400/70" /> : <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center text-sm font-bold text-sky-300">T</span>}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white">{item.title}</h3>
                  {item.type === "text" && item.details ? <p className="mt-1 text-sm text-zinc-400">{item.details}</p> : null}
                  <p className="mt-0.5 text-xs text-zinc-500">{item.type === "worship" ? "Worship Block" : "Text Item"}</p>
                </div>
                {isAdmin && item.type === "worship" ? (
                  <button type="button" onClick={() => setSongSelectorBlockId(item.id)} className="min-h-10 shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400">Add Song</button>
                ) : isAdmin && item.type === "text" ? (
                  <button type="button" onClick={() => setEditingText({ id: item.id, title: item.title, details: item.details ?? "" })} className="min-h-10 shrink-0 rounded-full border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-emerald-400">Edit</button>
                ) : null}
              </div>

              {item.type === "worship" && (item.song_ids ?? []).length > 0 ? (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  {(item.song_ids ?? []).map((songId) => {
                    const song = songs.find((candidate) => candidate.id === songId);
                    if (!song) return null;
                    return (
                      <div
                        key={songId}
                        draggable={isAdmin}
                        onDragStart={isAdmin ? (event) => { event.stopPropagation(); setDraggedSong({ blockId: item.id, songId }); } : undefined}
                        onDragEnd={isAdmin ? (event) => { event.stopPropagation(); setDraggedSong(null); } : undefined}
                        onDragOver={isAdmin ? (event) => { event.stopPropagation(); event.preventDefault(); } : undefined}
                        onDrop={isAdmin ? (event) => { event.stopPropagation(); reorderBlockSongs(item.id, songId); } : undefined}
                        className={`flex min-h-11 items-center gap-3 rounded-xl bg-zinc-950/45 px-3 transition-colors ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${draggedSong?.songId === songId ? "bg-emerald-400/[0.08]" : "hover:bg-white/[0.04]"}`}
                      >
                        {isAdmin ? <span aria-hidden="true" className="text-xs text-zinc-600">⋮⋮</span> : null}
                        <Link href={`/song/${song.id}`} onClick={(event) => event.stopPropagation()} className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200 hover:text-emerald-300">🎵 {song.title}</Link>
                        {isAdmin ? <button type="button" aria-label={`Remove ${song.title}`} onClick={(event) => { event.stopPropagation(); removeSongFromBlock(item.id, songId); }} className="grid size-8 shrink-0 place-items-center rounded-full text-lg text-zinc-500 transition-colors hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-2 focus-visible:outline-rose-400">×</button> : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 py-12 text-center text-sm text-zinc-500">No service items yet.</div>
      )}

      {isAdmin ? <PrimaryButton type="button" onClick={saveOrder} disabled={isSaving} className="min-h-14 w-full">{isSaving ? "Saving..." : "Save"}</PrimaryButton> : null}
      <p role="status" aria-live="polite" className={`min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>

      {isAdmin && addStep !== "closed" ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="add-service-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="add-service-item-title" className="text-2xl font-bold tracking-tight text-white">Add Item</h2>
            {addStep === "type" ? (
              <div className="mt-6 grid gap-3">
                <PrimaryButton type="button" onClick={() => setAddStep("text")} disabled={isSaving}>Text Item</PrimaryButton>
                <SecondaryButton type="button" onClick={() => void addItem("worship", "Worship Block")} disabled={isSaving}>Worship Block</SecondaryButton>
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
            <h2 id="edit-text-item-title" className="text-2xl font-bold tracking-tight text-white">Edit Text Item</h2>
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
              <select autoFocus defaultValue="" onChange={(event) => addSongToBlock(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]">
                <option value="" disabled>Select a song</option>
                {songs
                  .filter((song) => !items.find((item) => item.id === songSelectorBlockId)?.song_ids?.includes(song.id))
                  .map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => setSongSelectorBlockId(null)} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
