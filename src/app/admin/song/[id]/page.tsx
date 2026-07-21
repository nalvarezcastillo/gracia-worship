import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EditSongForm } from "@/components/edit-song-form";
import { MainContainer } from "@/components/ui/main-container";
import { PageHeader } from "@/components/ui/page-header";
import type { SongRecord } from "@/lib/database.types";
import { hasAuthenticatedUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Edit Song | Gracia Worship" };
export const dynamic = "force-dynamic";

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await hasAuthenticatedUser())) redirect(`/login?next=/admin/song/${id}`);
  let song: SongRecord | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.schema("public").from("songs").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    song = data as SongRecord | null;
  } catch {
    notFound();
  }

  if (!song) notFound();

  return (
    <main className="min-h-screen py-10 sm:py-14">
      <MainContainer className="max-w-3xl">
        <PageHeader title="Edit Song" description="Update the song details or replace its files." />
        <EditSongForm song={song} />
      </MainContainer>
    </main>
  );
}
