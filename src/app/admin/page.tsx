import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, ChevronRight, FileText, ListMusic, Music2, Plus, Settings, UserRound, Users, Wrench, type LucideIcon } from "lucide-react";
import packageJson from "../../../package.json";
import { AppMenuRow } from "@/components/app-menu-row";
import { AppPage } from "@/components/app-page";
import { AppSectionCard } from "@/components/app-section-card";
import { CurrentServiceSettings } from "@/components/current-service-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { DesktopAdminSidebar } from "@/components/desktop-admin-sidebar";
import { ServiceContextEmptyState } from "@/components/service-context-empty-state";
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
  if (requestedService && !data) notFound();
  if (data?.status === "archived" || data?.status === "completed") redirect(`/service/${data.id}`);
  if (!data) return <AppPage title="Administración" description="Gestiona la biblioteca y los servicios." desktopAdminSidebar><ServiceContextEmptyState message="No hay un servicio próximo activo." /></AppPage>;
  const serviceId = data.id;
  const currentService = data as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time" | "leader_notes">;

  return (
    <main className="min-h-screen pt-4 pb-0 lg:py-0">
      <MainContainer className="max-w-4xl lg:max-w-none lg:px-0">
        <div className="lg:grid lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[220px_minmax(0,1fr)]">
        <DesktopAdminSidebar version={packageJson.version} />
        <div className="min-w-0 lg:mx-auto lg:w-full lg:max-w-6xl lg:px-7 lg:py-6 xl:px-9">
        <div className="lg:hidden"><h1 className="text-[1.75rem] font-bold tracking-[-0.035em] text-white">Administración</h1><p className="mt-1 text-sm text-zinc-500">Administra tu biblioteca y tu servicio.</p></div>
        <div className="hidden lg:block"><PageHeader eyebrow="Panel" title="Administración" description="Gestiona la biblioteca y el servicio actual." /></div>

        <CurrentServiceSettings
          initialDate={currentService?.service_date ?? ""}
          initialName={currentService?.service_name === "Saturday Service" ? "Servicio del Sábado" : currentService?.service_name ?? "Servicio del Sábado"}
          initialTime={currentService?.service_time ?? "Saturday • 7:00 PM"}
          initialLeaderNotes={currentService?.leader_notes ?? ""}
          initialStatus={data.status}
          serviceId={serviceId}
        />

        <section className="mt-7 space-y-7 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:hidden">
          <MobileAdminSection title="Servicio"><MobileAdminRow href={`/admin/setlist?service=${serviceId}`} label="Editar Setlist" description="Orden y elementos del servicio" icon={ListMusic} /><MobileAdminRow href={`/admin/service-team?service=${serviceId}`} label="Equipo del servicio" description="Personas y asignaciones" icon={Users} /><MobileAdminRow href={`/admin/resources?service=${serviceId}`} label="Recursos" icon={Wrench} /><MobileAdminRow href={`/service/${serviceId}/report`} label="Reporte del servicio" icon={FileText} /></MobileAdminSection>
          <MobileAdminSection title="Biblioteca"><MobileAdminRow href="/songs" label="Canciones" description="Biblioteca de canciones" icon={Music2} /><MobileAdminRow href="/admin/song/new" label="Agregar canción" icon={Plus} /><MobileAdminRow href="/admin/team" label="Personas" icon={UserRound} /></MobileAdminSection>
          <MobileAdminSection title="Administración"><MobileAdminRow href="/admin/reports" label="Reportes" icon={BarChart3} /><MobileAdminRow href="/admin/settings" label="Configuración" icon={Settings} /></MobileAdminSection>
          <div className="border-t border-white/[0.07] pt-4"><SignOutButton /></div>
        </section>

        <section className="hidden lg:grid lg:grid-cols-3 lg:gap-5">
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

function MobileAdminSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section><h2 className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-400">{title}</h2><div className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">{children}</div></section>;
}

function MobileAdminRow({ description, href, icon: Icon, label }: { description?: string; href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="text-zinc-200 transition-colors hover:text-emerald-300 focus-visible:outline-2 focus-visible:outline-emerald-400"
      style={{ display: "grid", gridTemplateColumns: "24px minmax(0, 1fr) 18px", columnGap: 12, alignItems: "center", width: "100%", minHeight: description ? 60 : 56, padding: "10px 0" }}
    >
      <div className="flex size-6 items-center justify-center self-center justify-self-start"><Icon aria-hidden="true" className="size-[18px] text-zinc-500" /></div>
      <div className="min-w-0 self-center">
        <div className="truncate text-[0.9375rem] font-semibold leading-[1.25]">{label}</div>
        {description ? <div className="mt-[3px] truncate text-xs font-normal leading-[1.3] text-zinc-500">{description}</div> : null}
      </div>
      <ChevronRight aria-hidden="true" className="size-[15px] self-center justify-self-end text-zinc-600" />
    </Link>
  );
}
