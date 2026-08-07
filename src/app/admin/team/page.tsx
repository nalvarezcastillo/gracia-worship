import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageTeam } from "@/components/manage-team";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Equipo | Gracia Worship" };
export default async function TeamPage() { if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/team"); const members = await getTeamMembers(); return <main className="min-h-screen py-8 sm:py-12"><MainContainer className="max-w-3xl"><h1 className="text-[1.75rem] font-bold text-white sm:text-[2rem]">Equipo</h1><ManageTeam initialMembers={members} /></MainContainer></main>; }
