"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SecondaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AddSongToServiceButton({ primary = false, serviceId, songId, songTitle }: { primary?: boolean; serviceId?: number; songId: string; songTitle: string }) {
  const savingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<"success" | "no-service" | "error" | null>(null);

  async function addToService() {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setNotice(null);

    try {
      const supabase = createSupabaseBrowserClient();
      const serviceQuery = supabase
        .from("active_setlist")
        .select("id, status");
      const { data: targetService, error: serviceError } = serviceId
        ? await serviceQuery.eq("id", serviceId).maybeSingle()
        : await serviceQuery.eq("status", "active").maybeSingle();

      if (serviceError) throw serviceError;
      if (!targetService) {
        setNotice("no-service");
        return;
      }
      if (targetService.status !== "active" && targetService.status !== "planned") {
        setNotice("no-service");
        return;
      }

      const { data: finalItem, error: itemError } = await supabase
        .from("service_items")
        .select("position")
        .eq("service_id", targetService.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (itemError) throw itemError;

      const { error } = await supabase.from("service_items").insert({
        service_id: targetService.id,
        position: (finalItem?.position ?? 0) + 1,
        type: "song",
        song_id: songId,
        title: songTitle,
        details: null,
        planned_duration_seconds: null,
        song_ids: null,
      });
      if (error) throw error;

      setNotice("success");
    } catch (error) {
      console.error("Unable to add song to service:", error);
      setNotice("error");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton type="button" onClick={() => void addToService()} disabled={isSaving} className={`min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100 ${primary ? "border-emerald-400 bg-emerald-400 text-zinc-950 hover:border-emerald-300 hover:bg-emerald-300 max-sm:!border-emerald-400 max-sm:!bg-emerald-400 max-sm:!text-zinc-950 max-sm:hover:!border-emerald-300 max-sm:hover:!bg-emerald-300" : ""}`}>
        {isSaving ? "Agregando..." : "+ Agregar al servicio"}
      </SecondaryButton>
      {notice === "success" ? <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Canción agregada al servicio.</div> : null}
      {notice === "no-service" ? <p role="status" className="basis-full text-sm text-rose-300">No hay un servicio próximo seleccionado. <Link href="/service" className="ml-1 font-semibold text-emerald-400 underline underline-offset-4">Ver servicios</Link></p> : null}
      {notice === "error" ? <p role="status" className="basis-full text-sm text-rose-300">No se pudo agregar la canción al servicio.</p> : null}
    </>
  );
}
