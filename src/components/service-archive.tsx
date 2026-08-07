"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchField } from "@/components/ui/search-field";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ArchivedServiceSummary = { id: number; itemCount: number; service_date: string | null; service_name: string };
type Confirmation = { id: number; kind: "restore" | "delete"; title: string } | null;

export function ServiceArchive({ services }: { services: ArchivedServiceSummary[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const filteredServices = useMemo(() => {
    const normalized = normalizeSearch(query);
    return normalized ? services.filter((service) => normalizeSearch(`${service.service_name} ${service.service_date ?? ""} ${formatArchiveDate(service.service_date)}`).includes(normalized)) : services;
  }, [query, services]);

  async function confirmAction() {
    if (!confirmation || isSaving) return;
    setIsSaving(true); setMessage("");
    const supabase = createSupabaseBrowserClient();
    if (confirmation.kind === "restore") {
      const { error } = await supabase.rpc("restore_archived_service", { target_service_id: confirmation.id });
      if (error) { setMessage("No fue posible restaurar el servicio."); setIsSaving(false); return; }
      router.push("/?restored=1"); router.refresh(); return;
    }
    const { error } = await supabase.from("active_setlist").delete().eq("id", confirmation.id).eq("status", "archived");
    if (error) setMessage("No fue posible eliminar el servicio archivado.");
    else { setConfirmation(null); router.refresh(); }
    setIsSaving(false);
  }

  return <>
    <div className="mt-6"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o fecha" /></div>
    {!services.length ? <p className="mt-6 border-y border-white/[0.07] py-12 text-center text-sm text-zinc-500">No hay servicios archivados.</p> : filteredServices.length ? <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">{filteredServices.map((service) => <article key={service.id} className="py-4"><h2 className="font-semibold text-white">{service.service_name}</h2><p className="mt-1 text-sm text-zinc-400">{formatArchiveDate(service.service_date)}</p><p className="mt-1 text-sm text-zinc-500">{service.itemCount} {service.itemCount === 1 ? "elemento" : "elementos"}</p><div className="mt-3 flex flex-wrap gap-2"><Link href={`/service/${service.id}`} className={actionStyles}>Ver</Link><button type="button" onClick={() => setConfirmation({ id: service.id, kind: "restore", title: service.service_name })} className={actionStyles}>Restaurar como servicio actual</button><button type="button" onClick={() => setConfirmation({ id: service.id, kind: "delete", title: service.service_name })} className={`${actionStyles} text-rose-300`}>Eliminar</button></div></article>)}</div> : <p className="mt-6 py-10 text-center text-sm text-zinc-500">No se encontraron servicios.</p>}
    {confirmation ? <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation"><section role="alertdialog" aria-modal="true" aria-labelledby="archive-confirm-title" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"><h2 id="archive-confirm-title" className="text-xl font-bold text-white">{confirmation.kind === "restore" ? "¿Restaurar como servicio actual?" : "¿Eliminar servicio archivado?"}</h2><p className="mt-3 text-sm leading-6 text-zinc-400">{confirmation.kind === "restore" ? "El servicio actual será archivado antes de restaurar este servicio." : `Se eliminará “${confirmation.title}” de forma permanente.`}</p>{message ? <p role="alert" className="mt-3 text-sm text-rose-300">{message}</p> : null}<div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => { setConfirmation(null); setMessage(""); }} disabled={isSaving} className={actionStyles}>Cancelar</button><button type="button" onClick={() => void confirmAction()} disabled={isSaving} className={`min-h-12 rounded-2xl px-4 font-semibold ${confirmation.kind === "restore" ? "bg-emerald-400 text-zinc-950" : "bg-rose-500 text-white"}`}>{isSaving ? "Guardando..." : confirmation.kind === "restore" ? "Restaurar" : "Eliminar"}</button></div></section></div> : null}
  </>;
}

const actionStyles = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40";
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
function formatArchiveDate(value: string | null) { if (!value) return "Sin fecha"; const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
