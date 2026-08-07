"use client";

import { useEffect, useMemo, useState } from "react";
import { AppSectionCard } from "@/components/app-section-card";

type ServiceCountdownCardProps = {
  serviceDate: string | null;
  serviceName: string;
  serviceSchedule: string;
  serviceTime: string;
};

export function ServiceCountdownCard({ serviceDate, serviceName, serviceSchedule, serviceTime }: ServiceCountdownCardProps) {
  const [now, setNow] = useState(() => Date.now());
  const serviceAt = useMemo(() => parseServiceDateTime(serviceDate, serviceTime), [serviceDate, serviceTime]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!serviceAt) return null;
  const label = formatCountdown(serviceAt, new Date(now));
  const emphasizedLabel = splitCountdownLabel(label);
  const [serviceDateLabel, serviceTimeLabel] = serviceSchedule.split(" • ");

  return (
    <AppSectionCard eyebrow="Próximo" title="Cuenta regresiva">
      <div className="px-5 py-5 sm:px-6 sm:py-6">
        {emphasizedLabel.prefix ? <p className="text-sm font-semibold text-zinc-400">{emphasizedLabel.prefix}</p> : null}
        <p className="mt-1 text-4xl font-bold tracking-tight text-white sm:text-5xl">{emphasizedLabel.value}</p>
        <div className="mt-4 border-t border-white/[0.055] pt-4">
          <p className="text-base font-semibold text-zinc-200">{serviceName}</p>
          <p className="mt-1 text-sm text-zinc-400">{serviceDateLabel}</p>
          {serviceTimeLabel ? <p className="mt-1 text-sm text-zinc-400">{serviceTimeLabel}</p> : null}
        </div>
      </div>
    </AppSectionCard>
  );
}

function splitCountdownLabel(label: string) {
  const match = label.match(/^Faltan (.+)$/);
  return match ? { prefix: "Faltan", value: match[1] } : { prefix: "", value: label };
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

function formatCountdown(serviceAt: Date, now: Date) {
  const differenceMinutes = Math.ceil((serviceAt.getTime() - now.getTime()) / 60_000);
  if (differenceMinutes <= 0 && isSameDay(serviceAt, now)) return "Servicio de hoy";
  if (differenceMinutes <= 15) return "El servicio está por comenzar";
  if (differenceMinutes < 60) return `Faltan ${differenceMinutes} minutos`;

  const calendarDays = differenceInCalendarDays(serviceAt, now);
  if (calendarDays === 0) {
    const hours = Math.ceil(differenceMinutes / 60);
    return `Faltan ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }
  if (calendarDays === 1) return "Mañana";
  return `Faltan ${calendarDays} días`;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function differenceInCalendarDays(a: Date, b: Date) {
  const aDay = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const bDay = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.max(0, Math.round((aDay - bDay) / 86_400_000));
}
