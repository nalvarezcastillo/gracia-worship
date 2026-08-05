"use client";

import { useState } from "react";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem } from "@/lib/service";

type RehearsalService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

type RehearsalModeProps = {
  items: ServiceItem[];
  loadError?: string;
  service: RehearsalService | null;
};

export function RehearsalMode({ items, loadError, service }: RehearsalModeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentItem = items[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= items.length - 1;

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col">
      <header className="border-b border-white/[0.07] pb-6 sm:pb-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-emerald-400">Ensayo</p>
        <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-white sm:text-4xl">
          {service ? localizeDefaultServiceName(service.service_name) : "Servicio actual"}
        </h1>
        {service ? (
          <div className="mt-3 space-y-1 text-sm font-medium text-zinc-400 sm:flex sm:gap-3 sm:space-y-0 sm:text-base">
            <p>{service.service_date ? formatServiceDate(service.service_date) : "Fecha no configurada"}</p>
            <span className="hidden text-zinc-700 sm:inline" aria-hidden="true">•</span>
            <p>{formatServiceTime(service.service_time)}</p>
          </div>
        ) : null}
      </header>

      {loadError ? (
        <p role="alert" className="my-auto rounded-2xl border border-rose-400/15 bg-rose-400/[0.06] px-5 py-8 text-center text-sm text-rose-300">
          No se pudo cargar el servicio actual.
        </p>
      ) : currentItem ? (
        <section className="flex min-h-0 flex-1 flex-col pt-6 sm:pt-8" aria-live="polite" aria-atomic="true">
          <p className="text-center text-sm font-semibold tabular-nums text-zinc-500">
            {currentIndex + 1} de {items.length}
          </p>

          <article className="flex min-h-[42dvh] flex-1 flex-col items-center justify-center px-4 py-10 text-center sm:px-10">
            <h2 className={`font-bold leading-tight tracking-[-0.04em] text-white ${currentItem.type === "worship" ? "text-4xl uppercase sm:text-7xl" : "text-4xl sm:text-6xl"}`}>
              {currentItem.title}
            </h2>
            {currentItem.type === "text" && currentItem.details ? (
              <p className="mt-6 text-lg font-medium leading-8 text-zinc-400 sm:text-2xl">
                {currentItem.details}
              </p>
            ) : null}
          </article>

          <nav aria-label="Navegación del ensayo" className="grid grid-cols-2 gap-3 border-t border-white/[0.07] pt-5 sm:gap-4 sm:pt-6">
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
        <div className="my-auto rounded-3xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-zinc-500">
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
