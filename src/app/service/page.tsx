import type { Metadata } from "next";
import { ServiceItems } from "@/components/service-items";
import { PrimaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem, ServiceSong } from "@/lib/service";
import { normalizeServiceItemSongIds } from "@/lib/service-item-normalization";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team";
import { getCurrentServiceTeam } from "@/lib/current-service-team";

export const metadata: Metadata = { title: "Servicio | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ServicePage({ searchParams }: { searchParams: Promise<{ prepared?: string }> }) {
  const supabase = await createSupabaseServerClient();
  const { data: serviceData } = await supabase.from("active_setlist").select("id, service_name, service_date, service_time").eq("status", "active").maybeSingle();
  const serviceId = serviceData?.id ?? 1;
  const [{ data, error }, { data: songsData, error: songsError }, isAdmin, teamMembers, serviceTeamAssignments] = await Promise.all([
    supabase
      .from("service_items")
      .select("id, position, type, title, details, planned_duration_seconds, song_ids, created_at")
      .eq("service_id", serviceId)
      .order("position", { ascending: true }),
    supabase
      .from("songs")
      .select("id, title, key, bpm, duration, time_signature, audio_url, sheet_url, song_keys(audio_url, sheet_url, song_stems(id))")
      .order("title", { ascending: true }),
    hasAuthenticatedUser(),
    getTeamMembers(true),
    getCurrentServiceTeam(),
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
        <ServiceItems initialItems={items} songs={songs} isAdmin={isAdmin} loadError={loadError} serviceId={serviceId} serviceName={serviceName} serviceSchedule={serviceSchedule} showPreparedToast={(await searchParams).prepared === "1"} teamMembers={teamMembers} serviceTeamAssignments={serviceTeamAssignments} />
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
