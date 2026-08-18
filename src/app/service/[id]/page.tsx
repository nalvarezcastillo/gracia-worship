import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServiceItems } from "@/components/service-items";
import { MainContainer } from "@/components/ui/main-container";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getServiceTeam } from "@/lib/current-service-team";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServiceWorkspacePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ prepared?: string }> }) {
  const serviceId = Number((await params).id);
  if (!Number.isSafeInteger(serviceId) || serviceId < 1 || serviceId > 32767) notFound();

  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: songsData, error: songsError }, { data: serviceData, error: serviceError }, { data: activeService }, authenticated, teamMembers, serviceTeamAssignments] = await Promise.all([
    supabase
      .from("service_items")
      .select("id, position, type, title, details, planned_duration_seconds, song_ids, song_id, created_at")
      .eq("service_id", serviceId)
      .order("position", { ascending: true }),
    supabase
      .from("songs")
      .select("id, title, artist, key, bpm, duration, time_signature, audio_url, sheet_url, song_keys(audio_url, sheet_url, song_stems(id))")
      .order("title", { ascending: true }),
    supabase.from("active_setlist").select("service_name, service_date, service_time, leader_notes, status").eq("id", serviceId).maybeSingle(),
    supabase.from("active_setlist").select("id").eq("status", "active").maybeSingle(),
    hasAuthenticatedUser(),
    getTeamMembers(true),
    getServiceTeam(serviceId),
  ]);

  if (serviceError || !serviceData) notFound();
  const items = error ? [] : (data ?? []).map((item) => normalizeServiceItemSongIds(item)) as ServiceItem[];
  const songs = songsError ? [] : (songsData ?? []) as ServiceSong[];
  const loadError = error?.message ?? songsError?.message;
  const service = serviceData as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time" | "leader_notes" | "status">;
  const isEditable = service.status === "active" || service.status === "planned";
  const serviceSchedule = [
    service.service_date ? formatServiceDate(service.service_date) : null,
    service.service_time ? formatServiceTime(service.service_time) : null,
  ].filter(Boolean).join(" • ");
  const mobileServiceSchedule = [
    service.service_date ? formatCompactServiceDate(service.service_date) : null,
    service.service_time ? formatServiceTime(service.service_time) : null,
  ].filter(Boolean).join(" • ");

  return (
    <main className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] pt-3 sm:py-10 lg:py-0">
      <MainContainer className="max-w-3xl lg:max-w-none lg:px-0">
        <ServiceItems initialItems={items} songs={songs} isAdmin={authenticated && isEditable} authenticated={authenticated} lifecycleStatus={service.status} hasCurrentActive={Boolean(activeService)} canDeleteService={authenticated && service.status === "planned"} loadError={loadError} mobileServiceSchedule={mobileServiceSchedule} serviceId={serviceId} serviceName={localizeDefaultServiceName(service.service_name)} serviceSchedule={serviceSchedule} serviceTime={service.service_time} showPreparedToast={(await searchParams).prepared === "1"} teamMembers={teamMembers} serviceTeamAssignments={serviceTeamAssignments} />
        {service.leader_notes?.trim() ? (
          <section className="mt-6 overflow-hidden rounded-3xl border border-white/[0.07] bg-zinc-900/60 shadow-xl shadow-black/10 sm:mt-8">
            <div className="border-b border-white/[0.06] p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Notas</p>
              <h2 className="mt-3 text-xl font-semibold text-white sm:text-2xl">Notas del líder</h2>
            </div>
            <p className="whitespace-pre-wrap p-5 text-base leading-7 text-zinc-300 sm:p-6">{service.leader_notes}</p>
          </section>
        ) : null}
      </MainContainer>
    </main>
  );
}

function localizeDefaultServiceName(value: string) { return value === "Saturday Service" ? "Servicio del Sábado" : value; }

function formatServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatCompactServiceDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const formatted = new Intl.DateTimeFormat("es-419", { weekday: "short", day: "numeric", month: "short" }).format(new Date(year, month - 1, day)).replaceAll(".", "");
  return formatted.charAt(0).toLocaleUpperCase("es-419") + formatted.slice(1);
}

function formatServiceTime(value: string) {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}
