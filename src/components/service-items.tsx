"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic } from "lucide-react";
import { DeletePlannedServiceButton } from "@/components/delete-planned-service-button";
import { ServiceLifecycleActions } from "@/components/service-lifecycle-actions";
import { AssignmentFields } from "@/components/assignment-fields";
import { SongCover } from "@/components/song-cover";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { formatDuration, formatDurationInput, getSongDurationSeconds, hasSongDurationOverride, parsePlannedDurationInput } from "@/lib/duration";
import type { ServiceItem, ServiceItemNote, ServiceSong, ServiceSongSetting, WorshipSongEntry } from "@/lib/service";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { TeamMember } from "@/lib/team";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";
import type { ServiceItemResponsibilityRow, ServiceStatus } from "@/lib/database.types";
import { getServiceEntryMicrophones } from "@/lib/service-team-resources";
import { buildOperationalServiceEntries } from "@/lib/service-entries";
import { parseAssignmentText } from "@/lib/assignment-text";
import { buildServiceSchedule } from "@/lib/service-schedule";

type AddStep = "closed" | "type" | "text" | "song";
const STANDARD_MUSICAL_KEYS = ["C", "C#", "Db", "D", "D#", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab", "A", "A#", "Bb", "B"];

export function ServiceItems({ initialItems, initialItemNotes, initialResponsibilities, initialSongSettings, songs, isAdmin, authenticated, lifecycleStatus, hasCurrentActive, canDeleteService = false, loadError, mobileServiceSchedule, serviceId, serviceName, serviceSchedule, serviceTime = null, showPreparedToast = false, teamMembers = [], serviceTeamAssignments = [] }: { initialItems: ServiceItem[]; initialItemNotes: ServiceItemNote[]; initialResponsibilities: ServiceItemResponsibilityRow[]; initialSongSettings: ServiceSongSetting[]; songs: ServiceSong[]; isAdmin: boolean; authenticated: boolean; lifecycleStatus: ServiceStatus; hasCurrentActive: boolean; canDeleteService?: boolean; loadError?: string; mobileServiceSchedule: string; serviceId: number; serviceName: string; serviceSchedule: string; serviceTime?: string | null; showPreparedToast?: boolean; teamMembers?: TeamMember[]; serviceTeamAssignments?: CurrentServiceTeamMember[] }) {
  const [items, setItems] = useState(initialItems);
  const [songSettings, setSongSettings] = useState(initialSongSettings);
  const [itemNotes, setItemNotes] = useState(initialItemNotes);
  const [responsibilities, setResponsibilities] = useState(initialResponsibilities);
  const [editingItemNote, setEditingItemNote] = useState<{ itemId: string; title: string; notes: string } | null>(null);
  const savedItemsRef = useRef(initialItems);
  const [addStep, setAddStep] = useState<AddStep>("closed");
  const [textTitle, setTextTitle] = useState("");
  const [textDetails, setTextDetails] = useState("");
  const [textResponsibilityIds, setTextResponsibilityIds] = useState<string[]>([]);
  const [textPlannedDuration, setTextPlannedDuration] = useState("");
  const [editingText, setEditingText] = useState<{ id: string; title: string; details: string; plannedDuration: string; responsibilityIds: string[] } | null>(null);
  const [editingWorship, setEditingWorship] = useState<{ id: string; title: string; plannedDuration: string; responsibilityIds: string[] } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedSong, setDraggedSong] = useState<{ blockId: string; songId: string } | null>(null);
  const [songSelectorBlockId, setSongSelectorBlockId] = useState<string | null>(null);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [songNotes, setSongNotes] = useState("");
  const [songResponsibilityIds, setSongResponsibilityIds] = useState<string[]>([]);
  const [songPlannedDuration, setSongPlannedDuration] = useState("");
  const [songSearch, setSongSearch] = useState("");
  const [editingSong, setEditingSong] = useState<{ blockId: string; songId: string; notes: string; plannedDuration: string } | null>(null);
  const [editingSongItem, setEditingSongItem] = useState<{ id: string; details: string; plannedDuration: string; responsibilityIds: string[] } | null>(null);
  const [changingSongItem, setChangingSongItem] = useState<ServiceItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ServiceItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(loadError ? `Unable to load service: ${loadError}` : "");
  const [isError, setIsError] = useState(Boolean(loadError));
  const [showSuccessToast, setShowSuccessToast] = useState(showPreparedToast);
  const [selectedRow, setSelectedRow] = useState<{ itemId: string; songId?: string } | null>(null);
  const hasUnsavedChanges = serializeService(items) !== serializeService(savedItemsRef.current);
  const operationalEntries = buildOperationalServiceEntries(items, songs, songSettings);
  const [keySelector, setKeySelector] = useState<{ itemId: string; songId: string } | null>(null);
  const schedule = buildServiceSchedule(items, songs, serviceTime);
  const totalDuration = schedule.totalSeconds;
  const selectedItem = selectedRow ? items.find((item) => item.id === selectedRow.itemId) : null;
  const selectedEntry = selectedItem && selectedRow?.songId ? selectedItem.song_ids?.find((entry) => entry.songId === selectedRow.songId) : null;
  const selectedDetailSongId = selectedRow?.songId ?? (selectedItem?.type === "song" ? selectedItem.song_id : null);
  const selectedSong = selectedDetailSongId ? songs.find((song) => song.id === selectedDetailSongId) : null;
  const selectedOperationalSong = selectedSong && selectedItem ? findOperationalSongEntry(operationalEntries, selectedItem.id, selectedSong.id) : null;
  const selectedItemNote = selectedItem ? itemNotes.find((note) => note.service_item_id === selectedItem.id)?.notes ?? "" : "";
  const selectedHasRelationalResponsibility = selectedItem ? responsibilities.some((entry) => entry.service_item_id === selectedItem.id) : false;
  const selectedResponsibleAssignments = selectedItem ? getResponsibleAssignments(selectedItem.id, responsibilities, serviceTeamAssignments) : [];
  const keySelectorSong = keySelector ? songs.find((song) => song.id === keySelector.songId) : null;
  const keySelectorEntry = keySelector ? operationalEntries.find((entry) => entry.kind === "song" && entry.item.id === keySelector.itemId && entry.song.id === keySelector.songId) : null;
  const keyOptions = keySelectorSong ? Array.from(new Set([keySelectorSong.key, ...(keySelectorSong.song_keys ?? []).map((key) => key.key_name), ...STANDARD_MUSICAL_KEYS].filter((key): key is string => Boolean(key?.trim())))) : [];

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

  function responsibilityIdsForItem(itemId: string) {
    return responsibilities.filter((entry) => entry.service_item_id === itemId).sort((a, b) => a.sort_order - b.sort_order).map((entry) => entry.service_team_assignment_id);
  }

  async function saveResponsibilities(itemId: string, assignmentIds: string[]) {
    const supabase = await requireSession();
    const { error } = await supabase.rpc("set_service_item_responsibilities", {
      p_assignment_ids: assignmentIds,
      p_service_id: serviceId,
      p_service_item_id: itemId,
    });
    if (error) throw error;
    setResponsibilities((current) => [
      ...current.filter((entry) => entry.service_item_id !== itemId),
      ...assignmentIds.map((assignmentId, sortOrder) => ({
        created_at: new Date().toISOString(),
        id: `${itemId}:${assignmentId}`,
        service_id: serviceId,
        service_item_id: itemId,
        service_team_assignment_id: assignmentId,
        sort_order: sortOrder,
      })),
    ]);
  }

  async function setServiceSongKey(itemId: string, songId: string, keyOverride: string | null) {
    setIsSaving(true);
    setIsError(false);
    try {
      const supabase = await requireSession();
      const { error } = await supabase.rpc("set_service_song_key_override", {
        p_key_override: keyOverride,
        p_service_id: serviceId,
        p_service_item_id: itemId,
        p_song_id: songId,
      });
      if (error) throw error;
      setSongSettings((current) => keyOverride === null
        ? current.filter((setting) => setting.service_item_id !== itemId || setting.song_id !== songId)
        : [...current.filter((setting) => setting.service_item_id !== itemId || setting.song_id !== songId), {
            key_override: keyOverride.trim(), service_id: serviceId, service_item_id: itemId, song_id: songId,
          }]);
      setKeySelector(null);
      setMessage(keyOverride === null ? "Tonalidad original restaurada." : "Tonalidad del servicio actualizada.");
    } catch (error) {
      console.error("Unable to update service song key:", error);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar la tonalidad.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveItemNote() {
    if (!editingItemNote) return;
    setIsSaving(true); setIsError(false);
    try {
      const supabase = await requireSession();
      const notes = editingItemNote.notes.trim();
      const result = notes
        ? await supabase.from("service_item_notes").upsert({ service_id: serviceId, service_item_id: editingItemNote.itemId, notes, updated_at: new Date().toISOString() }, { onConflict: "service_item_id" })
        : await supabase.from("service_item_notes").delete().eq("service_id", serviceId).eq("service_item_id", editingItemNote.itemId);
      if (result.error) throw result.error;
      setItemNotes((current) => notes
        ? [...current.filter((note) => note.service_item_id !== editingItemNote.itemId), { service_id: serviceId, service_item_id: editingItemNote.itemId, notes }]
        : current.filter((note) => note.service_item_id !== editingItemNote.itemId));
      setEditingItemNote(null);
      setMessage(notes ? "Notas operacionales guardadas." : "Notas operacionales eliminadas.");
    } catch (error) {
      console.error("Unable to save service item notes:", error);
      setIsError(true); setMessage(error instanceof Error ? error.message : "No se pudieron guardar las notas.");
    } finally { setIsSaving(false); }
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
      try {
        await saveResponsibilities(data.id, textResponsibilityIds);
      } catch (responsibilityError) {
        await supabase.from("service_items").delete().eq("id", data.id).eq("service_id", serviceId);
        throw responsibilityError;
      }
      savedItemsRef.current = [...savedItemsRef.current, data as ServiceItem];
      setItems((current) => [...current, data as ServiceItem]);
      setAddStep("closed");
      setTextTitle("");
      setTextDetails("");
      setTextResponsibilityIds([]);
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
      try {
        await saveResponsibilities(created.id, songResponsibilityIds);
      } catch (responsibilityError) {
        await supabase.from("service_items").delete().eq("id", created.id).eq("service_id", serviceId);
        throw responsibilityError;
      }
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
      await saveResponsibilities(editingSongItem.id, editingSongItem.responsibilityIds);
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
    setAddStep("closed"); setSelectedSongId(""); setSongNotes(""); setSongResponsibilityIds([]); setSongPlannedDuration(""); setSongSearch("");
  }

  function openSongItemEditor(item: ServiceItem) {
    setEditingSongItem({ id: item.id, details: item.details ?? "", plannedDuration: formatDurationInput(item.planned_duration_seconds), responsibilityIds: responsibilityIdsForItem(item.id) });
  }

  function openItemEditor(item: ServiceItem) {
    if (item.type === "text") {
      setEditingText({ id: item.id, title: item.title, details: item.details ?? "", plannedDuration: formatDurationInput(item.planned_duration_seconds), responsibilityIds: responsibilityIdsForItem(item.id) });
    } else if (item.type === "song") {
      openSongItemEditor(item);
    } else {
      setEditingWorship({ id: item.id, title: item.title, plannedDuration: formatDurationInput(item.planned_duration_seconds), responsibilityIds: responsibilityIdsForItem(item.id) });
    }
  }

  function openSongChanger(item: ServiceItem) {
    setChangingSongItem(item);
    setSelectedSongId("");
    setSongSearch("");
  }

  function closeSongChanger() {
    setChangingSongItem(null);
    setSelectedSongId("");
    setSongSearch("");
  }

  async function changeSongItem() {
    if (!changingSongItem || !selectedSongId || selectedSongId === changingSongItem.song_id) return;
    const replacement = songs.find((song) => song.id === selectedSongId);
    if (!replacement) return;
    setIsSaving(true); setIsError(false); setMessage("Cambiando canción...");
    try {
      const supabase = await requireSession();
      const { error } = await supabase.rpc("change_service_item_song", {
        p_service_id: serviceId,
        p_service_item_id: changingSongItem.id,
        p_song_id: replacement.id,
      });
      if (error) throw error;
      const update = (item: ServiceItem) => item.id === changingSongItem.id
        ? { ...item, song_id: replacement.id, title: replacement.title, planned_duration_seconds: null }
        : item;
      savedItemsRef.current = savedItemsRef.current.map(update);
      setItems((current) => current.map(update));
      setSongSettings((current) => current.filter((setting) => setting.service_item_id !== changingSongItem.id));
      closeSongChanger();
      setMessage("Canción cambiada correctamente.");
    } catch (error) {
      console.error("Unable to change service item song:", error);
      const errorMessage = error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error && typeof error.message === "string"
          ? error.message
          : "No se pudo cambiar la canción.";
      setIsError(true); setMessage(errorMessage);
    } finally { setIsSaving(false); }
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
      await saveResponsibilities(editingText.id, editingText.responsibilityIds);
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
      await saveResponsibilities(editingWorship.id, editingWorship.responsibilityIds);
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
    <div className="space-y-4 lg:grid lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[264px_minmax(0,1fr)] lg:gap-0 lg:space-y-0">
      <aside className="hidden border-r border-white/[0.055] bg-[#070b0f] px-6 py-8 lg:block">
        <p className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-zinc-600">Servicio</p>
        <h2 className="mt-3 text-[1.0625rem] font-semibold leading-6 tracking-[-0.025em] text-zinc-100">{serviceName}</h2>
        <p className="mt-1 text-[0.8125rem] leading-5 text-zinc-500">{serviceSchedule || "Horario por confirmar"}</p>
        <p className="mt-2.5 text-[0.5625rem] font-bold uppercase tracking-[0.15em] text-emerald-400/75">{serviceStatusLabel(lifecycleStatus)}</p>
        <div className="mt-6 border-y border-white/[0.055] py-4"><p className="text-[0.5625rem] font-bold uppercase tracking-[0.17em] text-zinc-600">Duración planeada</p><p className="mt-1.5 text-lg font-medium tabular-nums tracking-[-0.025em] text-zinc-300">{totalDuration ? formatLongDuration(totalDuration) : "—"}</p></div>
        <nav aria-label="Flujo del servicio" className="mt-5 space-y-0.5 text-[0.8125rem] font-medium"><a href="#orden" className="relative block rounded-lg bg-white/[0.035] px-3 py-2.5 text-zinc-100 before:absolute before:inset-y-2.5 before:left-0 before:w-px before:bg-emerald-400">Orden</a>{authenticated ? <Link href={`/admin/service-team?service=${serviceId}`} className="block rounded-lg px-3 py-2.5 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Equipo</Link> : null}<Link href={`/service/${serviceId}/preflight`} className="block rounded-lg px-3 py-2.5 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Preparación</Link><Link href={`/service/${serviceId}/rehearsal`} className="block rounded-lg px-3 py-2.5 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Ensayo</Link></nav>
        <nav aria-label="Más secciones del servicio" className="mt-5 border-t border-white/[0.055] pt-4 text-[0.8125rem] font-medium"><p className="px-3 text-[0.5625rem] font-bold uppercase tracking-[0.18em] text-zinc-600">Más</p><div className="mt-1.5 space-y-0.5"><Link href={`/service/${serviceId}/playback`} className="block rounded-lg px-3 py-2 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Playback</Link><Link href={`/service/${serviceId}/notes`} className="block rounded-lg px-3 py-2 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Notas</Link>{authenticated ? <Link href={`/admin/resources?service=${serviceId}`} className="block rounded-lg px-3 py-2 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Recursos</Link> : null}<Link href={`/service/${serviceId}/report`} className="block rounded-lg px-3 py-2 text-zinc-500 transition-colors hover:bg-white/[0.025] hover:text-zinc-200">Reporte</Link></div></nav>
        {serviceTeamAssignments.length ? <div className="mt-7 border-t border-white/[0.055] pt-5"><p className="text-[0.625rem] font-bold uppercase tracking-[0.18em] text-zinc-600">Equipo</p><div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">{serviceTeamAssignments.map((assignment) => <p key={assignment.id} className="text-[0.8125rem] font-medium leading-5 text-zinc-300">{assignment.person_name}<span className="mt-0.5 block text-[0.6875rem] font-normal leading-4 text-zinc-600">{[assignment.role_name, ...assignment.resources.map((resource) => resource.name), assignment.microphone_name].filter(Boolean).join(" · ")}</span></p>)}</div><Link href={`/admin/service-team?service=${serviceId}`} className="mt-4 inline-flex min-h-8 items-center text-[0.6875rem] font-semibold text-zinc-500 transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400">Ver equipo completo →</Link></div> : null}
      </aside>
      <section id="orden" className="min-w-0 space-y-3 overflow-x-clip lg:space-y-6 lg:px-7 lg:py-8 xl:px-10">
      <header className="border-b border-white/[0.055] pb-2.5 lg:pb-4">
        <div className="lg:hidden">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 flex-1 line-clamp-2 text-2xl font-bold leading-7 tracking-[-0.03em] text-white">{serviceName}</h1>
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
          <div className="col-start-1 row-start-1 min-w-0"><p className="text-[0.5625rem] font-bold uppercase tracking-[0.22em] text-emerald-400/80">Servicio</p><h1 className="mt-1.5 text-[2.125rem] font-semibold leading-tight tracking-[-0.045em] text-zinc-50">Orden del servicio</h1></div>
          {isAdmin ? <PrimaryButton type="button" onClick={() => setAddStep("type")} disabled={isSaving} className="col-start-2 row-start-1 min-h-11 rounded-xl px-4 text-sm shadow-none">+ Agregar elemento</PrimaryButton> : null}
          <p className="col-start-1 row-start-2 min-w-0 text-[0.8125rem] font-medium text-zinc-500">{serviceSchedule || "Horario por confirmar"}</p>
          <p className="col-start-2 row-start-2 text-right text-[0.8125rem] tabular-nums text-zinc-600">{operationalEntries.length} {operationalEntries.length === 1 ? "elemento" : "elementos"} · {totalDuration ? formatLongDuration(totalDuration) : "sin duración"}</p>
          {authenticated ? <div className="col-span-2 row-start-3 mt-1 flex flex-wrap justify-end gap-2">{isAdmin ? <SecondaryButton href={`/admin?service=${serviceId}`} className="min-h-10 rounded-xl px-3.5 text-[0.8125rem] shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Editar fecha</SecondaryButton> : null}<ServiceLifecycleActions hasCurrentActive={hasCurrentActive} serviceId={serviceId} status={lifecycleStatus} />{canDeleteService ? <DeletePlannedServiceButton serviceId={serviceId} serviceName={serviceName} /> : null}<SecondaryButton href="/archive" className="min-h-10 rounded-xl px-3.5 text-[0.8125rem] shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Archivo</SecondaryButton></div> : null}
        </div>
      </header>

      <nav aria-label="Flujo del servicio" className={`-mx-4 grid h-12 border-b border-white/[0.07] px-2 text-[0.6875rem] font-semibold lg:hidden ${authenticated ? "grid-cols-5" : "grid-cols-4"}`}><a href="#orden" aria-current="page" className="flex min-h-11 items-center justify-center border-b-2 border-emerald-400 px-1 text-emerald-300">Orden</a>{authenticated ? <Link href={`/admin/service-team?service=${serviceId}`} className="flex min-h-11 items-center justify-center border-b-2 border-transparent px-1 text-zinc-400">Equipo</Link> : null}<Link href={`/service/${serviceId}/preflight`} className="flex min-h-11 items-center justify-center border-b-2 border-transparent px-1 text-zinc-400">Preparación</Link><Link href={`/service/${serviceId}/rehearsal`} className="flex min-h-11 items-center justify-center border-b-2 border-transparent px-1 text-zinc-400">Ensayo</Link><details className="relative min-w-0"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-center border-b-2 border-transparent px-1 text-zinc-400 [&::-webkit-details-marker]:hidden">Más</summary><div className="absolute right-0 z-30 mt-1 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 text-sm shadow-xl shadow-black/40"><Link href={`/service/${serviceId}/playback`} className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-white/[0.06]">Playback</Link><Link href={`/service/${serviceId}/notes`} className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-white/[0.06]">Notas</Link>{authenticated ? <Link href={`/admin/resources?service=${serviceId}`} className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-white/[0.06]">Recursos</Link> : null}<Link href={`/service/${serviceId}/report`} className="flex min-h-11 items-center rounded-lg px-3 text-zinc-200 hover:bg-white/[0.06]">Reporte</Link></div></details></nav>

      {showSuccessToast ? <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Próximo servicio preparado correctamente.</div> : null}

      {items.length ? (
        <div className="space-y-2.5">
          {items.map((item, itemIndex) => {
            const responsibleAssignments = getResponsibleAssignments(item.id, responsibilities, serviceTeamAssignments);
            const hasRelationalResponsibility = responsibilities.some((entry) => entry.service_item_id === item.id);
            return (
            <article
              key={item.id}
              draggable={isAdmin}
              onDragStart={isAdmin ? () => setDraggedId(item.id) : undefined}
              onDragEnd={isAdmin ? () => setDraggedId(null) : undefined}
              onDragOver={isAdmin ? (event) => event.preventDefault() : undefined}
              onDrop={isAdmin ? () => reorderItems(item.id) : undefined}
              onClick={() => setSelectedRow({ itemId: item.id })}
              className={`group rounded-xl border px-2 py-2 transition-[border-color,background-color] duration-200 lg:px-4 lg:py-1.5 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${selectedRow?.itemId === item.id && !selectedRow.songId ? "border-emerald-400/25 bg-emerald-400/[0.055]" : draggedId === item.id ? "border-emerald-400/20 bg-emerald-400/[0.045]" : item.type === "song" ? "border-white/[0.07] bg-white/[0.024] hover:border-emerald-400/[0.16] hover:bg-white/[0.035]" : "border-white/[0.05] bg-white/[0.012] hover:border-white/[0.085] hover:bg-white/[0.025]"}`}
            >
              <div className={`grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-2 lg:grid-cols-[96px_72px_minmax(220px,1fr)_minmax(110px,0.42fr)_72px_52px_60px_44px_auto] lg:items-center lg:gap-x-3 ${item.type === "worship" ? "min-h-12" : "min-h-[4.625rem]"}`}>
                <OrderSchedule index={itemIndex} type={item.type} value={item.type !== "worship" ? schedule.times.get(item.id) ?? "—" : ""} />
                <span className="hidden text-sm tabular-nums text-zinc-400 lg:block">{formatItemDuration(item, songs)}</span>
                <div className={`min-w-0 ${item.type === "worship" ? "col-span-2 col-start-1 lg:col-span-1 lg:col-start-3" : "col-start-2 lg:col-start-3"} ${item.type === "song" ? "flex items-center gap-2.5 lg:gap-3" : ""}`}>
                  {item.type === "song" && item.song_id ? <SongCover src={songs.find((song) => song.id === item.song_id)?.cover_url} alt="" width={48} height={48} className="size-10 shrink-0 self-center rounded-lg object-cover ring-1 ring-white/[0.09] lg:size-11" /> : null}
                  <div className="min-w-0 flex-1">
                  <h3 className={item.type === "worship" ? "py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-400/80 lg:py-0 lg:text-xs lg:tracking-[0.16em]" : "line-clamp-2 text-[0.9375rem] font-semibold leading-5 text-zinc-100 lg:block lg:truncate lg:text-base lg:leading-6"}>{item.type === "song" && item.song_id ? <Link href={`/song/${item.song_id}?service=${serviceId}`} onClick={(event) => event.stopPropagation()} className="hover:text-emerald-300">{songs.find((song) => song.id === item.song_id)?.title ?? item.title}</Link> : item.title}</h3>
                  {item.type === "text" ? <MobileTextItemMetadata details={item.details ?? ""} duration={item.planned_duration_seconds} hasRelationalResponsibility={hasRelationalResponsibility} /> : null}
                  {item.type === "text" && item.details && !hasRelationalResponsibility ? <p className="mt-0.5 hidden truncate whitespace-nowrap text-sm font-normal leading-5 text-zinc-400 lg:block">{item.details}</p> : null}
                  {item.type === "song" ? <DirectSongItemMetadata hasRelationalResponsibility={hasRelationalResponsibility} item={item} songs={songs} /> : null}
                  {!hasRelationalResponsibility && item.type === "song" ? <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span> : null}
                  {!hasRelationalResponsibility && item.type === "text" ? <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span> : null}
                  {hasRelationalResponsibility ? <ResponsibilitySummary assignments={responsibleAssignments} compact /> : null}
                  {item.type !== "text" && item.type !== "song" && item.planned_duration_seconds ? <p className="mt-0.5 text-xs text-zinc-500 lg:hidden">{formatDuration(item.planned_duration_seconds)}</p> : null}
                  {isAdmin ? <div className="mt-2 flex items-center gap-4 lg:hidden"><button type="button" onClick={(event) => { event.stopPropagation(); openItemEditor(item); }} disabled={isSaving} className="min-h-10 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-40">Editar</button>{item.type === "song" ? <button type="button" onClick={(event) => { event.stopPropagation(); openSongChanger(item); }} disabled={isSaving} className="min-h-10 text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-40">Cambiar</button> : null}</div> : null}
                  </div>
                </div>
                {!hasRelationalResponsibility ? <DesktopAssignedMicrophones assignmentText={item.type === "worship" ? "" : item.details ?? ""} assignments={serviceTeamAssignments} teamMembers={teamMembers} showEmpty={item.type !== "worship"} /> : <div className="hidden lg:block" />}
                <DesktopServiceKeyBadge songKey={item.type === "song" ? findOperationalSongEntry(operationalEntries, item.id)?.effectiveKey : null} editable={isAdmin} onClick={item.type === "song" && item.song_id ? () => setKeySelector({ itemId: item.id, songId: item.song_id! }) : undefined} />
                {isAdmin ? <button type="button" onClick={(event) => { event.stopPropagation(); openItemEditor(item); }} disabled={isSaving} className="hidden min-h-11 items-center justify-center text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-40 lg:inline-flex">Editar</button> : <span className="hidden lg:block" />}
                {isAdmin && item.type === "song" ? <button type="button" onClick={(event) => { event.stopPropagation(); openSongChanger(item); }} disabled={isSaving} className="hidden min-h-11 items-center justify-center text-xs font-semibold text-emerald-400 transition-colors hover:text-emerald-300 disabled:opacity-40 lg:inline-flex">Cambiar</button> : <span className="hidden lg:block" />}
                <div className="col-start-3 row-start-1 flex items-center justify-end gap-0.5 lg:contents">
                {item.type === "song" ? <MobileSongKey item={item} isEditable={isAdmin} onOpen={setKeySelector} operationalEntries={operationalEntries} songs={songs} /> : null}
                {isAdmin ? (
                  <details className="relative shrink-0">
                    <summary aria-label={`Acciones para ${item.title}`} className="grid size-10 cursor-pointer list-none place-items-center rounded-xl text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 lg:size-11 [&::-webkit-details-marker]:hidden">⋮</summary>
                    <div className="absolute right-0 z-20 mt-1 min-w-36 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40">
                      <button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); setEditingItemNote({ itemId: item.id, title: item.title, notes: itemNotes.find((note) => note.service_item_id === item.id)?.notes ?? "" }); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Notas operacionales</button>
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
                        className={`grid min-h-[3.75rem] grid-cols-[4rem_minmax(0,1fr)_auto] items-start gap-x-1.5 px-0 py-1.5 transition-colors duration-200 lg:min-h-14 lg:grid-cols-[112px_76px_minmax(0,1fr)_minmax(110px,0.42fr)_72px_auto_auto] lg:items-center lg:gap-x-3 lg:px-3 lg:py-1.5 ${isAdmin ? "cursor-grab active:cursor-grabbing" : ""} ${selectedRow?.songId === entry.songId ? "bg-emerald-400/[0.07]" : draggedSong?.songId === entry.songId ? "bg-emerald-400/[0.04] text-emerald-300" : ""}`}
                      >
                        <MobileScheduleTime value={schedule.times.get(`${item.id}:${entry.songId}`) ?? "—"} />
                        <span className="hidden text-sm tabular-nums text-zinc-400 lg:block">{formatDuration(getSongDurationSeconds(entry, song.duration) ?? 0)}</span>
                        <div className="col-start-2 flex min-w-0 items-center gap-2.5 lg:col-start-3 lg:gap-3">
                          <SongCover src={song.cover_url} alt="" width={48} height={48} className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/[0.08] lg:size-11" />
                          <div className="min-w-0 flex-1">
                          <Link href={`/song/${song.id}?service=${serviceId}`} onClick={(event) => event.stopPropagation()} className="line-clamp-1 text-[0.9375rem] font-semibold leading-5 text-white transition-colors duration-200 hover:text-emerald-300 lg:text-base lg:leading-6 lg:text-zinc-200">{song.title}</Link>
                          <MobileWorshipSongMetadata song={song} entry={entry} />
                          <span className="lg:hidden"><AssignedMicrophonesLine assignmentText={entry.notes} assignments={serviceTeamAssignments} teamMembers={teamMembers} /></span>
                          <DesktopSongMetadata song={song} entry={entry} />
                          </div>
                        </div>
                        <DesktopAssignedMicrophones assignmentText={entry.notes} assignments={serviceTeamAssignments} teamMembers={teamMembers} showEmpty />
                        <DesktopServiceKeyBadge songKey={findOperationalSongEntry(operationalEntries, item.id, song.id)?.effectiveKey} editable={isAdmin} onClick={() => setKeySelector({ itemId: item.id, songId: song.id })} />
                        <div className="col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-0.5 lg:col-start-6">
                          <MobileKeyBadge songKey={findOperationalSongEntry(operationalEntries, item.id, song.id)?.effectiveKey} editable={isAdmin} onClick={() => setKeySelector({ itemId: item.id, songId: song.id })} />
                          <div className="hidden lg:block"><ResourceIndicators song={song} /></div>
                          {isAdmin ? <details className="relative shrink-0"><summary aria-label={`Más acciones para ${song.title}`} onClick={(event) => event.stopPropagation()} className="grid size-10 cursor-pointer list-none place-items-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400 lg:size-11 [&::-webkit-details-marker]:hidden">⋯</summary><div className="absolute bottom-full right-0 z-20 mb-1 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl shadow-black/40"><button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); setEditingSong({ blockId: item.id, songId: entry.songId, notes: entry.notes, plannedDuration: formatDurationInput(entry.plannedDurationSeconds) }); }} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-zinc-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-emerald-400">Editar notas y duración</button><button type="button" onClick={(event) => { event.stopPropagation(); event.currentTarget.closest("details")?.removeAttribute("open"); removeSongFromBlock(item.id, entry.songId); }} disabled={isSaving} className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/[0.08] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-rose-400">Eliminar canción</button></div></details> : null}
                        </div>
                        {isAdmin ? <GripIcon label={`Drag ${song.title} to reorder`} className="hidden size-3.5 text-zinc-600 lg:col-start-7 lg:block" /> : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {isAdmin && item.type === "worship" ? (
                <button type="button" aria-label={`Agregar canción a ${item.title}`} onClick={() => setSongSelectorBlockId(item.id)} className="mt-3 min-h-11 rounded-xl px-3 text-sm font-medium text-emerald-400/80 transition-colors hover:bg-emerald-400/[0.06] hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400 md:mt-1 lg:ml-[188px] lg:min-h-8 lg:py-1 lg:text-xs">+ Agregar canción</button>
              ) : null}
            </article>
            );
          })}
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
            {selectedOperationalSong?.effectiveKey ? isAdmin && selectedSong ? (
              <div><dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">Tonalidad</dt><dd className="mt-1.5"><ServiceKeyTrigger songKey={selectedOperationalSong.effectiveKey} onClick={() => setKeySelector({ itemId: selectedItem.id, songId: selectedSong.id })} /></dd></div>
            ) : <Detail label="Tonalidad" value={selectedOperationalSong.effectiveKey} /> : null}
            {selectedSong?.bpm ? <Detail label="BPM" value={String(selectedSong.bpm)} /> : null}
            {selectedSong?.time_signature ? <Detail label="Compás" value={selectedSong.time_signature} /> : null}
            <Detail label="Duración" value={selectedSong ? formatDuration(selectedEntry ? getSongDurationSeconds(selectedEntry, selectedSong.duration) ?? 0 : getSongDurationSeconds({ plannedDurationSeconds: selectedItem.planned_duration_seconds }, selectedSong.duration) ?? 0) : selectedItem.planned_duration_seconds ? formatDuration(selectedItem.planned_duration_seconds) : "—"} />
            {selectedSong ? <Detail label="Origen de duración" value={selectedEntry ? hasSongDurationOverride(selectedEntry) ? "Personalizada" : "Biblioteca" : selectedItem.planned_duration_seconds ? "Personalizada" : "Biblioteca"} /> : null}
            {(selectedEntry?.notes || (!selectedHasRelationalResponsibility && selectedItem.details)) ? <Detail label="Notas / responsable" value={selectedEntry?.notes || selectedItem.details || "—"} /> : null}
            {(selectedEntry?.notes || (!selectedHasRelationalResponsibility && selectedItem.details)) ? <Detail label="Micrófono" value={getServiceEntryMicrophones(serviceTeamAssignments, selectedEntry?.notes || selectedItem.details || "", teamMembers).join(" · ") || "—"} /> : null}
          </dl>
          {selectedResponsibleAssignments.length ? <section className="mt-7 border-t border-white/[0.07] pt-5"><h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">Responsables</h3><ResponsibilitySummary assignments={selectedResponsibleAssignments} /></section> : null}
          {authenticated ? <div className="mt-7 border-t border-white/[0.07] pt-5"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600">Notas operacionales</p>{isAdmin ? <button type="button" onClick={() => setEditingItemNote({ itemId: selectedItem.id, title: selectedItem.title, notes: selectedItemNote })} className="min-h-8 rounded-lg px-2 text-xs font-semibold text-emerald-400 hover:bg-emerald-400/[0.07]">{selectedItemNote ? "Editar notas" : "Agregar notas"}</button> : null}</div>{selectedItemNote ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{selectedItemNote}</p> : <p className="mt-2 text-sm text-zinc-600">Sin notas para este elemento.</p>}</div> : null}
          {isAdmin ? <div className="mt-8 space-y-2"><button type="button" onClick={() => selectedItem.type === "song" ? openSongItemEditor(selectedItem) : selectedSong && selectedEntry ? setEditingSong({ blockId: selectedItem.id, songId: selectedSong.id, notes: selectedEntry.notes, plannedDuration: formatDurationInput(selectedEntry.plannedDurationSeconds) }) : selectedItem.type === "text" ? setEditingText({ id: selectedItem.id, title: selectedItem.title, details: selectedItem.details ?? "", plannedDuration: formatDurationInput(selectedItem.planned_duration_seconds), responsibilityIds: responsibilityIdsForItem(selectedItem.id) }) : setEditingWorship({ id: selectedItem.id, title: selectedItem.title, plannedDuration: formatDurationInput(selectedItem.planned_duration_seconds), responsibilityIds: responsibilityIdsForItem(selectedItem.id) })} className="min-h-10 w-full rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/[0.05]">Editar</button><button type="button" onClick={() => setDeletingItem(selectedItem)} className="min-h-10 w-full rounded-lg px-4 text-sm font-semibold text-rose-300 hover:bg-rose-400/[0.08]">Eliminar</button></div> : null}
      </aside> : null}

      {isAdmin && keySelector && keySelectorSong && keySelectorEntry?.kind === "song" ? (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setKeySelector(null)}>
          <section role="dialog" aria-modal="true" aria-labelledby="service-key-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><h2 id="service-key-title" className="text-base font-semibold text-white">Tonalidad para este servicio</h2><p className="mt-1 text-xs text-zinc-500">Original: {keySelectorSong.key}</p></div><button type="button" onClick={() => setKeySelector(null)} className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-white" aria-label="Cerrar">×</button></div>
            <div className="mt-4 grid grid-cols-4 gap-2">{keyOptions.map((key) => <button key={key} type="button" disabled={isSaving} onClick={() => setServiceSongKey(keySelector.itemId, keySelector.songId, key === keySelectorSong.key ? null : key)} className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${keySelectorEntry.effectiveKey === key ? "border-emerald-400/50 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-zinc-300 hover:bg-white/[0.05]"}`}>{key}</button>)}</div>
            <button type="button" disabled={isSaving} onClick={() => setServiceSongKey(keySelector.itemId, keySelector.songId, null)} className="mt-3 min-h-11 w-full rounded-xl border border-white/10 px-3 text-sm font-semibold text-zinc-300 hover:bg-white/[0.05] disabled:opacity-40">Usar tonalidad original</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingItemNote ? <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" onClick={() => setEditingItemNote(null)}><section role="dialog" aria-modal="true" aria-labelledby="item-note-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-emerald-400">Notas operacionales</p><h2 id="item-note-title" className="mt-1 text-lg font-semibold text-white">{editingItemNote.title}</h2></div><button type="button" onClick={() => setEditingItemNote(null)} className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.05] hover:text-white" aria-label="Cerrar">×</button></div><label className="mt-4 block"><span className="sr-only">Notas</span><textarea autoFocus rows={5} value={editingItemNote.notes} onChange={(event) => setEditingItemNote({ ...editingItemNote, notes: event.target.value })} placeholder="Talking points e instrucciones para este momento" className="min-h-28 w-full resize-y rounded-xl border border-white/10 bg-zinc-950/70 px-3 py-3 text-base leading-6 text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" /></label><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setEditingItemNote(null)} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-zinc-400 hover:bg-white/[0.05]">Cancelar</button><button type="button" onClick={() => void saveItemNote()} disabled={isSaving} className="min-h-11 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-zinc-950 hover:bg-emerald-300 disabled:opacity-40">{isSaving ? "Guardando…" : "Guardar"}</button></div></section></div> : null}

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
          <section role="dialog" aria-modal="true" aria-labelledby="add-service-item-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
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
                <ResponsibilityEditor assignments={serviceTeamAssignments} onChange={setSongResponsibilityIds} selectedIds={songResponsibilityIds} serviceId={serviceId} />
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
                  <textarea value={textDetails} onChange={(event) => setTextDetails(event.target.value)} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
                </label>
                <ResponsibilityEditor assignments={serviceTeamAssignments} onChange={setTextResponsibilityIds} selectedIds={textResponsibilityIds} serviceId={serviceId} />
                <PlannedDurationField value={textPlannedDuration} onChange={setTextPlannedDuration} />
                <PrimaryButton type="submit" disabled={isSaving || !textTitle.trim()} className="w-full">Agregar momento</PrimaryButton>
              </form>
            )}
            <button type="button" onClick={() => { closeSongItemComposer(); setTextTitle(""); setTextDetails(""); setTextResponsibilityIds([]); setTextPlannedDuration(""); }} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancelar</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingText ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-text-item-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-text-item-title" className="text-2xl font-bold tracking-tight text-white">Editar texto</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateTextItem(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Title</span>
                <input autoFocus required value={editingText.title} onChange={(event) => setEditingText({ ...editingText, title: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Details <span className="font-normal text-zinc-500">(optional)</span></span>
                <textarea value={editingText.details} onChange={(event) => setEditingText({ ...editingText, details: event.target.value })} rows={3} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <ResponsibilityEditor assignments={serviceTeamAssignments} onChange={(responsibilityIds) => setEditingText({ ...editingText, responsibilityIds })} selectedIds={editingText.responsibilityIds} serviceId={serviceId} />
              <PlannedDurationField value={editingText.plannedDuration} onChange={(plannedDuration) => setEditingText({ ...editingText, plannedDuration })} />
              <PrimaryButton type="submit" disabled={isSaving || !editingText.title.trim()} className="w-full">Save Changes</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingText(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancel</button>
          </section>
        </div>
      ) : null}

      {isAdmin && editingWorship ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="edit-worship-block-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-worship-block-title" className="text-2xl font-bold tracking-tight text-white">Editar bloque de alabanza</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateWorshipBlock(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Título</span>
                <input autoFocus required value={editingWorship.title} onChange={(event) => setEditingWorship({ ...editingWorship, title: event.target.value })} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <ResponsibilityEditor assignments={serviceTeamAssignments} onChange={(responsibilityIds) => setEditingWorship({ ...editingWorship, responsibilityIds })} selectedIds={editingWorship.responsibilityIds} serviceId={serviceId} />
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
          <section role="dialog" aria-modal="true" aria-labelledby="edit-song-item-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="edit-song-item-title" className="text-2xl font-bold tracking-tight text-white">Editar canción</h2>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void updateSongItem(); }}>
              <label className="block"><span className="mb-2 block text-sm font-semibold text-zinc-300">Detalles heredados <span className="font-normal text-zinc-500">(opcional)</span></span><textarea value={editingSongItem.details} onChange={(event) => setEditingSongItem({ ...editingSongItem, details: event.target.value })} rows={2} className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-950/60 px-4 py-3 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" /></label>
              <ResponsibilityEditor assignments={serviceTeamAssignments} onChange={(responsibilityIds) => setEditingSongItem({ ...editingSongItem, responsibilityIds })} selectedIds={editingSongItem.responsibilityIds} serviceId={serviceId} />
              <PlannedDurationField value={editingSongItem.plannedDuration} onChange={(plannedDuration) => setEditingSongItem({ ...editingSongItem, plannedDuration })} />
              {editingSongItem.plannedDuration ? <button type="button" onClick={() => setEditingSongItem({ ...editingSongItem, plannedDuration: "" })} className="min-h-11 text-sm font-semibold text-emerald-400 transition-colors hover:text-emerald-300">Usar duración original</button> : null}
              <PrimaryButton type="submit" disabled={isSaving} className="w-full">{isSaving ? "Guardando..." : "Guardar"}</PrimaryButton>
            </form>
            <button type="button" onClick={() => setEditingSongItem(null)} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white">Cancelar</button>
          </section>
        </div>
      ) : null}

      {isAdmin && changingSongItem ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/70 px-4 py-3 backdrop-blur-sm" role="presentation" onClick={() => { if (!isSaving) closeSongChanger(); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="change-song-item-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7" onClick={(event) => event.stopPropagation()}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-400/80">Orden del servicio</p>
            <h2 id="change-song-item-title" className="mt-2 text-2xl font-bold tracking-tight text-white">Cambiar canción</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Reemplaza <span className="font-semibold text-zinc-200">{changingSongItem.title}</span> en esta misma posición del servicio.</p>
            <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void changeSongItem(); }}>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Buscar canción</span>
                <input autoFocus value={songSearch} onChange={(event) => { setSongSearch(event.target.value); setSelectedSongId(""); }} placeholder="Título o artista" className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]" />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-zinc-300">Biblioteca</span>
                <select required value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)} className="min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]">
                  <option value="">Selecciona una canción</option>
                  {filterSongs(songs, songSearch).filter((song) => song.id !== changingSongItem.song_id).map((song) => <option key={song.id} value={song.id}>{song.title} · {song.artist}</option>)}
                </select>
              </label>
              {selectedSongId ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-xs text-zinc-400">Duración de biblioteca: <span className="font-semibold text-zinc-200">{songs.find((song) => song.id === selectedSongId)?.duration || "—"}</span></p> : null}
              <PrimaryButton type="submit" disabled={isSaving || !selectedSongId} className="w-full">{isSaving ? "Cambiando..." : "Cambiar canción"}</PrimaryButton>
            </form>
            <button type="button" onClick={closeSongChanger} disabled={isSaving} className="mt-4 min-h-11 w-full rounded-full text-sm font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-white disabled:opacity-40">Cancelar</button>
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

function ResponsibilityEditor({ assignments, onChange, selectedIds, serviceId }: { assignments: CurrentServiceTeamMember[]; onChange: (ids: string[]) => void; selectedIds: string[]; serviceId: number }) {
  const selected = selectedIds.flatMap((id) => {
    const assignment = assignments.find((item) => item.id === id);
    return assignment ? [assignment] : [];
  });
  const available = assignments.filter((assignment) => !selectedIds.includes(assignment.id));

  if (!assignments.length) return <section className="rounded-2xl border border-dashed border-white/10 p-4"><h3 className="text-sm font-semibold text-zinc-300">Responsables</h3><p className="mt-2 text-sm leading-6 text-zinc-500">No hay personas asignadas al equipo de este servicio.</p><Link href={`/admin/service-team?service=${serviceId}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-emerald-400 hover:text-emerald-300">Ir a Equipo del servicio →</Link></section>;

  function move(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= selectedIds.length) return;
    const next = [...selectedIds];
    [next[index], next[otherIndex]] = [next[otherIndex], next[index]];
    onChange(next);
  }

  return <fieldset className="min-w-0"><legend className="text-sm font-semibold text-zinc-300">Responsables</legend>{selected.length ? <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">{selected.map((assignment, index) => <div key={assignment.id} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-white">{assignment.person_name}</p><p className="mt-0.5 text-xs text-zinc-400">{assignment.role_name}</p>{getAssignmentResourceNames(assignment).length ? <p className="mt-1 text-xs leading-5 text-zinc-500">{getAssignmentResourceNames(assignment).join(" · ")}</p> : null}</div><button type="button" onClick={() => onChange(selectedIds.filter((id) => id !== assignment.id))} aria-label={`Quitar ${assignment.person_name} — ${assignment.role_name}`} className="grid size-10 shrink-0 place-items-center rounded-lg text-zinc-500 hover:bg-white/[0.06] hover:text-rose-300">×</button></div>{selected.length > 1 ? <div className="mt-2 flex gap-1 border-t border-white/[0.06] pt-2"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-30">Subir</button><button type="button" onClick={() => move(index, 1)} disabled={index === selected.length - 1} className="min-h-9 rounded-lg px-3 text-xs font-semibold text-zinc-400 hover:bg-white/[0.05] disabled:opacity-30">Bajar</button></div> : null}</div>)}</div> : <p className="mt-2 text-sm text-zinc-500">Sin responsables seleccionados.</p>}{available.length ? <label className="mt-3 block text-xs font-semibold text-zinc-500">Agregar responsable<select value="" onChange={(event) => { if (event.target.value) onChange([...selectedIds, event.target.value]); }} className="mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-emerald-400/50"><option value="">Seleccionar asignación</option>{available.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.person_name} — {assignment.role_name}</option>)}</select></label> : null}</fieldset>;
}

function ResponsibilitySummary({ assignments, compact = false }: { assignments: CurrentServiceTeamMember[]; compact?: boolean }) {
  return <div className={compact ? "mt-1 space-y-1" : "mt-3 space-y-3"}>{assignments.map((assignment) => <div key={assignment.id} className={compact ? "min-w-0 text-xs leading-5" : "rounded-xl border border-white/[0.07] p-3"}><p className={`font-semibold ${compact ? "truncate text-zinc-300" : "text-zinc-100"}`}>{assignment.person_name}<span className="font-normal text-zinc-500"> · {assignment.role_name}</span></p>{getAssignmentResourceNames(assignment).length ? <p className={`${compact ? "truncate" : "mt-1 leading-5"} text-zinc-500`}>{getAssignmentResourceNames(assignment).join(" · ")}</p> : null}</div>)}</div>;
}

function getResponsibleAssignments(itemId: string, responsibilities: ServiceItemResponsibilityRow[], assignments: CurrentServiceTeamMember[]) {
  return responsibilities.filter((entry) => entry.service_item_id === itemId).sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at)).flatMap((entry) => {
    const assignment = assignments.find((item) => item.id === entry.service_team_assignment_id);
    return assignment ? [assignment] : [];
  });
}

function getAssignmentResourceNames(assignment: CurrentServiceTeamMember) {
  return Array.from(new Set([...assignment.resources.map((resource) => resource.name), assignment.microphone_name].filter((value): value is string => Boolean(value?.trim()))));
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
  return <span className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-zinc-400 lg:text-zinc-300" title={label}><Mic aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-zinc-500 lg:text-zinc-400" strokeWidth={1.75} /><span className="min-w-0 break-words">{label}</span></span>;
}

function DesktopSongMetadata({ song, entry }: { song: ServiceSong; entry: WorshipSongEntry }) {
  const assignment = parseAssignmentText(entry.notes);
  const metadata = [song.artist, song.bpm ? `${song.bpm} BPM` : null, song.time_signature, assignment.name, assignment.role].filter((value): value is string => Boolean(value));
  return <DesktopSongMetadataLine metadata={metadata} />;
}

function DirectSongItemMetadata({ hasRelationalResponsibility, item, songs }: { hasRelationalResponsibility: boolean; item: ServiceItem; songs: ServiceSong[] }) {
  const song = item.song_id ? songs.find((candidate) => candidate.id === item.song_id) : null;
  if (!song) return <p className="mt-1 text-xs text-rose-300">Canción no disponible</p>;
  const assignment = parseAssignmentText(item.details ?? "");
  const metadata = [song.artist, song.bpm ? `${song.bpm} BPM` : null, song.time_signature, ...(!hasRelationalResponsibility ? [assignment.name, assignment.role] : [])].filter((value): value is string => Boolean(value));
  const duration = getSongDurationSeconds({ plannedDurationSeconds: item.planned_duration_seconds }, song.duration);
  const mobileMetadata = [song.artist, ...(!hasRelationalResponsibility ? [assignment.name, assignment.role] : []), duration ? formatDuration(duration) : null].filter(Boolean);
  return <><p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{mobileMetadata.join(" · ")}</p><DesktopSongMetadataLine metadata={metadata} /></>;
}

function DesktopSongMetadataLine({ metadata }: { metadata: string[] }) {
  if (metadata.length === 0) return null;
  return <div className="mt-0.5 hidden min-w-0 items-center text-xs text-zinc-500 lg:flex" title={metadata.join(" · ")}><span className="truncate">{metadata.join(" · ")}</span></div>;
}

function DesktopServiceKeyBadge({ songKey, editable, onClick }: { songKey?: string | null; editable: boolean; onClick?: () => void }) {
  return <div className="hidden items-center justify-end lg:flex">{songKey?.trim() ? editable && onClick ? <ServiceKeyTrigger songKey={songKey} onClick={onClick} compact /> : <span className="inline-grid size-8 shrink-0 place-items-center rounded-full border border-emerald-400/30 bg-emerald-400/[0.06] text-xs font-bold text-emerald-300" title={`Tonalidad ${songKey}`}>{songKey}</span> : null}</div>;
}

function MobileSongKey({ item, isEditable, onOpen, operationalEntries, songs }: { item: ServiceItem; isEditable: boolean; onOpen: (target: { itemId: string; songId: string }) => void; operationalEntries: ReturnType<typeof buildOperationalServiceEntries<ServiceSong>>; songs: ServiceSong[] }) {
  if (!item.song_id) return null;
  const song = songs.find((candidate) => candidate.id === item.song_id);
  const entry = operationalEntries.find((candidate) => candidate.kind === "song" && candidate.item.id === item.id);
  return <MobileKeyBadge songKey={entry?.kind === "song" ? entry.effectiveKey : song?.key} editable={isEditable} onClick={() => onOpen({ itemId: item.id, songId: item.song_id! })} />;
}

function findOperationalSongEntry(entries: ReturnType<typeof buildOperationalServiceEntries<ServiceSong>>, itemId: string, songId?: string) {
  return entries.find((entry): entry is Extract<(typeof entries)[number], { kind: "song" }> => entry.kind === "song" && entry.item.id === itemId && (!songId || entry.song.id === songId));
}

function MobileKeyBadge({ songKey, editable = false, onClick }: { songKey?: string | null; editable?: boolean; onClick?: () => void }) {
  if (!songKey?.trim()) return null;
  const className = "grid min-h-8 min-w-8 place-items-center rounded-full border border-emerald-400/25 px-1.5 text-xs font-bold text-emerald-300 lg:hidden";
  return editable ? <button type="button" onClick={(event) => { event.stopPropagation(); onClick?.(); }} className={className} title={`Cambiar tonalidad ${songKey}`}>{songKey}</button> : <span className={className} title={`Tonalidad ${songKey}`}>{songKey}</span>;
}

function ServiceKeyTrigger({
  songKey,
  onClick,
  compact = false,
}: {
  songKey: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`inline-grid shrink-0 place-items-center border border-emerald-400/30 bg-emerald-400/[0.06] text-xs font-bold text-emerald-300 transition-colors hover:border-emerald-400/50 hover:bg-emerald-400/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${
        compact
          ? "size-8 rounded-full p-0"
          : "min-h-8 min-w-8 rounded-lg px-2"
      }`}
      title={`Cambiar tonalidad ${songKey}`}
    >
      {songKey}
    </button>
  );
}

function MobileWorshipSongMetadata({ song, entry }: { song: ServiceSong; entry: WorshipSongEntry }) {
  const assignment = parseAssignmentText(entry.notes);
  const duration = getSongDurationSeconds(entry, song.duration);
  const metadata = [song.artist, assignment.name, assignment.role, duration ? formatDuration(duration) : null].filter(Boolean);
  return metadata.length ? <p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{metadata.join(" · ")}</p> : null;
}

function MobileTextItemMetadata({ details, duration, hasRelationalResponsibility }: { details: string; duration?: number | null; hasRelationalResponsibility: boolean }) {
  const assignment = parseAssignmentText(details);
  const metadata = [...(!hasRelationalResponsibility ? [assignment.name, assignment.role] : []), duration ? formatDuration(duration) : null].filter(Boolean);
  return metadata.length ? <p className="mt-0.5 truncate text-xs leading-4 text-zinc-500 lg:hidden">{metadata.join(" · ")}</p> : null;
}

function OrderSchedule({ index, type, value }: { index: number; type: ServiceItem["type"]; value: string }) {
  const label = type === "song" ? "Canción" : type === "worship" ? "Bloque" : "Momento";
  return <span className="flex min-w-0 flex-col justify-center py-1 text-left lg:py-0"><span className={`text-xl font-medium leading-6 tabular-nums tracking-[-0.045em] ${type === "song" ? "text-zinc-200" : "text-zinc-400"}`}>{String(index + 1).padStart(2, "0")}</span><span className={`mt-0.5 text-[0.5rem] font-bold uppercase tracking-[0.15em] ${type === "song" ? "text-emerald-400/60" : "text-zinc-600"}`}>{label}</span>{value ? <span className="mt-1 whitespace-nowrap text-[0.6875rem] font-medium tabular-nums text-zinc-600 lg:text-zinc-500">{value}</span> : null}</span>;
}

function MobileScheduleTime({ value, hidden = false }: { value: string; hidden?: boolean }) {
  const match = value.match(/^(\d{1,2}:\d{2})(?::\d{2})?\s*([AP]M)?$/i);
  const time = match?.[1] ?? value;
  const period = match?.[2]?.toLocaleUpperCase();
  return <span className={`${hidden ? "hidden lg:block" : ""} whitespace-nowrap pt-0.5 text-[0.8125rem] font-medium tabular-nums text-zinc-400 lg:pt-0 lg:text-sm`}><span className="lg:hidden">{time}{period ? <span className="ml-0.5 text-[0.5625rem] text-zinc-500">{period}</span> : null}</span><span className="hidden lg:inline">{value}</span></span>;
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
