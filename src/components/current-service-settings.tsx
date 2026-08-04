"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type CurrentServiceSettingsProps = {
  initialDate: string;
  initialName: string;
  initialTime: string;
};

const inputStyles = "mt-2 min-h-12 w-full rounded-2xl border border-white/10 bg-zinc-950/60 px-4 text-base text-white outline-none focus:border-emerald-400/50 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function CurrentServiceSettings({ initialDate, initialName, initialTime }: CurrentServiceSettingsProps) {
  const router = useRouter();
  const [serviceName, setServiceName] = useState(initialName);
  const [serviceDate, setServiceDate] = useState(initialDate);
  const [serviceTime, setServiceTime] = useState(() => toTimeInputValue(initialTime));
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
      if (sessionError || !sessionData.session) throw new Error("Your session expired. Sign in again.");

      const { data, error, status } = await supabase
        .from("active_setlist")
        .update({
          service_name: name,
          service_date: serviceDate || null,
          service_time: time,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1)
        .select("service_name, service_date, service_time")
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
    <section className="mt-8 rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-xl shadow-black/10 sm:mt-10 sm:p-6">
      <h2 className="text-xl font-semibold text-white">Servicio actual</h2>
      <form onSubmit={save} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-zinc-300 sm:col-span-2">
          Nombre del servicio
          <input required value={serviceName} onChange={(event) => setServiceName(event.target.value)} className={inputStyles} />
        </label>
        <label className="text-sm font-semibold text-zinc-300">
          Fecha del servicio
          <input type="date" value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className={inputStyles} />
        </label>
        <label className="text-sm font-semibold text-zinc-300">
          Hora del servicio
          <input type="time" required value={serviceTime} onChange={(event) => setServiceTime(event.target.value)} className={inputStyles} />
        </label>
        <div className="sm:col-span-2">
          <PrimaryButton type="submit" disabled={isSaving || !serviceName.trim() || !serviceTime.trim()}>{isSaving ? "Guardando..." : "Guardar"}</PrimaryButton>
        </div>
      </form>
      <p role="status" aria-live="polite" className={`mt-3 min-h-5 text-sm ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
    </section>
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
  if (!error || typeof error !== "object") return error instanceof Error ? error.message : "Unable to save current service.";
  const databaseError = error as Record<string, unknown>;
  return [
    databaseError.message,
    databaseError.code ? `Code: ${databaseError.code}` : null,
    databaseError.details ? `Details: ${databaseError.details}` : null,
    databaseError.hint ? `Hint: ${databaseError.hint}` : null,
    databaseError.status ? `Status: ${databaseError.status}` : null,
  ].filter(Boolean).join(" · ") || "Unable to save current service.";
}
