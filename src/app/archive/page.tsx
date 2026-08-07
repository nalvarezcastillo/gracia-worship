import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ServiceArchive, type ArchivedServiceSummary } from "@/components/service-archive";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Archivo de Servicios | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/archive");
  const supabase = await createSupabaseServerClient();
  const [{ data: services }, { data: items }] = await Promise.all([
    supabase.from("active_setlist").select("id, service_name, service_date").eq("status", "archived").order("service_date", { ascending: false }),
    supabase.from("service_items").select("service_id"),
  ]);
  const counts = new Map<number, number>();
  for (const item of items ?? []) counts.set(item.service_id, (counts.get(item.service_id) ?? 0) + 1);
  const archive = (services ?? []).map((service) => ({ ...service, itemCount: counts.get(service.id) ?? 0 })) as ArchivedServiceSummary[];
  return <main className="min-h-screen py-6 sm:py-10"><MainContainer className="max-w-3xl"><header><h1 className="text-[1.75rem] font-bold text-white sm:text-[2rem]">Archivo de Servicios</h1></header><ServiceArchive services={archive} /></MainContainer></main>;
}
