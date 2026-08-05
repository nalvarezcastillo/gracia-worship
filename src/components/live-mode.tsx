"use client";

import { useState } from "react";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem } from "@/lib/service";

type LiveService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

type LiveModeProps = {
  items: ServiceItem[];
  loadError?: string;
  service: LiveService | null;
};

export function LiveMode({ items, loadError, service }: LiveModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentItem = items[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= items.length - 1;

  return (
    <div>
      <header className="border-b border-white/[0.07] pb-6 sm:pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">En Vivo</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
        </h1>
        {service ? (
          <div className="mt-3 space-y-1 text-sm font-medium text-zinc-400 sm:text-base">
            <p>{service.service_date ? formatServiceDate(service.service_date) : "Fecha no configurada"}</p>
            <p>{formatServiceTime(service.service_time)}</p>
          </div>
        ) : null}
      </header>

      {loadError ? (
        <p role="alert" className="mt-8 rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-6 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentItem ? (
        <section className="mt-7 sm:mt-9" aria-live="polite" aria-atomic="true">
          <p className="text-sm font-semibold tabular-nums text-zinc-500">{currentIndex + 1} de {items.length}</p>

          <article className="mt-3 flex min-h-64 flex-col justify-center rounded-3xl border border-white/[0.08] bg-gradient-to-br from-zinc-900 to-zinc-900/55 p-6 shadow-2xl shadow-black/20 sm:min-h-72 sm:p-10">
            <h2 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-5xl">
              {currentItem.title}
            </h2>
            {currentItem.type === "text" && currentItem.details ? (
              <p className="mt-5 whitespace-pre-wrap text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
                {currentItem.details}
              </p>
            ) : null}
          </article>

          <nav aria-label="Navegación de elementos del servicio" className="mt-5 grid grid-cols-2 gap-3 sm:mt-6">
            <button
              type="button"
              disabled={isFirst}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
              className="min-h-14 rounded-2xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-zinc-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              ◀ Anterior
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={() => setCurrentIndex((index) => Math.min(items.length - 1, index + 1))}
              className="min-h-14 rounded-2xl bg-emerald-400 px-4 font-semibold text-zinc-950 transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
            >
              Siguiente ▶
            </button>
          </nav>
        </section>
      ) : (
        <div className="mt-8 rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">
          No hay elementos en el servicio actual.
        </div>
      )}
    </div>
  );
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const formatted = new Intl.DateTimeFormat("es-419", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatServiceTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

function localizeDefaultServiceName(value: string) {
  return value === "Saturday Service" ? "Servicio del Sábado" : value;
}
