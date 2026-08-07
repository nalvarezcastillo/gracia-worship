import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppMenuRow } from "@/components/app-menu-row";
import { AppSectionCard } from "@/components/app-section-card";
import { CurrentServiceSettings } from "@/components/current-service-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin | Gracia Worship" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin");
  const requestedService = (await searchParams).service;
  const requestedServiceId = Number(requestedService);
  const supabase = await createSupabaseServerClient();
  const baseQuery = supabase.from("active_setlist").select("id, service_name, service_date, service_time, leader_notes, status");
  const { data } = requestedService && Number.isSafeInteger(requestedServiceId)
    ? await baseQuery.eq("id", requestedServiceId).maybeSingle()
    : await baseQuery.eq("status", "active").maybeSingle();
  const serviceId = data?.id ?? 1;
  if (data?.status === "archived") redirect(`/service/${data.id}`);
  const currentService = data as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time" | "leader_notes"> | null;

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-4xl">
        <PageHeader eyebrow="Panel" title="Administración" description="Gestiona la biblioteca y el servicio actual." />

        <CurrentServiceSettings
          initialDate={currentService?.service_date ?? ""}
          initialName={currentService?.service_name === "Saturday Service" ? "Servicio del Sábado" : currentService?.service_name ?? "Servicio del Sábado"}
          initialTime={currentService?.service_time ?? "Saturday • 7:00 PM"}
          initialLeaderNotes={currentService?.leader_notes ?? ""}
          serviceId={serviceId}
        />

        <section className="lg:grid lg:grid-cols-3 lg:gap-6">
          <AppSectionCard eyebrow="Biblioteca" title="Biblioteca">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href="/admin/song/new" label="Agregar canción" leadingSymbol="+" /><AppMenuRow href="/songs" label="Canciones" /></div>
          </AppSectionCard>

          <AppSectionCard eyebrow="Servicio" title="Servicio">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href="/admin/setlist" label="Editar servicio" /><AppMenuRow href="/admin/service-team" label="Equipo del servicio" /></div>
          </AppSectionCard>

          <AppSectionCard eyebrow="Administración" title="Administración">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href="/admin/team" label="Equipo" /><AppMenuRow href="/admin/resources" label="Recursos" /><AppMenuRow href="/admin/settings" label="Configuración" /></div>
          </AppSectionCard>

          <div className="border-t border-white/[0.07] pt-6 lg:col-span-3"><SignOutButton /></div>
        </section>
      </MainContainer>
    </main>
  );
}
