"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppSectionCard } from "@/components/app-section-card";
import { AppActionBar } from "@/components/app-action-bar";
import { PrimaryButton } from "@/components/ui/action-button";
import { appFieldStyles } from "@/components/ui/styles";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CurrentServiceSettingsProps = {
  initialDate: string;
  initialName: string;
  initialTime: string;
  initialLeaderNotes: string;
  serviceId: number;
};

export function CurrentServiceSettings({ initialDate, initialName, initialTime, initialLeaderNotes, serviceId }: CurrentServiceSettingsProps) {
  const router = useRouter();
  const [serviceName, setServiceName] = useState(initialName);
  const [serviceDate, setServiceDate] = useState(initialDate);
  const [serviceTime, setServiceTime] = useState(() => toTimeInputValue(initialTime));
  const [leaderNotes, setLeaderNotes] = useState(initialLeaderNotes);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = serviceName.trim();
    const time = serviceTime.trim();
    if (!name || !time) return;

    setIsSaving(true);
    setMessage("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session) throw new Error("Tu sesión venció. Inicia sesión nuevamente.");

      const { data, error, status } = await supabase
        .from("active_setlist")
        .update({
          service_name: name,
          service_date: serviceDate || null,
          service_time: time,
          leader_notes: leaderNotes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", serviceId)
        .select("service_name, service_date, service_time, leader_notes")
        .single();
      if (error) {
        const completeError = { ...error, status };
        console.error("Unable to update current service:", {
          code: completeError.code,
          message: completeError.message,
          details: completeError.details,
          hint: completeError.hint,
          status: completeError.status,
        });
        throw completeError;
      }

      if (!data) throw new Error("Supabase did not return the updated service.");

      setServiceName(data.service_name);
      setServiceDate(data.service_date ?? "");
      setServiceTime(toTimeInputValue(data.service_time));
      setLeaderNotes(data.leader_notes ?? "");
      setIsError(false);
      setMessage("Servicio actual guardado.");
      router.refresh();
    } catch (error) {
      setIsError(true);
      setMessage(formatSupabaseError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AppSectionCard eyebrow="Servicio" title="Servicio actual" compactDesktop>
      <form onSubmit={save} className="grid gap-4 px-5 py-4 sm:grid-cols-2 sm:px-6 sm:py-5 lg:grid-cols-[2fr_1fr_1fr] lg:gap-x-4 lg:gap-y-3 lg:px-5 lg:py-4">
        <label className="text-sm font-semibold text-zinc-300 sm:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1">
          Nombre del servicio
          <input required value={serviceName} onChange={(event) => setServiceName(event.target.value)} className={`${appFieldStyles} mt-2`} />
        </label>
        <label className="text-sm font-semibold text-zinc-300 lg:col-start-2 lg:row-start-1">
          Fecha del servicio
          <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className={`${appFieldStyles} mt-2`} />
        </label>
        <label className="text-sm font-semibold text-zinc-300 sm:col-span-2 lg:col-span-3 lg:row-start-2">
          Notas del líder
          <textarea value={leaderNotes} onChange={(event) => setLeaderNotes(event.target.value)} rows={5} className={`${appFieldStyles} mt-2 resize-y py-3 lg:h-24 lg:min-h-24`} />
        </label>
        <label className="text-sm font-semibold text-zinc-300 lg:col-start-3 lg:row-start-1">
          Hora del servicio
          <input type="time" required value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} className={`${appFieldStyles} mt-2`} />
        </label>
        <AppActionBar className="sm:col-span-2 lg:col-span-3 lg:row-start-3">
          <PrimaryButton type="submit" disabled={isSaving || !serviceName.trim() || !serviceTime.trim()} className="lg:min-h-10 lg:rounded-xl lg:px-4 lg:text-sm lg:shadow-none lg:hover:translate-y-0">{isSaving ? "Guardando..." : "Guardar"}</PrimaryButton>
        </AppActionBar>
        <p role="status" aria-live="polite" className={`min-h-5 text-sm sm:col-span-2 lg:col-span-3 lg:row-start-4 ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </form>
    </AppSectionCard>
  );
}

function toTimeInputValue(value: string) {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  const match = value.match(/(\d{1,2}):([0-5]\d)\s*(AM|PM)/i);
  if (!match) return "";
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${hour.toString().padStart(2, "0")}:${match[2]}`;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") return error instanceof Error ? error.message : "No fue posible guardar el servicio actual.";
  const databaseError = error as Record<string, unknown>;
  return [
    databaseError.message,
    databaseError.code ? `Code: ${databaseError.code}` : null,
    databaseError.details ? `Details: ${databaseError.details}` : null,
    databaseError.hint ? `Hint: ${databaseError.hint}` : null,
    databaseError.status ? `Status: ${databaseError.status}` : null,
  ].filter(Boolean).join(" · ") || "No fue posible guardar el servicio actual.";
}
