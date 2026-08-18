"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppConfirmDialog } from "@/components/app-confirm-dialog";
import { SecondaryButton } from "@/components/ui/action-button";
import type { ServiceStatus } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type LifecycleAction = "activate" | "archive" | "restore";

export function ServiceLifecycleActions({ hasCurrentActive, menuItem = false, serviceId, status }: { hasCurrentActive: boolean; menuItem?: boolean; serviceId: number; status: ServiceStatus }) {
  const router = useRouter();
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!action) return;
    confirmButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !isSaving) setAction(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [action, isSaving]);

  if (status !== "planned" && status !== "completed" && status !== "archived") return null;

  async function confirmAction() {
    if (!action || isSaving) return;
    setIsSaving(true);
    setError("");
    const supabase = createSupabaseBrowserClient();
    const { error: rpcError } = action === "activate"
      ? await supabase.rpc("activate_service_plan", { p_service_id: serviceId })
      : action === "archive"
        ? await supabase.rpc("archive_completed_service", { p_service_id: serviceId })
        : await supabase.rpc("restore_archived_service_plan", { p_service_id: serviceId });

    if (rpcError) {
      setError(formatLifecycleError(rpcError.message, action));
      setIsSaving(false);
      return;
    }

    setAction(null);
    setIsSaving(false);
    router.refresh();
  }

  const lifecycleAction: LifecycleAction = status === "planned" ? "activate" : status === "completed" ? "archive" : "restore";
  return (
    <>
      <SecondaryButton type="button" onClick={() => { setError(""); setAction(lifecycleAction); }} className={menuItem ? "min-h-11 w-full justify-start rounded-lg border-0 bg-transparent px-3 text-sm shadow-none hover:translate-y-0 hover:bg-white/[0.06] hover:shadow-none active:scale-100" : "min-h-11 rounded-xl px-4 text-sm shadow-none hover:translate-y-0 hover:shadow-none active:scale-100"}>
        {actionLabel(lifecycleAction)}
      </SecondaryButton>
      {action ? (
        <AppConfirmDialog
          title={dialogTitle(action)}
          titleId="service-lifecycle-title"
          descriptionId="service-lifecycle-description"
          actions={<div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><SecondaryButton type="button" onClick={() => setAction(null)} disabled={isSaving}>Cancelar</SecondaryButton><button ref={confirmButtonRef} type="button" onClick={() => void confirmAction()} disabled={isSaving} className="min-h-12 rounded-full bg-emerald-400 px-6 text-base font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-50">{isSaving ? "Guardando…" : confirmLabel(action)}</button></div>}
        >
          <p id="service-lifecycle-description" className="mt-3 text-sm leading-6 text-zinc-400">{dialogDescription(action, hasCurrentActive)}</p>
          {error ? <p role="alert" className="mt-3 text-sm leading-6 text-rose-300">{error}</p> : null}
        </AppConfirmDialog>
      ) : null}
    </>
  );
}

function formatLifecycleError(message: string, action: LifecycleAction) {
  if (/current active service has live history/i.test(message)) return "El servicio próximo actual ya tiene historial de En Vivo y no puede reemplazarse directamente.";
  if (/planned service with live history/i.test(message)) return "Este servicio conserva historial de En Vivo y no puede activarse como un servicio nuevo.";
  if (/while Live is unfinished|already Live/i.test(message)) return "No se puede cambiar el servicio próximo mientras hay un servicio En Vivo.";
  if (/only a planned service/i.test(message)) return "Este servicio ya no está Planificado. Actualiza la página e inténtalo de nuevo.";
  if (/only an archived service/i.test(message)) return "Este servicio ya no está Archivado. Actualiza la página e inténtalo de nuevo.";
  if (/only a completed service/i.test(message)) return "Este servicio ya no está Completado. Actualiza la página e inténtalo de nuevo.";
  if (/unfinished Live state/i.test(message)) return "No se puede archivar mientras el servicio tiene un estado En Vivo sin finalizar.";
  if (/open run/i.test(message)) return "No se puede archivar mientras el servicio tiene una ejecución abierta.";
  if (action === "activate") return `No se pudo activar el servicio: ${message}`;
  if (action === "archive") return `No se pudo archivar el servicio: ${message}`;
  return `No se pudo restaurar el servicio: ${message}`;
}

function actionLabel(action: LifecycleAction) { return action === "activate" ? "Activar como próximo" : action === "archive" ? "Archivar servicio" : "Restaurar como planificado"; }
function dialogTitle(action: LifecycleAction) { return action === "activate" ? "Activar como próximo servicio" : action === "archive" ? "Archivar servicio" : "Restaurar como planificado"; }
function confirmLabel(action: LifecycleAction) { return action === "activate" ? "Activar" : action === "archive" ? "Archivar servicio" : "Restaurar"; }
function dialogDescription(action: LifecycleAction, hasCurrentActive: boolean) {
  if (action === "activate") return hasCurrentActive ? "El servicio actual dejará de ser el próximo servicio. Este servicio será usado por Inicio, administración y En Vivo." : "Este servicio será usado por Inicio, administración y En Vivo.";
  if (action === "archive") return "Este servicio se moverá al archivo. Su historial, reporte, orden y asignaciones se conservarán.";
  return "El servicio volverá a Planificado. El servicio próximo actual no cambiará.";
}
