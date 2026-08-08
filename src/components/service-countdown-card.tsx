"use client";

import { useEffect, useMemo, useState } from "react";
import { AppSectionCard } from "@/components/app-section-card";

type ServiceCountdownCardProps = {
  serviceDate: string | null;
  serviceName: string;
  serviceSchedule: string;
  serviceTime: string;
};

type CountdownState =
  | { accessibleLabel: string; days: number; hours: number; kind: "days"; minutes: number }
  | { accessibleLabel: string; hours: number; kind: "hours"; minutes: number; relativeDay: "Hoy" | "Mañana" }
  | { accessibleLabel: string; kind: "minutes"; minutes: number }
  | { accessibleLabel: string; kind: "now" }
  | { accessibleLabel: string; kind: "today" }
  | { accessibleLabel: string; kind: "expired" };

export function ServiceCountdownCard({ serviceDate, serviceName, serviceSchedule, serviceTime }: ServiceCountdownCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const serviceAt = useMemo(() => parseServiceDateTime(serviceDate, serviceTime), [serviceDate, serviceTime]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!serviceAt) return null;
  const countdown = getCountdownState(serviceAt, new Date(now));
  if (countdown.kind === "expired") return null;
  const [serviceDateLabel, serviceTimeLabel] = serviceSchedule.split(" • ");

  return (
    <AppSectionCard eyebrow="Cuenta regresiva" title="Próximo servicio">
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        <p className="sr-only" aria-live="polite">{countdown.accessibleLabel}</p>
        <CountdownDisplay countdown={countdown} />
        <div className="mt-5 border-t border-white/[0.055] pt-4">
          <p className="text-base font-semibold text-zinc-200">{serviceName}</p>
          <p className="mt-1 text-sm text-zinc-400">{serviceDateLabel}</p>
          {serviceTimeLabel ? <p className="mt-1 text-sm text-zinc-400">{serviceTimeLabel}</p> : null}
        </div>
      </div>
    </AppSectionCard>
  );
}

function CountdownDisplay({ countdown }: { countdown: Exclude<CountdownState, { kind: "expired" }> }) {
  if (countdown.kind === "now") return <p className="text-4xl font-bold tracking-tight text-white sm:text-5xl">AHORA</p>;
  if (countdown.kind === "today") return <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Servicio de hoy</p>;
  if (countdown.kind === "minutes") {
    return <div><TimeBlocks values={[{ label: "MIN", value: countdown.minutes }]} /><p className="mt-3 text-sm font-medium text-zinc-400">El servicio está por comenzar</p></div>;
  }
  if (countdown.kind === "hours") {
    return <div><TimeBlocks values={[{ label: "HORAS", value: countdown.hours }, { label: "MIN", value: countdown.minutes }]} /><p className="mt-3 text-sm font-medium text-zinc-400">{countdown.relativeDay}</p></div>;
  }
  return <TimeBlocks values={[{ label: "DÍAS", value: countdown.days }, { label: "HORAS", value: countdown.hours }, { label: "MIN", value: countdown.minutes }]} />;
}

function TimeBlocks({ values }: { values: Array<{ label: string; value: number }> }) {
  return (
    <div className={`grid items-start ${values.length === 1 ? "max-w-24 grid-cols-1" : values.length === 2 ? "max-w-64 grid-cols-2" : "grid-cols-3"}`}>
      {values.map((item, index) => (
        <div key={item.label} className={`relative min-w-0 text-center ${values.length > 1 ? "first:text-left last:text-right" : ""}`}>
          {index > 0 ? <span aria-hidden="true" className="absolute -left-1 top-0 text-3xl font-light text-zinc-600 sm:text-4xl">:</span> : null}
          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight text-white transition-opacity duration-200 min-[390px]:text-4xl sm:text-5xl">{pad(item.value)}</p>
          <p className="mt-1 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

function parseServiceDateTime(dateValue: string | null, timeValue: string) {
  if (!dateValue) return null;
  const dateMatch = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateMatch) return null;
  const time24 = timeValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  const time12 = timeValue.match(/(\d{1,2}):([0-5]\d)\s*(AM|PM)/i);
  let hour: number;
  let minute: number;
  if (time24) {
    hour = Number(time24[1]);
    minute = Number(time24[2]);
  } else if (time12) {
    hour = Number(time12[1]) % 12 + (time12[3].toUpperCase() === "PM" ? 12 : 0);
    minute = Number(time12[2]);
  } else {
    return null;
  }
  const result = new Date(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3]), hour, minute);
  return Number.isNaN(result.getTime()) ? null : result;
}

function getCountdownState(serviceAt: Date, now: Date): CountdownState {
  const differenceMs = serviceAt.getTime() - now.getTime();
  if (differenceMs <= 0) {
    if (!isSameDay(serviceAt, now)) return { accessibleLabel: "El servicio programado ya pasó.", kind: "expired" };
    if (differenceMs > -60_000) return { accessibleLabel: "El servicio comienza ahora.", kind: "now" };
    return { accessibleLabel: "El servicio es hoy.", kind: "today" };
  }

  const totalMinutes = Math.max(1, Math.floor(differenceMs / 60_000));
  if (totalMinutes < 60) return { accessibleLabel: `Faltan ${totalMinutes} minutos para el próximo servicio.`, kind: "minutes", minutes: totalMinutes };

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (differenceMs < 86_400_000) {
    const relativeDay = isSameDay(serviceAt, now) ? "Hoy" : "Mañana";
    return { accessibleLabel: `Faltan ${hours} horas y ${minutes} minutos para el próximo servicio.`, hours, kind: "hours", minutes, relativeDay };
  }

  const days = Math.floor(totalMinutes / 1_440);
  const remainingHours = Math.floor((totalMinutes % 1_440) / 60);
  const remainingMinutes = totalMinutes % 60;
  return { accessibleLabel: `Faltan ${days} días, ${remainingHours} horas y ${remainingMinutes} minutos para el próximo servicio.`, days, hours: remainingHours, kind: "days", minutes: remainingMinutes };
}

function isSameDay(first: Date, second: Date) {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function pad(value: number) {
  return value.toString().padStart(2, "0");
}
