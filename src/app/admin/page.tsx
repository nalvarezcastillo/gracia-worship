import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import packageJson from "../../../package.json";
import { AppMenuRow } from "@/components/app-menu-row";
import { AppSectionCard } from "@/components/app-section-card";
import { CurrentServiceSettings } from "@/components/current-service-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { DesktopAdminSidebar } from "@/components/desktop-admin-sidebar";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin | Gracia Worship" };

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin");
  const requestedService = (await searchParams).service;
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const supabase = await createSupabaseServerClient();
  const baseQuery = supabase.from("active_setlist").select("id, service_name, service_date, service_time, leader_notes, status");
  const { data } = requestedService && Number.isSafeInteger(requestedServiceId)
    ? await baseQuery.eq("id", requestedServiceId).maybeSingle()
    : await baseQuery.eq("status", "active").maybeSingle();
  const serviceId = data?.id ?? 1;
  if (requestedService && !data) notFound();
  if (data?.status === "archived" || data?.status === "completed") redirect(`/service/${data.id}`);
  const currentService = data as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time" | "leader_notes"> | null;

  return (
    <main className="min-h-screen py-8 sm:py-12 lg:py-0">
      <MainContainer className="max-w-4xl lg:max-w-none lg:px-0">
        <div className="lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <DesktopAdminSidebar version={packageJson.version} />
        <div className="min-w-0 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-7 lg:py-6 xl:px-9">
        <PageHeader eyebrow="Panel" title="Administración" description="Gestiona la biblioteca y el servicio actual." />

        <CurrentServiceSettings
          initialDate={currentService?.service_date ?? ""}
          initialName={currentService?.service_name === "Saturday Service" ? "Servicio del Sábado" : currentService?.service_name ?? "Servicio del Sábado"}
          initialTime={currentService?.service_time ?? "Saturday • 7:00 PM"}
          initialLeaderNotes={currentService?.leader_notes ?? ""}
          serviceId={serviceId}
        />

        <section className="lg:grid lg:grid-cols-3 lg:gap-5">
          <AppSectionCard eyebrow="Biblioteca" title="Biblioteca" compactDesktop className="lg:self-start">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href="/admin/song/new" label="Agregar canción" leadingSymbol="+" /><AppMenuRow href="/songs" label="Canciones" /></div>
          </AppSectionCard>

          <AppSectionCard eyebrow="Servicio" title="Servicio" compactDesktop className="lg:self-start">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href={`/admin/setlist?service=${serviceId}`} label="Editar Setlist" /><AppMenuRow href={`/admin/service-team?service=${serviceId}`} label="Equipo del servicio" /></div>
          </AppSectionCard>

          <AppSectionCard eyebrow="Administración" title="Administración" compactDesktop className="lg:self-start">
            <div className="divide-y divide-white/[0.06]"><AppMenuRow href="/admin/team" label="Equipo" /><AppMenuRow href="/admin/reports" label="Reportes" /><AppMenuRow href={`/admin/resources?service=${serviceId}`} label="Recursos" /><AppMenuRow href="/admin/settings" label="Configuración" /></div>
          </AppSectionCard>

          <div className="border-t border-white/[0.07] pt-6 lg:col-span-3 lg:mt-5 lg:pt-4"><SignOutButton /></div>
        </section>
        </div>
        </div>
      </MainContainer>
    </main>
  );
}
