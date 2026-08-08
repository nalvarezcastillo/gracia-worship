import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageCurrentServiceTeam } from "@/components/manage-current-service-team";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getCurrentServiceTeam } from "@/lib/current-service-team";
import { getResourceManagerData } from "@/lib/resources";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo del servicio | Gracia Worship" };
export default async function ServiceTeamPage() { if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/service-team"); const [assignments, members, resourceData] = await Promise.all([getCurrentServiceTeam(), getTeamMembers(true), getResourceManagerData()]); return <AppPage title="Equipo del servicio" maxWidth="max-w-6xl" breadcrumb={<><span>Administración</span><span className="mx-2">›</span><span className="text-zinc-300">Equipo del servicio</span></>}><ManageCurrentServiceTeam initialAssignments={assignments} teamMembers={members} resourceCategories={resourceData.categories} availableResources={resourceData.resources} initialUsages={resourceData.usages} /></AppPage>; }
