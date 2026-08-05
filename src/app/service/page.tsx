import type { Metadata } from "next";
import { ServiceItems } from "@/components/service-items";
import { PrimaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServicePage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: songsData, error: songsError }, { data: serviceData }, isAdmin] = await Promise.all([
    supabase
      .from("service_items")
      .select("id, position, type, title, details, song_ids, created_at")
      .order("position", { ascending: true }),
    supabase
      .from("songs")
      .select("id, title, key, bpm, time_signature, audio_url, sheet_url, song_keys(audio_url, sheet_url, song_stems(id))")
      .order("title", { ascending: true }),
    supabase.from("active_setlist").select("service_name, service_date, service_time").eq("id", 1).maybeSingle(),
    hasAuthenticatedUser(),
  ]);

  const items = error ? [] : (data ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const songs = songsError ? [] : (songsData ?? []) as ServiceSong[];
  const loadError = error?.message ?? songsError?.message;
  const service = serviceData as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time"> | null;
  const serviceName = localizeDefaultServiceName(service?.service_name ?? "Servicio");
  const serviceSchedule = [
    service?.service_date ? formatServiceDate(service.service_date) : null,
    service?.service_time ? formatServiceTime(service.service_time) : null,
  ].filter(Boolean).join(" • ");

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <MainContainer className="max-w-3xl">
        <header className="flex flex-col gap-3 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[1.75rem] font-bold tracking-[-0.035em] text-white sm:text-[2rem]">{serviceName}</h1>
            {serviceSchedule ? <p className="mt-2 text-sm text-zinc-400 sm:text-base">{serviceSchedule}</p> : null}
          </div>
          <p className="text-sm text-zinc-500">{items.length} {items.length === 1 ? "elemento" : "elementos"}</p>
        </header>
        <ServiceItems initialItems={items} songs={songs} isAdmin={isAdmin} loadError={loadError} />
        <PrimaryButton href="/service/rehearsal" className="mt-10 w-full sm:mt-12">
          ▶ Comenzar ensayo
        </PrimaryButton>
      </MainContainer>
    </main>
  );
}

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(year, month - 1, day));
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
