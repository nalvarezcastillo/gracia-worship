"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/ui/action-button";
import type { MicrophoneAssignment } from "@/lib/microphones";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const inputStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/60 px-4 text-base text-white outline-none placeholder:text-zinc-600 focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function ManageMicrophones({ initialAssignments, loadError }: { initialAssignments: MicrophoneAssignment[]; loadError: string | null }) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [leaderName, setLeaderName] = useState("");
  const [microphoneName, setMicrophoneName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function requireSession() {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error("Tu sesión expiró. Inicia sesión nuevamente.");
    return supabase;
  }

  function readableDatabaseError(error: unknown, fallback: string) {
    if (error && typeof error === "object" && "code" in error) {
      const code = String(error.code);
      if (code === "PGRST205" || code === "42P01") {
        return "La tabla de micrófonos no existe. Ejecuta supabase/microphone_assignments.sql en Supabase.";
      }
      if (code === "42501") return "Tu usuario no tiene permiso para modificar los micrófonos.";
    }
    return error instanceof Error && error.message ? error.message : fallback;
  }

  function logSupabaseError(operation: string, error: unknown) {
    const databaseError = error && typeof error === "object" ? error as Record<string, unknown> : {};
    console.error(`Microphone assignment ${operation} failed:`, {
      code: databaseError.code ?? null,
      message: databaseError.message ?? (error instanceof Error ? error.message : String(error)),
      details: databaseError.details ?? null,
      hint: databaseError.hint ?? null,
      status: databaseError.status ?? null,
    });
  }

  async function addAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const leader = leaderName.trim();
    const microphone = microphoneName.trim();
    if (!leader || !microphone) {
      setIsError(true);
      setMessage("Escribe el nombre del líder y el micrófono.");
      return;
    }

    setBusyId("new");
    setMessage("");
    try {
      const supabase = await requireSession();
      const position = assignments.reduce((highest, item) => Math.max(highest, item.position), -1) + 1;
      const { data, error } = await supabase
        .from("microphone_assignments")
        .insert({ leader_name: leader, microphone_name: microphone, position })
        .select("id, leader_name, microphone_name, position")
        .single();
      if (error) throw error;

      setAssignments((current) => [...current, data as MicrophoneAssignment]);
      setLeaderName("");
      setMicrophoneName("");
      setIsError(false);
      setMessage("Asignación añadida.");
    } catch (error) {
      logSupabaseError("insert", error);
      setIsError(true);
      setMessage(readableDatabaseError(error, "No se pudo añadir la asignación."));
    } finally {
      setBusyId(null);
    }
  }

  function editAssignment(id: string, field: "leader_name" | "microphone_name", value: string) {
    setAssignments((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
    setMessage("");
  }

  async function saveAssignment(assignment: MicrophoneAssignment) {
    const leader = assignment.leader_name.trim();
    const microphone = assignment.microphone_name.trim();
    if (!leader || !microphone) {
      setIsError(true);
      setMessage("Los dos campos son obligatorios.");
      return;
    }

    setBusyId(assignment.id);
    setMessage("");
    try {
      const supabase = await requireSession();
      const { error } = await supabase
        .from("microphone_assignments")
        .update({ leader_name: leader, microphone_name: microphone })
        .eq("id", assignment.id);
      if (error) throw error;

      setAssignments((current) => current.map((item) => item.id === assignment.id ? { ...item, leader_name: leader, microphone_name: microphone } : item));
      setIsError(false);
      setMessage("Asignación guardada.");
    } catch (error) {
      logSupabaseError("update", error);
      setIsError(true);
      setMessage(readableDatabaseError(error, "No se pudo guardar la asignación."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeAssignment(assignment: MicrophoneAssignment) {
    setBusyId(assignment.id);
    setMessage("");
    try {
      const supabase = await requireSession();
      const { error } = await supabase.from("microphone_assignments").delete().eq("id", assignment.id);
      if (error) throw error;

      setAssignments((current) => current.filter((item) => item.id !== assignment.id));
      setIsError(false);
      setMessage("Asignación eliminada.");
    } catch (error) {
      logSupabaseError("delete", error);
      setIsError(true);
      setMessage(readableDatabaseError(error, "No se pudo eliminar la asignación."));
    } finally {
      setBusyId(null);
    }
  }

  async function moveAssignment(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (otherIndex < 0 || otherIndex >= assignments.length) return;

    const assignment = assignments[index];
    const otherAssignment = assignments[otherIndex];
    setBusyId(assignment.id);
    setMessage("");
    try {
      const supabase = await requireSession();
      const { error: firstError } = await supabase
        .from("microphone_assignments")
        .update({ position: otherAssignment.position })
        .eq("id", assignment.id);
      if (firstError) throw firstError;

      const { error: secondError } = await supabase
        .from("microphone_assignments")
        .update({ position: assignment.position })
        .eq("id", otherAssignment.id);
      if (secondError) throw secondError;

      setAssignments((current) => {
        const reordered = [...current];
        reordered[index] = { ...otherAssignment, position: assignment.position };
        reordered[otherIndex] = { ...assignment, position: otherAssignment.position };
        return reordered;
      });
      setIsError(false);
      setMessage("Orden actualizado.");
    } catch (error) {
      logSupabaseError("reorder", error);
      setIsError(true);
      setMessage(readableDatabaseError(error, "No se pudo cambiar el orden."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8 space-y-6 sm:mt-10">
      {loadError ? (
        <p role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-4 text-sm leading-6 text-rose-200">
          {loadError}
        </p>
      ) : null}
      <form onSubmit={addAssignment} className="rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-4 shadow-xl shadow-black/10 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-zinc-300">
            Líder
            <input value={leaderName} onChange={(event) => setLeaderName(event.target.value)} placeholder="Ej. Nelson" className={`mt-2 ${inputStyles}`} />
          </label>
          <label className="text-sm font-semibold text-zinc-300">
            Micrófono
            <input value={microphoneName} onChange={(event) => setMicrophoneName(event.target.value)} placeholder="Ej. Micrófono 1" className={`mt-2 ${inputStyles}`} />
          </label>
        </div>
        <PrimaryButton type="submit" disabled={busyId !== null || Boolean(loadError)} className="mt-5 w-full sm:w-auto">
          {busyId === "new" ? "Agregando…" : "Agregar asignación"}
        </PrimaryButton>
      </form>

      <section>
        <h2 className="text-lg font-bold text-white">Asignaciones actuales</h2>
        {assignments.length > 0 ? (
          <div className="mt-3 space-y-3">
            {assignments.map((assignment, index) => (
              <div key={assignment.id} className="rounded-2xl border border-white/[0.07] bg-zinc-900/60 p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Líder
                    <input value={assignment.leader_name} onChange={(event) => editAssignment(assignment.id, "leader_name", event.target.value)} className={`mt-2 ${inputStyles}`} />
                  </label>
                  <label className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Micrófono
                    <input value={assignment.microphone_name} onChange={(event) => editAssignment(assignment.id, "microphone_name", event.target.value)} className={`mt-2 ${inputStyles}`} />
                  </label>
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" aria-label={`Subir ${assignment.leader_name}`} onClick={() => void moveAssignment(index, -1)} disabled={busyId !== null || index === 0} className="min-h-11 rounded-full px-4 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40">↑</button>
                  <button type="button" aria-label={`Bajar ${assignment.leader_name}`} onClick={() => void moveAssignment(index, 1)} disabled={busyId !== null || index === assignments.length - 1} className="min-h-11 rounded-full px-4 text-sm font-semibold text-zinc-300 hover:bg-white/5 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => void saveAssignment(assignment)} disabled={busyId !== null} className="min-h-11 rounded-full bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 disabled:opacity-40">Guardar</button>
                  <button type="button" onClick={() => void removeAssignment(assignment)} disabled={busyId !== null} className="min-h-11 rounded-full px-4 text-sm font-semibold text-rose-300 hover:bg-rose-400/10 disabled:opacity-40">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-zinc-500">No hay micrófonos asignados.</p>
        )}
      </section>

      <p role="status" aria-live="polite" className={`min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
    </div>
  );
}
