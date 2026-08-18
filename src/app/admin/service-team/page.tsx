import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ManageCurrentServiceTeam } from "@/components/manage-current-service-team";
import { AppPage } from "@/components/app-page";
import { ServiceContextEmptyState } from "@/components/service-context-empty-state";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getServiceTeam } from "@/lib/current-service-team";
import { getResourceManagerData } from "@/lib/resources";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo del servicio | Gracia Worship" };
export default async function ServiceTeamPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const requestedService = (await searchParams).service;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=${encodeURIComponent(requestedService ? `/admin/service-team?service=${requestedService}` : "/admin/service-team")}`);
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("active_setlist").select("id, service_name, status");
  const { data: service } = requestedService
    ? await query.eq("id", requestedServiceId).maybeSingle()
    : await query.eq("status", "active").maybeSingle();
  if (requestedService && !service) notFound();
  if (!service) return <AppPage title="Equipo del servicio" desktopAdminSidebar><ServiceContextEmptyState message="Selecciona un servicio para administrar su equipo." /></AppPage>;
  if (service.status === "completed" || service.status === "archived") redirect(`/service/${service.id}`);
  const [assignments, members, resourceData] = await Promise.all([
    getServiceTeam(service.id),
    getTeamMembers(true),
    getResourceManagerData(service.id),
  ]);
  const serviceName = service.service_name === "Saturday Service" ? "Servicio del Sábado" : service.service_name;
  return <AppPage title="Equipo del servicio" maxWidth="max-w-6xl" desktopAdminSidebar hideMobileHeader breadcrumb={<><span>Administración</span><span className="mx-2">›</span><span className="text-zinc-300">Equipo del servicio</span></>}><ManageCurrentServiceTeam initialAssignments={assignments} teamMembers={members} resourceCategories={resourceData.categories} availableResources={resourceData.resources} initialUsages={resourceData.usages} serviceId={service.id} serviceName={serviceName} /></AppPage>;
}
