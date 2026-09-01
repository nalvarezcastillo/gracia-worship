import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageTeam } from "@/components/manage-team";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo | Gracia Worship" };
export default async function TeamPage() { if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/team"); const members = await getTeamMembers(); return <AppPage eyebrow="Personas" title="Equipo" description="Directorio del equipo de adoración y disponibilidad de sus integrantes." maxWidth="max-w-6xl"><ManageTeam initialMembers={members} /></AppPage>; }
