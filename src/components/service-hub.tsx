import Link from "next/link";
import type { ServiceHubData, ServiceSummary } from "@/lib/services";

export function ServiceHub({ data }: { data: ServiceHubData }) {
  const hasServices = data.upcoming.length || data.unscheduled.length || data.recent.length || data.archived.length;

  if (!hasServices) {
    return <div className="mt-8 border-y border-white/[0.07] py-14 text-center text-sm text-zinc-500">No hay servicios disponibles.</div>;
  }

  return (
    <div className="mt-7 space-y-9 sm:mt-9">
      {data.upcoming.length ? <ServiceSection label="Próximos" services={data.upcoming} /> : null}
      {data.unscheduled.length ? <ServiceSection label="Sin programar" services={data.unscheduled} /> : null}
      {data.recent.length ? <ServiceSection label="Recientes" services={data.recent} /> : null}
      {data.archived.length ? <ServiceSection label="Archivo" services={data.archived} /> : null}
    </div>
  );
}

function ServiceSection({ label, services }: { label: string; services: ServiceSummary[] }) {
  return (
    <section>
      <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-emerald-400">{label}</h2>
      <div className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {services.map((service) => <ServiceRow key={service.id} service={service} />)}
      </div>
    </section>
  );
}

function ServiceRow({ service }: { service: ServiceSummary }) {
  const date = formatServiceDate(service.serviceDate);
  return (
    <Link href={`/service/${service.id}`} className="group grid min-h-20 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 transition-colors hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-400 sm:min-h-16 sm:grid-cols-[105px_minmax(0,1fr)_100px_92px_28px] sm:gap-4 sm:px-3 sm:py-2.5">
      <span className="text-center sm:text-left">
        <span className="block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-zinc-500">{date.weekday}</span>
        <span className="mt-0.5 block text-lg font-bold tabular-nums text-zinc-200 sm:inline sm:text-sm">{date.day}</span>
        <span className="ml-1 hidden text-xs font-semibold uppercase text-zinc-500 sm:inline">{date.month}</span>
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-zinc-100 transition-colors group-hover:text-white sm:text-base">{service.serviceName}</span>
        <span className="mt-1 block text-xs text-zinc-500 sm:hidden">{formatServiceTime(service.serviceTime)} · {statusLabel(service.status)}</span>
      </span>
      <span className="text-right text-sm tabular-nums text-zinc-400 sm:text-left">{formatServiceTime(service.serviceTime)}</span>
      <span className="hidden text-xs font-medium text-zinc-500 sm:block">{statusLabel(service.status)}</span>
      <span aria-hidden="true" className="text-right text-lg text-zinc-600 transition-colors group-hover:text-emerald-300">→</span>
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
