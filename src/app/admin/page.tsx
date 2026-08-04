import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CurrentServiceSettings } from "@/components/current-service-settings";
import { SignOutButton } from "@/components/sign-out-button";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";
import type { ActiveSetlistRow } from "@/lib/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Admin | Gracia Worship" };

export default async function AdminPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("active_setlist")
    .select("service_name, service_date, service_time")
    .eq("id", 1)
    .maybeSingle();
  const currentService = data as Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time"> | null;

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-2xl">
        <PageHeader eyebrow="Welcome" title="Admin" description="Manage the Gracia Worship song library." />

        <CurrentServiceSettings
          initialDate={currentService?.service_date ?? ""}
          initialName={currentService?.service_name === "Saturday Service" ? "Servicio del Sábado" : currentService?.service_name ?? "Servicio del Sábado"}
          initialTime={currentService?.service_time ?? "Saturday • 7:00 PM"}
        />

        <section className="mt-6 grid gap-3 sm:mt-8 sm:gap-4">
          <PrimaryButton href="/admin/song/new" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">➕</span>
            <span className="text-lg">Add Song</span>
          </PrimaryButton>
          <SecondaryButton href="/songs" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">🎵</span>
            <span className="text-lg">Manage Songs</span>
          </SecondaryButton>
          <SecondaryButton href="/admin/setlist" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">📋</span>
            <span className="text-lg">Manage Setlist</span>
          </SecondaryButton>
          <SecondaryButton href="/admin/microphones" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">🎤</span>
            <span className="text-lg">Administrar micrófonos</span>
          </SecondaryButton>
          <SignOutButton />
        </section>
      </MainContainer>
    </main>
  );
}
