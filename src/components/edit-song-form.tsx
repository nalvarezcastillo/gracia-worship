"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/action-button";
import type { SongRecord } from "@/lib/database.types";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles = "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/12 focus:border-emerald-400/50 focus:bg-zinc-950/60 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function EditSongForm({ song }: { song: SongRecord }) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const title = getText(formData, "title");
    const artist = getText(formData, "artist");
    const key = getText(formData, "key");
    const bpm = Number(getText(formData, "bpm"));
    const duration = getText(formData, "duration");
    const lyrics = getText(formData, "lyrics");
    const notes = getText(formData, "notes");

    if (!title || !artist || !key || !duration || !lyrics || !notes || !Number.isFinite(bpm) || bpm <= 0) {
      setIsError(true);
      setMessage("Please complete all required fields.");
      return;
    }

    setIsSaving(true);
    setIsError(false);
    setMessage("Saving changes...");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const folder = `${song.id}/${crypto.randomUUID()}`;

      async function uploadReplacement(name: string, file: File | null, currentUrl: string) {
        if (!file) return currentUrl;
        const extension = file.name.split(".").pop()?.toLowerCase() || "file";
        const path = `${folder}/${name}.${extension}`;
        const { error } = await supabase.storage.from("songs").upload(path, file, {
          cacheControl: "3600",
          contentType: file.type || undefined,
          upsert: false,
        });
        if (error) {
          throw new Error(`Unable to upload ${name}.`);
        }
        return supabase.storage.from("songs").getPublicUrl(path).data.publicUrl;
      }

      const [coverUrl, audioUrl, sheetUrl] = await Promise.all([
        uploadReplacement("cover", getFile(formData, "cover"), song.cover_url),
        uploadReplacement("audio", getFile(formData, "audio"), song.audio_url),
        uploadReplacement("sheet", getFile(formData, "sheet"), song.sheet_url),
      ]);

      const { error } = await supabase.schema("public").from("songs").update({
        title,
        artist,
        key,
        bpm,
        duration,
        cover_url: coverUrl,
        audio_url: audioUrl,
        sheet_url: sheetUrl,
        lyrics,
        notes,
      }).eq("id", song.id);

      if (error) {
        throw new Error("Unable to update song details.");
      }

      setMessage("Song updated successfully");
      window.setTimeout(() => {
        router.push(`/song/${song.id}`);
        router.refresh();
      }, 700);
    } catch (error) {
      setIsSaving(false);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to update song. Please try again.");
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setIsError(false);
    setMessage("Deleting song...");

    try {
      const supabase = createSupabaseBrowserClient();
      const paths = [song.cover_url, song.audio_url, song.sheet_url]
        .map(getStoragePath)
        .filter((path): path is string => Boolean(path));

      if (paths.length > 0) {
        const { error } = await supabase.storage.from("songs").remove(paths);
        if (error) {
          console.error("Unable to delete associated song files:", error);
          throw new Error("Unable to delete song files.");
        }
      }

      const { error } = await supabase.schema("public").from("songs").delete().eq("id", song.id);
      if (error) {
        console.error("Unable to delete song record:", error);
        throw new Error("Unable to delete song details.");
      }

      router.replace("/songs?deleted=1");
      router.refresh();
    } catch (error) {
      console.error("Song deletion failed:", error);
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to delete song. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-7 sm:mt-10 sm:space-y-8">
      <FormSection title="Song Details">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <TextField label="Title" name="title" defaultValue={song.title} className="sm:col-span-2" />
          <TextField label="Artist" name="artist" defaultValue={song.artist} className="sm:col-span-2" />
          <TextField label="Key" name="key" defaultValue={song.key} />
          <TextField label="BPM" name="bpm" defaultValue={String(song.bpm)} type="number" inputMode="numeric" />
          <TextField label="Duration" name="duration" defaultValue={song.duration} className="sm:col-span-2" />
        </div>
      </FormSection>

      <FormSection title="Files">
        <div className="space-y-5 sm:space-y-6">
          <FileField label="Cover Image" name="cover" accept="image/*" />
          <FileField label="Audio (.mp3)" name="audio" accept="audio/mpeg,.mp3" />
          <FileField label="Sheet Music (.pdf)" name="sheet" accept="application/pdf,.pdf" />
        </div>
      </FormSection>

      <FormSection title="Content">
        <div className="space-y-5 sm:space-y-6">
          <TextAreaField label="Lyrics" name="lyrics" rows={9} defaultValue={song.lyrics} />
          <TextAreaField label="Notes" name="notes" rows={6} defaultValue={song.notes} />
        </div>
      </FormSection>

      <div>
        <PrimaryButton type="submit" disabled={isSaving || isDeleting} className="min-h-14 w-full">{isSaving ? "Saving..." : "Save Changes"}</PrimaryButton>
        <button
          type="button"
          onClick={() => setIsDeleteDialogOpen(true)}
          disabled={isSaving || isDeleting}
          className="mt-4 inline-flex min-h-14 w-full items-center justify-center rounded-full border border-rose-400/25 bg-rose-400/[0.07] px-6 text-base font-semibold text-rose-300 shadow-sm shadow-black/20 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-rose-400/40 hover:bg-rose-400/12 active:translate-y-0 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeleting ? "Deleting..." : "Delete Song"}
        </button>
        <p role="status" aria-live="polite" className={`mt-4 min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </div>

      {isDeleteDialogOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="delete-song-title" aria-describedby="delete-song-description" className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-900 p-6 shadow-2xl shadow-black/60 sm:p-7">
            <h2 id="delete-song-title" className="text-2xl font-bold tracking-tight text-white">Delete Song</h2>
            <div id="delete-song-description" className="mt-4 space-y-3 text-base leading-7 text-zinc-400">
              <p>Are you sure you want to permanently delete this song?</p>
              <p className="text-sm text-rose-300">This action cannot be undone.</p>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting} className="min-h-12 rounded-full border border-white/10 bg-white/[0.055] px-5 font-semibold text-white transition-all duration-200 hover:bg-white/10 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleDelete} disabled={isDeleting} className="min-h-12 rounded-full bg-rose-500 px-5 font-semibold text-white shadow-lg shadow-rose-950/30 transition-all duration-200 hover:bg-rose-400 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:opacity-50">{isDeleting ? "Deleting..." : "Delete"}</button>
            </div>
          </section>
        </div>
      ) : null}
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-xl shadow-black/10 sm:p-7"><h2 className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-200 sm:mb-6 sm:text-sm">{title}</h2>{children}</section>;
}

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span>{children}</label>;
}

function TextField({ label, name, defaultValue, className, type = "text", inputMode }: { label: string; name: string; defaultValue: string; className?: string; type?: "text" | "number"; inputMode?: "numeric" }) {
  return <FieldLabel label={label} className={className}><input required name={name} defaultValue={defaultValue} type={type} inputMode={inputMode} className={fieldStyles} /></FieldLabel>;
}

function FileField({ label, name, accept }: { label: string; name: string; accept: string }) {
  return <FieldLabel label={label}><input name={name} type="file" accept={accept} className={`${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400 file:mr-4 file:min-h-8 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:font-semibold file:text-white`} /></FieldLabel>;
}

function TextAreaField({ label, name, rows, defaultValue }: { label: string; name: string; rows: number; defaultValue: string }) {
  return <FieldLabel label={label}><textarea required name={name} rows={rows} defaultValue={defaultValue} className={`${fieldStyles} resize-y py-3 leading-7`} /></FieldLabel>;
}

function getText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

function getStoragePath(publicUrl: string) {
  if (!publicUrl) return null;

  try {
    const marker = "/storage/v1/object/public/songs/";
    const pathname = new URL(publicUrl).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}
