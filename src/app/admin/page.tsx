import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { PrimaryButton, SecondaryButton } from "@/components/ui/action-button";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin | Gracia Worship" };

export default async function AdminPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin");

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-2xl">
        <PageHeader eyebrow="Welcome" title="Admin" description="Manage the Gracia Worship song library." />

        <section className="mt-8 grid gap-3 sm:mt-10 sm:gap-4">
          <PrimaryButton href="/admin/song/new" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">➕</span>
            <span className="text-lg">Add Song</span>
          </PrimaryButton>
          <SecondaryButton href="/songs" className="min-h-20 w-full !justify-start !rounded-2xl px-5 text-left sm:min-h-24 sm:px-6">
            <span aria-hidden="true" className="mr-4 text-2xl">🎵</span>
            <span className="text-lg">Manage Songs</span>
          </SecondaryButton>
          <SignOutButton />
        </section>
      </MainContainer>
    </main>
  );
}
