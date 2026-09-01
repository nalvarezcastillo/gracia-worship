import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewSongForm } from "@/components/new-song-form";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "New Song | Gracia Worship",
};

export default async function NewSongPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/song/new");

  return (
      <AppPage maxWidth="max-w-4xl" eyebrow="Biblioteca / Nueva" title="Nueva canción" description="Agrega los datos musicales y archivos de la canción.">
        <div className="pb-16 sm:pb-0"><NewSongForm /></div>
      </AppPage>
  );
}
