"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppActionBar } from "@/components/app-action-bar";
import { AppConfirmDialog } from "@/components/app-confirm-dialog";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
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
      const { data: preparedServiceId, error } = await supabase.rpc("prepare_next_service");
      if (error) throw error;
      router.push(typeof preparedServiceId === "number" ? `/service/${preparedServiceId}?prepared=1` : "/service");
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
      {isOpen ? <AppConfirmDialog title="Preparar próximo servicio" titleId="prepare-service-title" descriptionId="prepare-service-description" actions={<AppActionBar className="sm:justify-end"><SecondaryButton type="button" onClick={() => setIsOpen(false)} disabled={isSaving}>Cancelar</SecondaryButton><PrimaryButton type="button" onClick={() => void prepareNextService()} disabled={isSaving}>{isSaving ? "Preparando..." : "Preparar próximo servicio"}</PrimaryButton></AppActionBar>}>
          <div id="prepare-service-description" className="mt-3 space-y-3 text-sm leading-6 text-zinc-400"><p>El servicio actual será archivado y se creará el servicio del próximo sábado.</p><p>Todo el contenido será copiado para que puedas comenzar a planificar inmediatamente.</p></div>
          {hasError ? <p role="alert" className="mt-4 text-sm font-medium text-rose-300">No fue posible preparar el próximo servicio.</p> : null}
      </AppConfirmDialog> : null}
    </>
  );
}
