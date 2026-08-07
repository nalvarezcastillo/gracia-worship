"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SecondaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function PrepareNextServiceButton() {
  const router = useRouter();
  const submittingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function prepareNextService() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSaving(true);
    setHasError(false);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.rpc("prepare_next_service");
      if (error) throw error;
      router.push("/service?prepared=1");
      router.refresh();
    } catch (error) {
      console.error("Unable to prepare next service:", error);
      setHasError(true);
      setIsSaving(false);
      submittingRef.current = false;
    }
  }

  return (
    <>
      <SecondaryButton type="button" onClick={() => { setHasError(false); setIsOpen(true); }} className="min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100">Preparar próximo servicio</SecondaryButton>
      {isOpen ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
        <section role="alertdialog" aria-modal="true" aria-labelledby="prepare-service-title" aria-describedby="prepare-service-description" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
          <h2 id="prepare-service-title" className="text-2xl font-bold tracking-tight text-white">Preparar próximo servicio</h2>
          <div id="prepare-service-description" className="mt-3 space-y-3 text-sm leading-6 text-zinc-400"><p>El servicio actual será archivado y se creará el servicio del próximo sábado.</p><p>Todo el contenido será copiado para que puedas comenzar a planificar inmediatamente.</p></div>
          {hasError ? <p role="alert" className="mt-4 text-sm font-medium text-rose-300">No fue posible preparar el próximo servicio.</p> : null}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <SecondaryButton type="button" onClick={() => setIsOpen(false)} disabled={isSaving}>Cancelar</SecondaryButton>
            <button type="button" onClick={() => void prepareNextService()} disabled={isSaving} className="min-h-12 rounded-2xl bg-emerald-400 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:opacity-40">{isSaving ? "Preparando..." : "Preparar próximo servicio"}</button>
          </div>
        </section>
      </div> : null}
    </>
  );
}
