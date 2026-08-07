import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageResources } from "@/components/manage-resources";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getResourceManagerData } from "@/lib/resources";

export const metadata: Metadata = { title: "Recursos | Gracia Worship" };

export default async function ResourcesPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/resources");
  const { categories, resources, usages, loadError } = await getResourceManagerData();

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-6xl">
        <h1 className="text-[1.75rem] font-bold text-white sm:text-[2rem]">Recursos</h1>
        <ManageResources initialCategories={categories} initialResources={resources} initialUsages={usages} loadError={loadError} />
      </MainContainer>
    </main>
  );
}
