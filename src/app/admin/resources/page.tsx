import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ManageResources } from "@/components/manage-resources";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getResourceManagerData } from "@/lib/resources";

export const metadata: Metadata = { title: "Recursos | Gracia Worship" };

export default async function ResourcesPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/resources");
  const { categories, resources, usages, loadError } = await getResourceManagerData();

  return <AppPage title="Recursos" maxWidth="max-w-6xl"><ManageResources initialCategories={categories} initialResources={resources} initialUsages={usages} loadError={loadError} /></AppPage>;
}
