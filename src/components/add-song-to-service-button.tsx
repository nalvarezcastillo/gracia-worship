"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { SecondaryButton } from "@/components/ui/action-button";
import { normalizeSongIds } from "@/lib/service-item-normalization";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function AddSongToServiceButton({ songId }: { songId: string }) {
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
      const { data: activeService, error: serviceError } = await supabase
        .from("active_setlist")
        .select("id")
        .eq("status", "active")
        .maybeSingle();

      if (serviceError) throw serviceError;
      if (!activeService) {
        setNotice("no-service");
        return;
      }

      const { data: finalItem, error: itemError } = await supabase
        .from("service_items")
        .select("id, position, type, song_ids")
        .eq("service_id", activeService.id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (itemError) throw itemError;

      if (finalItem?.type === "worship") {
        const entries = normalizeSongIds(finalItem.song_ids).entries;
        if (entries.at(-1)?.songId !== songId) {
          const { error } = await supabase
            .from("service_items")
            .update({ song_ids: [...entries, { songId, notes: "" }] })
            .eq("id", finalItem.id);
          if (error) throw error;
        }
      } else {
        const { error } = await supabase.from("service_items").insert({
          service_id: activeService.id,
          position: (finalItem?.position ?? 0) + 1,
          type: "worship",
          title: "Alabanza",
          details: null,
          song_ids: [{ songId, notes: "" }],
        });
        if (error) throw error;
      }

      setNotice("success");
    } catch (error) {
      console.error("Unable to add song to active service:", error);
      setNotice("error");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  return (
    <>
      <SecondaryButton type="button" onClick={() => void addToService()} disabled={isSaving} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">
        {isSaving ? "Agregando..." : "+ Agregar al servicio"}
      </SecondaryButton>
      {notice === "success" ? <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-2xl border border-emerald-400/20 bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-emerald-300 shadow-2xl">✅ Canción agregada al servicio.</div> : null}
      {notice === "no-service" ? <p role="status" className="basis-full text-sm text-rose-300">No existe un servicio activo. <Link href="/admin" className="ml-1 font-semibold text-emerald-400 underline underline-offset-4">Crear servicio</Link></p> : null}
      {notice === "error" ? <p role="status" className="basis-full text-sm text-rose-300">No se pudo agregar la canción al servicio.</p> : null}
    </>
  );
}
