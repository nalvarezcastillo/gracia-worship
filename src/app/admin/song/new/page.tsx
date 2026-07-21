import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewSongForm } from "@/components/new-song-form";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "New Song | Gracia Worship",
};

export default async function NewSongPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/song/new");

  return (
    <main className="min-h-screen py-8 sm:py-12">
      <MainContainer className="max-w-3xl">
        <PageHeader title="New Song" description="Add the song details and local files." />
        <NewSongForm />
      </MainContainer>
    </main>
  );
}
