import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageTeam } from "@/components/manage-team";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo | Gracia Worship" };
export default async function TeamPage() { if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/team"); const members = await getTeamMembers(); return <AppPage title="Equipo"><ManageTeam initialMembers={members} /></AppPage>; }
