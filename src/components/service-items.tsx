"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { DeletePlannedServiceButton } from "@/components/delete-planned-service-button";
import { ServiceLifecycleActions } from "@/components/service-lifecycle-actions";
import { AssignmentFields } from "@/components/assignment-fields";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { formatDuration, formatDurationInput, getSongDurationSeconds, hasSongDurationOverride, parsePlannedDurationInput } from "@/lib/duration";
import type { ServiceItem, ServiceSong, WorshipSongEntry } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeamMember } from "@/lib/team";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";
import type { ServiceStatus } from "@/lib/database.types";
import { getServiceEntryMicrophones } from "@/lib/service-team-resources";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { parseAssignmentText } from "@/lib/assignment-text";
import { buildServiceSchedule } from "@/lib/service-schedule";

type AddStep = "closed" | "type" | "text" | "song";

export function ServiceItems({ initialItems, songs, isAdmin, authenticated, lifecycleStatus, hasCurrentActive, canDeleteService = false, loadError, mobileServiceSchedule, serviceId, serviceName, serviceSchedule, serviceTime = null, showPreparedToast = false, teamMembers = [], serviceTeamAssignments = [] }: { initialItems: ServiceItem[]; songs: ServiceSong[]; isAdmin: boolean; authenticated: boolean; lifecycleStatus: ServiceStatus; hasCurrentActive: boolean; canDeleteService?: boolean; loadError?: string; mobileServiceSchedule: string; serviceId: number; serviceName: string; serviceSchedule: string; serviceTime?: string | null; showPreparedToast?: boolean; teamMembers?: TeamMember[]; serviceTeamAssignments?: CurrentServiceTeamMember[] }) {
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
  const [songSearch, setSongSearch] = useState("");
  const [editingSong, setEditingSong] = useState<{ blockId: string; songId: string; notes: string; plannedDuration: string } | null>(null);
  const [editingSongItem, setEditingSongItem] = useState<{ id: string; details: string; plannedDuration: string } | null>(null);
  const [deletingItem, setDeletingItem] = useState<ServiceItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(loadError ? `Unable to load service: ${loadError}` : "");
  const [isError, setIsError] = useState(Boolean(loadError));
  const [showSuccessToast, setShowSuccessToast] = useState(showPreparedToast);
  const [selectedRow, setSelectedRow] = useState<{ itemId: string; songId?: string } | null>(null);
  const hasUnsavedChanges = serializeService(items) !== serializeService(savedItemsRef.current);
  const operationalEntries = buildOperationalServiceEntries(items, songs);
  const schedule = buildServiceSchedule(items, songs, serviceTime);
  const totalDuration = schedule.totalSeconds;
  const selectedItem = selectedRow ? items.find((item) => item.id === selectedRow.itemId) : null;
  const selectedEntry = selectedItem && selectedRow?.songId ? selectedItem.song_ids?.find((entry) => entry.songId === selectedRow.songId) : null;
  const selectedDetailSongId = selectedRow?.songId ?? (selectedItem?.type === "song" ? selectedItem.song_id : null);
  const selectedSong = selectedDetailSongId ? songs.find((song) => song.id === selectedDetailSongId) : null;

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
          position: items.reduce((maximum, item) => Math.max(maximum, item.position), 0) + 1,
          type,
          title: nextTitle,
          details: type === "text" ? details?.trim() || null : null,
          planned_duration_seconds: parsePlannedDurationInput(plannedDuration ?? ""),
          song_ids: type === "worship" ? [] : null,
          song_id: null,
        })
        .select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at")
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

  async function addSongItem() {
    const song = songs.find((candidate) => candidate.id === selectedSongId);
    if (!song) return;
    if (!isValidPlannedDuration(songPlannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsSaving(true); setIsError(false); setMessage("Agregando canción...");
    try {
      const supabase = await requireSession();
      const nextPosition = items.reduce((maximum, item) => Math.max(maximum, item.position), 0) + 1;
      const { data, error } = await supabase.from("service_items").insert({
        service_id: serviceId,
        position: nextPosition,
        type: "song",
        song_id: song.id,
        title: song.title,
        details: songNotes.trim() || null,
        planned_duration_seconds: parsePlannedDurationInput(songPlannedDuration),
        song_ids: null,
      }).select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at").single();
      if (error) throw error;
      const created = data as ServiceItem;
      savedItemsRef.current = [...savedItemsRef.current, created];
      setItems((current) => [...current, created]);
      closeSongItemComposer();
      setMessage("Canción agregada correctamente.");
    } catch (error) {
      console.error("Unable to add song service item:", error);
      setIsError(true); setMessage(error instanceof Error ? error.message : "No se pudo agregar la canción.");
    } finally { setIsSaving(false); }
  }

  async function updateSongItem() {
    if (!editingSongItem || !isValidPlannedDuration(editingSongItem.plannedDuration)) {
      setIsError(true); setMessage("Usa una duración MM:SS mayor que 00:00."); return;
    }
    setIsSaving(true); setIsError(false); setMessage("Guardando canción...");
    try {
      const supabase = await requireSession();
      const details = editingSongItem.details.trim() || null;
      const plannedDuration = parsePlannedDurationInput(editingSongItem.plannedDuration);
      const { error } = await supabase.from("service_items").update({ details, planned_duration_seconds: plannedDuration }).eq("id", editingSongItem.id).eq("service_id", serviceId).eq("type", "song");
      if (error) throw error;
      const update = (item: ServiceItem) => item.id === editingSongItem.id ? { ...item, details, planned_duration_seconds: plannedDuration } : item;
      savedItemsRef.current = savedItemsRef.current.map(update);
      setItems((current) => current.map(update));
      setEditingSongItem(null);
      setMessage("Canción actualizada correctamente.");
    } catch (error) {
      console.error("Unable to update song service item:", error);
      setIsError(true); setMessage(error instanceof Error ? error.message : "No se pudo actualizar la canción.");
    } finally { setIsSaving(false); }
  }

  function closeSongItemComposer() {
    setAddStep("closed"); setSelectedSongId(""); setSongNotes(""); setSongPlannedDuration(""); setSongSearch("");
  }

  function openSongItemEditor(item: ServiceItem) {
    setEditingSongItem({ id: item.id, details: item.details ?? "", plannedDuration: formatDurationInput(item.planned_duration_seconds) });
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
        .eq("id", editingText.id)
        .eq("service_id", serviceId);

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
        .eq("service_id", serviceId)
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
          .eq("id", item.id)
          .eq("service_id", serviceId)),
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
        .eq("service_id", serviceId)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("Supabase did not delete the service item.");

      savedItemsRef.current = remainingSavedItems;
      const positionResults = await Promise.all(
        remainingItems.map((item, index) => supabase
          .from("service_items")
          .update({ position: index + 1 })
          .eq("id", item.id)
          .eq("service_id", serviceId)),
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
    <div className="space-y-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-0 lg:space-y-0">
      <aside className="hidden border-r border-white/[0.07] bg-zinc-950/35 p-6 lg:block">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Servicio</p>
        <h2 className="mt-4 text-lg font-semibold text-white">{serviceName}</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p>
        <p className="mt-1 text-xs font-medium text-zinc-500">{serviceStatusLabel(lifecycleStatus)}</p>
        <div className="mt-6 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-xs text-zinc-500">Duración planeada</p><p className="mt-1 text-xl font-semibold tabular-nums text-white">{totalDuration ? formatLongDuration(totalDuration) : "—"}</p></div>
        <nav aria-label="Secciones del servicio" className="mt-7 space-y-1 text-sm font-medium"><a href="#orden" className="block rounded-lg bg-emerald-400/[0.09] px-3 py-2.5 text-emerald-300">Orden</a><Link href={`/service/${serviceId}/rehearsal`} className="block rounded-lg px-3 py-2.5 text-zinc-400 hover:bg-white/[0.04] hover:text-white">Ensayo</Link><Link href={`/admin/service-team?service=${serviceId}`} className="block rounded-lg px-3 py-2.5 text-zinc-400 hover:bg-white/[0.04] hover:text-white">Equipo</Link><Link href={`/admin/resources?service=${serviceId}`} className="block rounded-lg px-3 py-2.5 text-zinc-400 hover:bg-white/[0.04] hover:text-white">Recursos</Link><Link href={`/service/${serviceId}/report`} className="block rounded-lg px-3 py-2.5 text-zinc-400 hover:bg-white/[0.04] hover:text-white">Reporte</Link></nav>
        {serviceTeamAssignments.length ? <div className="mt-8 border-t border-white/[0.07] pt-6"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-zinc-500">Equipo</p><div className="mt-3 max-h-80 space-y-2.5 overflow-y-auto pr-1">{serviceTeamAssignments.map((assignment) => <p key={assignment.id} className="text-sm text-zinc-300">{assignment.person_name}<span className="mt-0.5 block text-xs text-zinc-500">{[assignment.role_name, ...assignment.resources.map((resource) => resource.name), assignment.microphone_name].filter(Boolean).join(" · ")}</span></p>)}</div><Link href={`/admin/service-team?service=${serviceId}`} className="mt-3 block text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Ver equipo completo →</Link></div> : null}
      </aside>
      <section id="orden" className="min-w-0 space-y-3 overflow-hidden lg:space-y-6 lg:px-6 lg:py-7 xl:px-8">
      <header className="border-b border-white/[0.08] pb-2.5 lg:pb-6">
        <div className="lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-2xl font-bold leading-8 tracking-[-0.03em] text-white">{serviceName}</h1>
            {authenticated ? <details className="relative shrink-0"><summary aria-label="Más acciones del servicio" className="grid size-10 cursor-pointer list-none place-items-center rounded-xl text-lg leading-none text-zinc-500 hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 [&::-webkit-details-marker]:hidden">•••</summary><div className="absolute right-0 z-30 mt-1 min-w-52 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40">{isAdmin ? <Link href={`/admin?service=${serviceId}`} className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]">Editar fecha</Link> : null}<ServiceLifecycleActions menuItem hasCurrentActive={hasCurrentActive} serviceId={serviceId} status={lifecycleStatus} />{canDeleteService ? <DeletePlannedServiceButton menuItem serviceId={serviceId} serviceName={serviceName} /> : null}<Link href="/archive" className="flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]">Ver archivo</Link></div></details> : null}
          </div>
          <p className="mt-0.5 truncate text-[0.8125rem] leading-5 text-zinc-400">{mobileServiceSchedule || "Horario por confirmar"} <span className="text-zinc-600">·</span> {operationalEntries.length} {operationalEntries.length === 1 ? "elemento" : "elementos"}</p>
          <div className="mt-1.5 flex min-h-10 items-center gap-1.5">
            <span className="mr-auto w-fit rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-[0.12em] text-emerald-300">{serviceStatusLabel(lifecycleStatus)}</span>
            {lifecycleStatus === "active" ? <Link href="/live" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-emerald-400/20 bg-white/[0.035] px-3 text-xs font-semibold text-emerald-300 transition-colors hover:bg-emerald-400/[0.08] focus-visible:outline-2 focus-visible:outline-emerald-400"><span aria-hidden="true" className="mr-1.5 text-[0.625rem]">●</span>En Vivo</Link> : null}
            {isAdmin ? <button type="button" onClick={() => setAddStep("type")} disabled={isSaving} className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-400 px-3 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"><span aria-hidden="true" className="mr-1 text-base leading-none">+</span>Agregar</button> : null}
          </div>
        </div>
        <div className="hidden grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 lg:grid">
          <h1 className="col-start-1 row-start-1 min-w-0 text-[2rem] font-bold tracking-[-0.035em] text-white">Orden del servicio</h1>
          {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving} className="col-start-2 row-start-1 min-h-11 rounded-xl px-4 text-sm shadow-none">+ Agregar elemento</PrimaryButton> : null}
          <p className="col-start-1 row-start-2 min-w-0 text-base text-zinc-400">{serviceSchedule || "Horario por confirmar"}</p>
          <p className="col-start-2 row-start-2 text-right text-sm text-zinc-500">{operationalEntries.length} {operationalEntries.length === 1 ? "elemento" : "elementos"} · {totalDuration ? formatLongDuration(totalDuration) : "sin duración"}</p>
          {authenticated ? <div className="col-span-2 row-start-3 mt-2 flex flex-wrap justify-end gap-2">{isAdmin ? <SecondaryButton href={`/admin?service=${serviceId}`} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Editar fecha</SecondaryButton> : null}<ServiceLifecycleActions hasCurrentActive={hasCurrentActive} serviceId={serviceId} status={lifecycleStatus} />{canDeleteService ? <DeletePlannedServiceButton serviceId={serviceId} serviceName={serviceName} /> : null}<SecondaryButton href="/archive" className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Archivo</SecondaryButton></div> : null}
        </div>
      </header>

      <nav aria-label="Secciones del servicio" className="-mx-4 flex h-11 gap-0.5 overflow-x-auto border-b border-white/[0.07] px-4 text-[0.8125rem] font-semibold [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"><a href="#orden" aria-current="page" className="flex min-h-11 shrink-0 items-center border-b-2 border-emerald-400 px-2.5 text-emerald-300">Orden</a>{isAdmin ? <><Link href={`/admin/service-team?service=${serviceId}`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Equipo</Link><Link href={`/admin/resources?service=${serviceId}`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Recursos</Link></> : null}<Link href={`/service/${serviceId}/rehearsal`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Ensayo</Link><Link href={`/service/${serviceId}/report`} className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-zinc-400">Reporte</Link></nav>

      {showSuccessToast ? <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Próximo servicio preparado correctamente.</div> : null}

      {items.length ? (
        <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
          <div className="hidden grid-cols-[112px_76px_minmax(0,1fr)_minmax(110px,0.42fr)_auto_auto] items-center gap-x-3 border-b border-white/[0.07] px-3 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-zinc-600 lg:grid">
            <span>Hora</span><span>Duración</span><span>Contenido</span><span>Micrófono</span><span className="col-span-2 text-right">Acciones</span>
          </div>
          {items.map((item) => (
            <article
              key={item.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDraggedId(item.id) : undefined}
              onDragEnd={isAdmin ? () => setDraggedId(null) : undefined}
              onDragOver={isAdmin ? (event) => event.preventDefault() : undefined}
              onDrop={isAdmin ? () => reorderItems(item.id) : undefined}
              onClick={() => setSelectedRow({ itemId: item.id })}
              className={`group px-0 py-1.5 transition-colors duration-200 lg:px-3 lg:py-0 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${selectedRow?.itemId === item.id && !selectedRow.songId ? "bg-emerald-400/[0.07]" : draggedId === item.id ? "bg-emerald-400/[0.055]" : "hover:bg-white/[0.018]"}`}
            >
              <div className={`grid grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-x-1.5 lg:grid-cols-[112px_76px_minmax(0,1fr)_minmax(110px,0.42fr)_auto_auto] lg:items-center lg:gap-x-3 ${item.type === "worship" ? "min-h-7 lg:min-h-9" : "min-h-[3.75rem] lg:min-h-14"}`}>
                <MobileScheduleTime value={item.type !== "worship" ? schedule.times.get(item.id) ?? "—" : ""} hidden={item.type === "worship"} />
                <span className="hidden text-sm tabular-nums text-zinc-500 lg:block">{formatItemDuration(item, songs)}</span>
                <div className={`min-w-0 ${item.type === "worship" ? "col-span-2 col-start-1 lg:col-span-1 lg:col-start-3" : "col-start-2 lg:col-start-3"}`}>
                  <h3 className={item.type === "worship" ? "py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-400/80 lg:py-0 lg:text-xs lg:tracking-[0.16em]" : "truncate text-[0.9375rem] font-semibold leading-5 text-zinc-100 lg:text-base lg:leading-6"}>{item.type === "song" && item.song_id ? <Link href={`/song/${item.song_id}?service=${serviceId}`} onClick={(event) => event.stopPropagation()} className="hover:text-emerald-300">{songs.find((song) => song.id === item.song_id)?.title ?? item.title}</Link> : item.title}</h3>
                  {item.type === "text" ? <MobileTextItemMetadata details={item.details ?? ""} duration={item.planned_duration_seconds} /> : null}
                  {item.type === "text" && item.details ? <p className="mt-0.5 hidden truncate whitespace-nowrap text-sm font-normal leading-5 text-zinc-500 lg:block">{item.details}</p> : null}
                  {item.type === "song" ? <DirectSongItemMetadata item={item} songs={songs} /> : null}
                  {item.type === "song" ? <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span> : null}
                  {item.type === "text" ? <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span> : null}
                  {item.type !== "text" && item.type !== "song" && item.planned_duration_seconds ? <p className="mt-0.5 text-xs text-zinc-500 lg:hidden">{formatDuration(item.planned_duration_seconds)}</p> : null}
                </div>
                <DesktopAssignedMicrophones assignmentText={item.type === "worship" ? "" : item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} showEmpty={item.type !== "worship"} />
                <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 lg:contents">
                {item.type === "song" ? <MobileSongKey item={item} songs={songs} /> : null}
                {isAdmin ? (
                  <details className="relative shrink-0">
                    <summary aria-label={`Acciones para ${item.title}`} className="grid size-10 cursor-pointer list-none place-items-center rounded-xl text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 lg:size-11 [&::-webkit-details-marker]:hidden">⋮</summary>
                    <div className="absolute right-0 z-20 mt-1 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40">
                      <button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); if (item.type === "text") setEditingText({ id: item.id, title: item.title, details: item.details ?? "", plannedDuration: formatDurationInput(item.planned_duration_seconds) }); else if (item.type === "song") openSongItemEditor(item); else setEditingWorship({ id: item.id, title: item.title, plannedDuration: formatDurationInput(item.planned_duration_seconds) }); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Editar</button>
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setDeletingItem(item); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.08] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Eliminar</button>
                    </div>
                  </details>
                ) : null}
                {isAdmin ? <GripIcon label={`Drag ${item.title} to reorder`} className="hidden size-3.5 shrink-0 text-zinc-600 lg:block" /> : null}
                </div>
              </div>

              {item.type === "worship" && (item.song_ids ?? []).length > 0 ? (
                <ul className="mt-1 divide-y divide-white/[0.06] border-t border-white/[0.06] lg:mt-0">
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
                        onClick={(event) => { event.stopPropagation(); setSelectedRow({ itemId: item.id, songId: entry.songId }); }}
                        className={`grid min-h-[3.75rem] grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-x-1.5 px-0 py-1.5 transition-colors duration-200 lg:min-h-14 lg:grid-cols-[112px_76px_minmax(0,1fr)_minmax(110px,0.42fr)_auto_auto] lg:items-center lg:gap-x-3 lg:px-3 lg:py-1.5 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${selectedRow?.songId === entry.songId ? "bg-emerald-400/[0.07]" : draggedSong?.songId === entry.songId ? "bg-emerald-400/[0.04] text-emerald-300" : ""}`}
                      >
                        <MobileScheduleTime value={schedule.times.get(`${item.id}:${entry.songId}`) ?? "—"} />
                        <span className="hidden text-sm tabular-nums text-zinc-500 lg:block">{formatDuration(getSongDurationSeconds(entry, song.duration) ?? 0)}</span>
                        <div className="col-start-2 min-w-0 lg:col-start-3">
                          <Link href={`/song/${song.id}?service=${serviceId}`} onClick={(event) => event.stopPropagation()} className="line-clamp-1 text-[0.9375rem] font-semibold leading-5 text-white transition-colors duration-200 hover:text-emerald-300 lg:text-base lg:leading-6 lg:text-zinc-200">{song.title}</Link>
                          <MobileWorshipSongMetadata song={song} entry={entry} />
                          <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={entry.notes} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span>
                          <DesktopSongMetadata song={song} entry={entry} />
                        </div>
                        <DesktopAssignedMicrophones assignmentText={entry.notes} assignments={serviceTeamAssignments} teamMembers={teamMembers} showEmpty />
                        <div className="col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-0.5 lg:col-start-5">
                          <MobileKeyBadge songKey={song.key} />
                          <div className="hidden lg:block"><ResourceIndicators song={song} /></div>
                          {isAdmin ? <details className="relative shrink-0"><summary aria-label={`Más acciones para ${song.title}`} onClick={(event) => event.stopPropagation()} className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 lg:size-11 [&::-webkit-details-marker]:hidden">⋯</summary><div className="absolute bottom-full right-0 z-20 mb-1 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40"><button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); setEditingSong({ blockId: item.id, songId: entry.songId, notes: entry.notes, plannedDuration: formatDurationInput(entry.plannedDurationSeconds) }); }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-emerald-400">Editar notas y duración</button><button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); removeSongFromBlock(item.id, entry.songId); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.08] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Eliminar canción</button></div></details> : null}
                        </div>
                        {isAdmin ? <GripIcon label={`Drag ${song.title} to reorder`} className="hidden size-3.5 text-zinc-600 lg:col-start-6 lg:block" /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {isAdmin && item.type === "worship" ? (
                <button type="button" aria-label={`Agregar canción a ${item.title}`} onClick={() => setSongSelectorBlockId(item.id)} className="mt-3 min-h-11 rounded-xl px-3 text-sm font-medium text-emerald-400/80 transition-colors hover:bg-emerald-400/[0.06] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400 md:mt-1 lg:ml-[188px] lg:min-h-8 lg:py-1 lg:text-xs">+ Agregar canción</button>
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
      <div className="hidden border-t border-white/[0.07] pt-5 lg:mt-[-0.5rem] lg:flex lg:justify-end lg:gap-2 lg:pb-1">
        <SecondaryButton href="/live" className="hidden lg:inline-flex lg:min-h-11 lg:rounded-xl lg:px-4 lg:text-sm lg:shadow-none lg:hover:translate-y-0">→ En Vivo</SecondaryButton>
        <PrimaryButton href={`/service/${serviceId}/rehearsal`} className="w-full lg:min-h-11 lg:w-auto lg:rounded-xl lg:px-4 lg:text-sm lg:shadow-none lg:hover:translate-y-0">▶ Comenzar ensayo</PrimaryButton>
      </div>
      </section>

      {selectedItem ? <aside aria-label="Detalle del elemento" className="fixed bottom-0 right-0 top-16 z-50 hidden w-[360px] overflow-y-auto border-l border-white/[0.09] bg-zinc-950/95 p-6 shadow-[-20px_0_50px_rgba(0,0,0,0.38)] backdrop-blur-xl lg:block">
          <button type="button" onClick={() => setSelectedRow(null)} aria-label="Cerrar detalle" className="absolute right-4 top-4 grid size-9 place-items-center rounded-lg text-xl text-zinc-500 hover:bg-white/[0.06] hover:text-white">×</button>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Detalle del elemento</p>
          <h2 className="mt-4 pr-8 text-xl font-semibold text-white">{selectedSong?.title ?? selectedItem.title}</h2>
          <dl className="mt-6 space-y-5 text-sm">
            <Detail label="Tipo" value={selectedSong ? "Canción" : selectedItem.type === "worship" ? "Bloque de alabanza" : "Elemento"} />
            {selectedSong?.key ? <Detail label="Tonalidad" value={selectedSong.key} /> : null}
            {selectedSong?.bpm ? <Detail label="BPM" value={String(selectedSong.bpm)} /> : null}
            {selectedSong?.time_signature ? <Detail label="Compás" value={selectedSong.time_signature} /> : null}
            <Detail label="Duración" value={selectedSong ? formatDuration(selectedEntry ? getSongDurationSeconds(selectedEntry, selectedSong.duration) ?? 0 : getSongDurationSeconds({ plannedDurationSeconds: selectedItem.planned_duration_seconds }, selectedSong.duration) ?? 0) : selectedItem.planned_duration_seconds ? formatDuration(selectedItem.planned_duration_seconds) : "—"} />
            {selectedSong ? <Detail label="Origen de duración" value={selectedEntry ? hasSongDurationOverride(selectedEntry) ? "Personalizada" : "Biblioteca" : selectedItem.planned_duration_seconds ? "Personalizada" : "Biblioteca"} /> : null}
            {(selectedEntry?.notes || selectedItem.details) ? <Detail label="Notas / responsable" value={selectedEntry?.notes || selectedItem.details || "—"} /> : null}
            {(selectedEntry?.notes || selectedItem.details) ? <Detail label="Micrófono" value={getServiceEntryMicrophones(serviceTeamAssignments, selectedEntry?.notes || selectedItem.details || "", teamMembers).join(" · ") || "—"} /> : null}
          </dl>
          {isAdmin ? <div className="mt-8 space-y-2"><button type="button" onClick={() => selectedItem.type === "song" ? openSongItemEditor(selectedItem) : selectedSong && selectedEntry ? setEditingSong({ blockId: selectedItem.id, songId: selectedSong.id, notes: selectedEntry.notes, plannedDuration: formatDurationInput(selectedEntry.plannedDurationSeconds) }) : selectedItem.type === "text" ? setEditingText({ id: selectedItem.id, title: selectedItem.title, details: selectedItem.details ?? "", plannedDuration: formatDurationInput(selectedItem.planned_duration_seconds) }) : setEditingWorship({ id: selectedItem.id, title: selectedItem.title, plannedDuration: formatDurationInput(selectedItem.planned_duration_seconds) })} className="min-h-10 w-full rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/[0.05]">Editar</button><button type="button" onClick={() => setDeletingItem(selectedItem)} className="min-h-10 w-full rounded-lg px-4 text-sm font-semibold text-rose-300 hover:bg-rose-400/[0.08]">Eliminar</button></div> : null}
      </aside> : null}

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
                <PrimaryButton type="button" onClick={() => setAddStep("song")} disabled={isSaving}>Canción</PrimaryButton>
                <SecondaryButton type="button" onClick={() => setAddStep("text")} disabled={isSaving}>Momento</SecondaryButton>
              </div>
            ) : addStep === "song" ? (
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void addSongItem(); }}>
                <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Buscar canción</span><input autoFocus value={songSearch} onChange={(event) => { setSongSearch(event.target.value); setSelectedSongId(""); }} placeholder="Título o artista" className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" /></label>
                <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Biblioteca</span><select required value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]"><option value="">Selecciona una canción</option>{filterSongs(songs, songSearch).map((song) => <option key={song.id} value={song.id}>{song.title} · {song.artist} · {song.key} · {song.bpm} BPM · {song.duration}</option>)}</select></label>
                {selectedSongId ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-zinc-400">Duración de biblioteca: <span className="font-semibold text-zinc-200">{songs.find((song) => song.id === selectedSongId)?.duration || "—"}</span></p> : null}
                <div><AssignmentFields members={teamMembers} value={songNotes} onChange={setSongNotes} /></div>
                <PlannedDurationField value={songPlannedDuration} onChange={setSongPlannedDuration} />
                <PrimaryButton type="submit" disabled={isSaving || !selectedSongId} className="w-full">{isSaving ? "Agregando..." : "Agregar canción"}</PrimaryButton>
              </form>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void addItem("text", textTitle, textDetails, textPlannedDuration); }}>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Título</span>
                  <input autoFocus required value={textTitle} onChange={(event) => setTextTitle(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-zinc-300">Detalles <span className="font-normal text-zinc-500">(opcional)</span></span>
                  <span className="mb-2 block"><AssignmentFields members={teamMembers} value={textDetails} onChange={setTextDetails} /></span>
                  <textarea value={textDetails} onChange={(event) => setTextDetails(event.target.value)} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <PlannedDurationField value={textPlannedDuration} onChange={setTextPlannedDuration} />
                <PrimaryButton type="submit" disabled={isSaving || !textTitle.trim()} className="w-full">Agregar momento</PrimaryButton>
              </form>
            )}
            <button type="button" onClick={() => { closeSongItemComposer(); setTextTitle(""); setTextDetails(""); setTextPlannedDuration(""); }} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancelar</button>
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

      {isAdmin && editingSongItem ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-song-item-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-song-item-title" className="text-2xl font-bold tracking-tight text-white">Editar canción</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateSongItem(); }}>
              <div><AssignmentFields members={teamMembers} value={editingSongItem.details} onChange={(details) => setEditingSongItem({ ...editingSongItem, details })} /></div>
              <PlannedDurationField value={editingSongItem.plannedDuration} onChange={(plannedDuration) => setEditingSongItem({ ...editingSongItem, plannedDuration })} />
              {editingSongItem.plannedDuration ? <button type="button" onClick={() => setEditingSongItem({ ...editingSongItem, plannedDuration: "" })} className="min-h-11 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300">Usar duración original</button> : null}
              <PrimaryButton type="submit" disabled={isSaving} className="w-full">{isSaving ? "Guardando..." : "Guardar"}</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingSongItem(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancelar</button>
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
    songId: item.song_id,
    songIds: item.song_ids,
  })));
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-zinc-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap text-zinc-200">{value}</dd></div>;
}

function formatLongDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes} min`;
}

function formatItemDuration(item: ServiceItem, songs: ServiceSong[]) {
  if (item.type === "worship") return "";
  if (item.type === "song") {
    const song = item.song_id ? songs.find((candidate) => candidate.id === item.song_id) : null;
    const duration = song ? getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration) : null;
    return duration ? formatDuration(duration) : "—";
  }
  return item.planned_duration_seconds ? formatDuration(item.planned_duration_seconds) : "—";
}

function PlannedDurationField({ onChange, value }: { onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-zinc-300">Duración planeada <span className="font-normal text-zinc-500">(MM:SS, opcional)</span></span>
      <input type="text" inputMode="numeric" pattern="\d+:[0-5]\d" placeholder="05:00" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 font-medium tabular-nums text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
    </label>
  );
}

function AssignedMicrophonesLine({ assignmentText, assignments, teamMembers }: { assignmentText: string; assignments: CurrentServiceTeamMember[]; teamMembers: TeamMember[] }) {
  const microphones = getServiceEntryMicrophones(assignments, assignmentText, teamMembers);
  return microphones.length ? <div className="mt-1"><AssignedMicrophoneItems microphones={microphones} /></div> : null;
}

function DesktopAssignedMicrophones({ assignmentText, assignments, teamMembers, showEmpty = false }: { assignmentText: string; assignments: CurrentServiceTeamMember[]; teamMembers: TeamMember[]; showEmpty?: boolean }) {
  const microphones = getServiceEntryMicrophones(assignments, assignmentText, teamMembers);
  return (
    <div className="hidden min-w-0 flex-col gap-1 lg:flex">
      {microphones.length ? <AssignedMicrophoneItems microphones={microphones} /> : showEmpty ? <span className="text-xs text-zinc-600">—</span> : null}
    </div>
  );
}

function AssignedMicrophoneItems({ microphones }: { microphones: string[] }) {
  const label = microphones.join(" · ");
  return <span className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-zinc-400" title={label}><Mic aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-zinc-500" strokeWidth={1.75} /><span className="min-w-0 break-words">{label}</span></span>;
}

function DesktopSongMetadata({ song, entry }: { song: ServiceSong; entry: WorshipSongEntry }) {
  const assignment = parseAssignmentText(entry.notes);
  const metadata = [song.key, song.bpm ? `${song.bpm} BPM` : null, song.time_signature, assignment.name, assignment.role].filter(Boolean);
  return metadata.length ? <p className="mt-0.5 hidden truncate text-xs text-zinc-500 lg:block" title={metadata.join(" · ")}>{metadata.join(" · ")}</p> : null;
}

function DirectSongItemMetadata({ item, songs }: { item: ServiceItem; songs: ServiceSong[] }) {
  const song = item.song_id ? songs.find((candidate) => candidate.id === item.song_id) : null;
  if (!song) return <p className="mt-1 text-xs text-rose-300">Canción no disponible</p>;
  const assignment = parseAssignmentText(item.details ?? "");
  const metadata = [song.key, song.bpm ? `${song.bpm} BPM` : null, song.time_signature, assignment.name, assignment.role].filter(Boolean);
  const duration = getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration);
  const mobileMetadata = [song.artist, assignment.name, assignment.role, duration ? formatDuration(duration) : null].filter(Boolean);
  return <><p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{mobileMetadata.join(" · ")}</p><p className="mt-0.5 hidden truncate text-xs text-zinc-500 lg:block" title={metadata.join(" · ")}>{metadata.join(" · ")}</p></>;
}

function MobileSongKey({ item, songs }: { item: ServiceItem; songs: ServiceSong[] }) {
  if (!item.song_id) return null;
  const song = songs.find((candidate) => candidate.id === item.song_id);
  return <MobileKeyBadge songKey={song?.key} />;
}

function MobileKeyBadge({ songKey }: { songKey?: string | null }) {
  if (!songKey?.trim()) return null;
  return <span className="grid min-h-8 min-w-8 place-items-center rounded-full border border-emerald-400/25 px-1.5 text-xs font-bold text-emerald-300 lg:hidden" title={`Tonalidad ${songKey}`}>{songKey}</span>;
}

function MobileWorshipSongMetadata({ song, entry }: { song: ServiceSong; entry: WorshipSongEntry }) {
  const assignment = parseAssignmentText(entry.notes);
  const duration = getSongDurationSeconds(entry, song.duration);
  const metadata = [song.artist, assignment.name, assignment.role, duration ? formatDuration(duration) : null].filter(Boolean);
  return metadata.length ? <p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{metadata.join(" · ")}</p> : null;
}

function MobileTextItemMetadata({ details, duration }: { details: string; duration?: number | null }) {
  const assignment = parseAssignmentText(details);
  const metadata = [assignment.name, assignment.role, duration ? formatDuration(duration) : null].filter(Boolean);
  return metadata.length ? <p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{metadata.join(" · ")}</p> : null;
}

function MobileScheduleTime({ value, hidden = false }: { value: string; hidden?: boolean }) {
  const match = value.match(/^(\d{1,2}:\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  const time = match?.[1] ?? value;
  const period = match?.[2]?.toLocaleUpperCase();
  return <span className={`${hidden ? "hidden lg:block" : ""} whitespace-nowrap pt-0.5 text-[0.8125rem] font-medium tabular-nums text-zinc-500 lg:pt-0 lg:text-sm lg:text-zinc-400`}><span className="lg:hidden">{time}{period ? <span className="ml-0.5 text-[0.5625rem] text-zinc-600">{period}</span> : null}</span><span className="hidden lg:inline">{value}</span></span>;
}

function isValidPlannedDuration(value: string) {
  return !value.trim() || parsePlannedDurationInput(value) !== null;
}

function filterSongs(songs: ServiceSong[], query: string) {
  const normalized = query.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
  if (!normalized) return songs;
  return songs.filter((song) => `${song.title} ${song.artist}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").includes(normalized));
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

function serviceStatusLabel(status: ServiceStatus) {
  if (status === "active") return "Próximo";
  if (status === "planned") return "Planificado";
  if (status === "completed") return "Completado";
  return "Archivado";
}
