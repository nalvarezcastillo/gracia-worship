import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageCurrentServiceTeam } from "@/components/manage-current-service-team";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getCurrentServiceTeam } from "@/lib/current-service-team";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo del servicio | Gracia Worship" };
export default async function ServiceTeamPage() { if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/service-team"); const [assignments, members] = await Promise.all([getCurrentServiceTeam(), getTeamMembers(true)]); return <main className="min-h-screen py-8 sm:py-12"><MainContainer className="max-w-3xl"><h1 className="text-[1.75rem] font-bold text-white sm:text-[2rem]">Equipo del servicio</h1><ManageCurrentServiceTeam initialAssignments={assignments} teamMembers={members} /></MainContainer></main>; }
