import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ManageResources } from "@/components/manage-resources";
import { AppPage } from "@/components/app-page";
import { ServiceContextEmptyState } from "@/components/service-context-empty-state";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getResourceManagerData } from "@/lib/resources";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Recursos | Gracia Worship" };

export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const requestedService = (await searchParams).service;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=${encodeURIComponent(requestedService ? `/admin/resources?service=${requestedService}` : "/admin/resources")}`);
  const requestedServiceId = Number(requestedService);
  if (requestedService && (!Number.isSafeInteger(requestedServiceId) || requestedServiceId < 1 || requestedServiceId > 32767)) notFound();
  const supabase = await createSupabaseServerClient();
  const query = supabase.from("active_setlist").select("id, status");
  const { data: service } = requestedService
    ? await query.eq("id", requestedServiceId).maybeSingle()
    : await query.eq("status", "active").maybeSingle();
  if (requestedService && !service) notFound();
  if (!service) return <AppPage eyebrow="Operaciones" title="Recursos" description="Recursos disponibles para la planificación del servicio."><ServiceContextEmptyState message="Selecciona un servicio para administrar sus recursos." /></AppPage>;
  if (service.status === "completed" || service.status === "archived") redirect(`/service/${service.id}`);
  const { categories, resources, usages, loadError } = await getResourceManagerData(service.id);

  return <AppPage eyebrow="Operaciones" title="Recursos" description="Inventario y asignaciones del servicio actual." maxWidth="max-w-6xl" hideMobileHeader><ManageResources initialCategories={categories} initialResources={resources} initialUsages={usages} loadError={loadError} /></AppPage>;
}
