"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ServiceLifecycleActions } from "@/components/service-lifecycle-actions";
import { SearchField } from "@/components/ui/search-field";

export type ArchivedServiceSummary = { id: number; itemCount: number; service_date: string | null; service_name: string };
export function ServiceArchive({ hasCurrentActive, services }: { hasCurrentActive: boolean; services: ArchivedServiceSummary[] }) {
  const [query, setQuery] = useState("");
  const filteredServices = useMemo(() => {
    const normalized = normalizeSearch(query);
    return normalized ? services.filter((service) => normalizeSearch(`${service.service_name} ${service.service_date ?? ""} ${formatArchiveDate(service.service_date)}`).includes(normalized)) : services;
  }, [query, services]);

  return <>
    <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o fecha" /><p className="text-xs tabular-nums text-zinc-600 sm:pb-4">{filteredServices.length} {filteredServices.length === 1 ? "servicio" : "servicios"}</p></div>
    {!services.length ? <p className="mt-6 border-y border-white/[0.07] py-12 text-center text-sm text-zinc-500">No hay servicios archivados.</p> : filteredServices.length ? <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">{filteredServices.map((service) => <article key={service.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><h2 className="break-words font-semibold text-white">{service.service_name}</h2><p className="mt-1 text-sm text-zinc-400">{formatArchiveDate(service.service_date)} <span className="mx-1 text-zinc-700">·</span> <span className="text-zinc-500">{service.itemCount} {service.itemCount === 1 ? "elemento" : "elementos"}</span></p></div><div className="flex shrink-0 flex-wrap gap-1"><Link href={`/service/${service.id}`} className={actionStyles}>Ver servicio</Link><Link href={`/service/${service.id}/report`} className={actionStyles}>Reporte</Link><ServiceLifecycleActions hasCurrentActive={hasCurrentActive} serviceId={service.id} status="archived" /></div></article>)}</div> : <p className="mt-6 border-y border-white/[0.07] py-10 text-center text-sm text-zinc-500">No se encontraron servicios.</p>}
  </>;
}

const actionStyles = "inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/[0.05] hover:text-white disabled:opacity-40";
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
function formatArchiveDate(value: string | null) { if (!value) return "Sin fecha"; const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
