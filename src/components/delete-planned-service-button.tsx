"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deletePlannedService } from "@/lib/service-plan-mutations";

export function DeletePlannedServiceButton({ menuItem = false, serviceId, serviceName }: { menuItem?: boolean; serviceId: number; serviceName: string }) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    cancelRef.current?.focus();
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape" && !isDeleting) close(); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen, isDeleting]);

  function close() { setIsOpen(false); setError(""); window.setTimeout(() => triggerRef.current?.focus(), 0); }

  async function remove() {
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");
    try {
      await deletePlannedService({ p_service_id: serviceId });
      setIsOpen(false);
      router.push("/service");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar el servicio.");
      setIsDeleting(false);
    }
  }

  return <><button ref={triggerRef} type="button" onClick={() => setIsOpen(true)} className={menuItem ? "min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-400/[0.08] focus-visible:outline-2 focus-visible:outline-rose-400" : "min-h-11 rounded-xl px-4 text-sm font-semibold text-rose-300 transition-colors hover:bg-rose-400/[0.08] focus-visible:outline-2 focus-visible:outline-rose-400"}>Eliminar servicio</button>{isOpen ? <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isDeleting) close(); }} className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7"><h2 id={titleId} className="text-2xl font-bold tracking-tight text-white">Eliminar servicio</h2><p id={descriptionId} className="mt-3 text-sm leading-6 text-zinc-400">Esta acción eliminará “{serviceName}”, su orden y sus asignaciones de equipo. No se puede deshacer.</p>{error ? <p role="alert" className="mt-4 text-sm leading-6 text-rose-300">{error}</p> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" onClick={close} disabled={isDeleting} className="min-h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-200 hover:bg-white/[0.05] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Cancelar</button><button type="button" onClick={() => void remove()} disabled={isDeleting} className="min-h-12 rounded-xl bg-rose-500 px-5 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">{isDeleting ? "Eliminando servicio…" : "Eliminar servicio"}</button></div></section></div> : null}</>;
}
