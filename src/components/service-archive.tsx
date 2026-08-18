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
    <div className="mt-6"><SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o fecha" /></div>
    {!services.length ? <p className="mt-6 border-y border-white/[0.07] py-12 text-center text-sm text-zinc-500">No hay servicios archivados.</p> : filteredServices.length ? <div className="mt-6 divide-y divide-white/[0.07] border-y border-white/[0.07]">{filteredServices.map((service) => <article key={service.id} className="py-4"><h2 className="font-semibold text-white">{service.service_name}</h2><p className="mt-1 text-sm text-zinc-400">{formatArchiveDate(service.service_date)}</p><p className="mt-1 text-sm text-zinc-500">{service.itemCount} {service.itemCount === 1 ? "elemento" : "elementos"}</p><div className="mt-3 flex flex-wrap gap-2"><Link href={`/service/${service.id}`} className={actionStyles}>Ver</Link><Link href={`/service/${service.id}/report`} className={actionStyles}>Ver reporte</Link><ServiceLifecycleActions hasCurrentActive={hasCurrentActive} serviceId={service.id} status="archived" /></div></article>)}</div> : <p className="mt-6 py-10 text-center text-sm text-zinc-500">No se encontraron servicios.</p>}
  </>;
}

const actionStyles = "inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:opacity-40";
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
function formatArchiveDate(value: string | null) { if (!value) return "Sin fecha"; const [year, month, day] = value.split("-").map(Number); const formatted = new Intl.DateTimeFormat("es-419", { day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day)); return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1); }
