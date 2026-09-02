import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageMicrophones } from "@/components/manage-microphones";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getMicrophoneAssignmentsResult } from "@/lib/microphones";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Micrófonos | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ManageMicrophonesPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/microphones");
  const [{ assignments, error }, teamMembers] = await Promise.all([getMicrophoneAssignmentsResult(), getTeamMembers(true)]);

  return <AppPage eyebrow="Recursos" title="Micrófonos" description="Administra las asignaciones de micrófonos para el equipo." maxWidth="max-w-5xl"><ManageMicrophones initialAssignments={assignments} loadError={error} teamMembers={teamMembers} /></AppPage>;
}
