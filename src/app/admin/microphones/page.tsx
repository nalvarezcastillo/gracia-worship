import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageMicrophones } from "@/components/manage-microphones";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getMicrophoneAssignmentsResult } from "@/lib/microphones";
import { getTeamMembers } from "@/lib/team";

export const metadata: Metadata = { title: "Micrófonos | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ManageMicrophonesPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/microphones");
  const [{ assignments, error }, teamMembers] = await Promise.all([getMicrophoneAssignmentsResult(), getTeamMembers(true)]);

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <PageHeader title="Micrófonos" description="Asigna un micrófono a cada líder de adoración." />
        <ManageMicrophones initialAssignments={assignments} loadError={error} teamMembers={teamMembers} />
      </MainContainer>
    </main>
  );
}
