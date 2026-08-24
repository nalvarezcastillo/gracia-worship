"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteHistoricalService } from "@/lib/historical-service-mutations";

export function DeleteHistoricalServiceAction({ serviceDate, serviceId, serviceName, serviceTime }: { serviceDate: string; serviceId: number; serviceName: string; serviceTime: string }) {
  const router = useRouter();
  const titleId = useId();
  const descriptionId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const confirmed = confirmation.trim() === "ELIMINAR";
  const closeDialog = useCallback(() => { if (deleting) return; setDialogOpen(false); setConfirmation(""); setError(""); window.setTimeout(() => triggerRef.current?.focus(), 0); }, [deleting]);

  useEffect(() => {
    if (!dialogOpen) return;
    cancelRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !deleting) { event.preventDefault(); closeDialog(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href]'));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1) as HTMLElement;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog, deleting, dialogOpen]);

  function openDialog() { setMenuOpen(false); setDialogOpen(true); setConfirmation(""); setError(""); }

  async function remove() {
    if (!confirmed || deleting) return;
    setDeleting(true); setError("");
    try {
      await deleteHistoricalService(serviceId);
      setDialogOpen(false);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar el servicio.");
      setDeleting(false);
    }
  }

  return <div className="relative inline-flex">
    <button ref={triggerRef} type="button" aria-label={`Acciones de ${serviceName}`} aria-expanded={menuOpen} aria-haspopup="menu" onClick={() => setMenuOpen((open) => !open)} className="grid size-11 place-items-center rounded-lg text-lg tracking-widest text-zinc-500 transition-colors hover:bg-white/[0.045] hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400">•••</button>
    {menuOpen ? <div role="menu" className="absolute right-0 top-12 z-30 min-w-44 overflow-hidden rounded-xl border border-white/10 bg-zinc-900 p-1 text-left shadow-xl shadow-black/50"><Link role="menuitem" href={`/service/${serviceId}/report`} className="flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-zinc-200 hover:bg-white/[0.06]">Ver reporte</Link><button role="menuitem" type="button" onClick={openDialog} className="min-h-10 w-full rounded-lg px-3 text-left text-sm font-semibold text-rose-300 hover:bg-rose-400/[0.08]">Eliminar servicio</button></div> : null}
    {dialogOpen ? <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }} className="fixed inset-0 z-[80] grid place-items-center bg-black/75 px-4 backdrop-blur-sm"><section ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7"><p className="text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-rose-300">Eliminación permanente</p><h2 id={titleId} className="mt-1 text-2xl font-bold tracking-tight text-white">Eliminar servicio</h2><div className="mt-5 border-y border-white/[0.07] py-4"><p className="break-words text-lg font-semibold text-white">{serviceName}</p><p className="mt-1 text-sm text-zinc-400">{serviceDate} · {serviceTime}</p></div><div id={descriptionId} className="mt-5 space-y-2 text-sm leading-6 text-zinc-400"><p>Se eliminará permanentemente este servicio y todo su historial asociado.</p><p>Las canciones y archivos de la biblioteca no serán eliminados.</p><p className="font-semibold text-zinc-300">Esta acción no se puede deshacer.</p></div><label className="mt-5 block text-xs font-semibold text-zinc-400">Escribe <span className="font-mono text-zinc-200">ELIMINAR</span> para confirmar.<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={deleting} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 font-mono text-base text-white outline-none focus:border-rose-400/60 disabled:opacity-50" /></label>{error ? <p role="alert" className="mt-4 text-sm leading-6 text-rose-300">{error}</p> : null}<div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><button ref={cancelRef} type="button" onClick={closeDialog} disabled={deleting} className="min-h-12 rounded-xl border border-white/10 px-5 text-sm font-semibold text-zinc-200 hover:bg-white/[0.05] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400">Cancelar</button><button type="button" onClick={() => void remove()} disabled={!confirmed || deleting} className="min-h-12 rounded-xl bg-rose-500 px-5 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400">{deleting ? "Eliminando…" : "Eliminar permanentemente"}</button></div></section></div> : null}
  </div>;
}
