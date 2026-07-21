import type { Metadata } from "next";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { SignOutButton } from "@/components/sign-out-button";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile | Gracia Worship" };

export default async function ProfilePage() {
  const isAdmin = await hasAuthenticatedUser();

  return (
    <main className="min-h-screen py-10 sm:py-14">
      <MainContainer className="max-w-2xl">
        <PageHeader title="Profile" />
        <section className="mt-10 flex flex-col items-center rounded-3xl border border-white/8 bg-zinc-900/65 px-6 py-10 text-center sm:px-10">
          <div className="grid size-28 place-items-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-500 text-3xl font-bold text-zinc-950 ring-4 ring-white/8">NA</div>
          <h2 className="mt-6 text-2xl font-bold tracking-tight text-white">Nelson Alvarez</h2>
          <p className="mt-2 text-base text-zinc-400">nelson@example.com</p>
          {isAdmin ? <SignOutButton /> : null}
        </section>
      </MainContainer>
    </main>
  );
}
