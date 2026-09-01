import Link from "next/link";
import { ServicePlanCreator } from "@/components/service-plan-creator";
import type { ServiceHubData, ServiceSummary } from "@/lib/services";

export function ServiceHub({ authenticated, data, hideUpcoming = false }: { authenticated: boolean; data: ServiceHubData; hideUpcoming?: boolean }) {
  return (
    <div className="mt-4 space-y-6 sm:mt-9 sm:space-y-9">
      {!hideUpcoming ? data.upcoming.length ? <ServiceSection label="Próximos" services={data.upcoming} /> : <section><h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">Próximos</h2><div className="mt-1.5 border-y border-white/[0.07] py-6 text-center sm:mt-2 sm:py-10"><p className="text-sm text-zinc-500">No hay servicios próximos.</p>{authenticated ? <div className="mx-auto mt-3 max-w-xs sm:mt-4"><ServicePlanCreator services={data.services} wide /></div> : null}</div></section> : null}
      {data.unscheduled.length ? <ServiceSection label="Sin programar" services={data.unscheduled} /> : null}
      {data.recent.length ? <ServiceSection label="Recientes" services={data.recent} /> : null}
      {data.archived.length ? <ServiceSection label="Archivo" services={data.archived} /> : null}
    </div>
  );
}

function ServiceSection({ label, services }: { label: string; services: ServiceSummary[] }) {
  return (
    <section>
      <h2 className="text-[0.625rem] font-bold uppercase tracking-[0.2em] text-emerald-400/90 sm:text-[0.6875rem] sm:tracking-[0.18em] sm:text-emerald-400">{label}</h2>
      <div className="mt-1.5 divide-y divide-white/[0.07] border-y border-white/[0.07] sm:mt-2">
        {services.map((service) => <ServiceRow key={service.id} service={service} />)}
      </div>
    </section>
  );
}

function ServiceRow({ service }: { service: ServiceSummary }) {
  const date = formatServiceDate(service.serviceDate);
  return (
    <Link href={`/service/${service.id}`} className={`group grid min-h-[4.75rem] grid-cols-[56px_minmax(0,1fr)_24px] items-center gap-2 px-1.5 py-2 transition-colors hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:min-h-16 sm:grid-cols-[105px_minmax(0,1fr)_100px_92px_28px] sm:gap-4 sm:px-3 sm:py-2.5 ${service.status === "active" ? "border-l-2 border-emerald-400/55 sm:border-l-0" : "border-l-2 border-transparent sm:border-l-0"}`}>
      <span className="self-center pl-1 text-left sm:pl-0">
        <span className="block truncate text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-zinc-500">{date.weekday}</span>
        <span className="block text-2xl font-bold leading-7 tabular-nums text-zinc-200 sm:mt-0.5 sm:inline sm:text-sm">{date.day}</span>
        <span className="ml-1 hidden text-xs font-semibold uppercase text-zinc-500 sm:inline">{date.month}</span>
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-base font-semibold leading-5 text-zinc-100 transition-colors group-hover:text-white sm:block sm:truncate">{service.serviceName}</span>
        <span className="mt-1 block truncate text-[0.8125rem] leading-4 text-zinc-400 sm:hidden">{formatServiceTime(service.serviceTime)} <span className="px-0.5 text-zinc-700">·</span> <span className={service.status === "active" ? "font-medium text-emerald-400" : "text-zinc-500"}>{statusLabel(service.status)}</span></span>
      </span>
      <span className="hidden text-right text-sm tabular-nums text-zinc-400 sm:block sm:text-left">{formatServiceTime(service.serviceTime)}</span>
      <span className="hidden text-xs font-medium text-zinc-500 sm:block">{statusLabel(service.status)}</span>
      <span aria-hidden="true" className="text-right text-xl text-zinc-600 transition-colors group-hover:text-emerald-300"><span className="sm:hidden">›</span><span className="hidden text-lg sm:inline">→</span></span>
    </Link>
  );
}

function formatServiceDate(value: string | null) {
  if (!value) return { day: "—", month: "", weekday: "Sin fecha" };
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return {
    weekday: new Intl.DateTimeFormat("es-419", { weekday: "short" }).format(date).replace(".", ""),
    day: String(day).padStart(2, "0"),
    month: new Intl.DateTimeFormat("es-419", { month: "short" }).format(date).replace(".", ""),
  };
}

function formatServiceTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function statusLabel(status: ServiceSummary["status"]) {
  if (status === "active") return "Próximo";
  if (status === "planned") return "Planificado";
  if (status === "completed") return "Completado";
  return "Archivado";
}
