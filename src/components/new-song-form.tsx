"use client";

import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PrimaryButton } from "@/components/ui/action-button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const fieldStyles =
  "min-h-12 w-full rounded-2xl border border-white/8 bg-zinc-950/45 px-4 text-base text-white shadow-inner shadow-black/10 outline-none transition-all duration-200 placeholder:text-zinc-600 hover:border-white/12 focus:border-emerald-400/50 focus:bg-zinc-950/60 focus:ring-4 focus:ring-emerald-400/[0.07]";

export function NewSongForm() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
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
    setMessage("Saving song...");

    try {
      const supabase = createSupabaseBrowserClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const folder = crypto.randomUUID();

      async function uploadFile(name: string, file: File | null) {
        if (!file) return "";
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
        uploadFile("cover", getFile(formData, "cover")),
        uploadFile("audio", getFile(formData, "audio")),
        uploadFile("sheet", getFile(formData, "sheet")),
      ]);

      const { error } = await supabase.schema("public").from("songs").insert({
        title,
        artist,
        key,
        bpm,
        duration,
        cover_url: coverUrl,
        audio_url: audioUrl,
        sheet_url: sheetUrl,
        video_url: "",
        lyrics,
        notes,
      });

      if (error) {
        throw new Error("Unable to save song details.");
      }

      setMessage("Song saved successfully");
      window.setTimeout(() => {
        router.push("/songs");
        router.refresh();
      }, 700);
    } catch (error) {
      setIsSaving(false);
      setIsError(true);
      setMessage(error instanceof Error ? error.message : "Unable to save song. Please try again.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-7 sm:mt-10 sm:space-y-8">
      <FormSection title="Song Details">
        <div className="grid gap-5 sm:grid-cols-2 sm:gap-6">
          <TextField label="Title" name="title" className="sm:col-span-2" />
          <TextField label="Artist" name="artist" className="sm:col-span-2" />
          <TextField label="Key" name="key" />
          <TextField label="BPM" name="bpm" type="number" inputMode="numeric" />
          <TextField label="Duration" name="duration" placeholder="5:18" className="sm:col-span-2" />
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
          <TextAreaField label="Lyrics" name="lyrics" rows={9} />
          <TextAreaField label="Notes" name="notes" rows={6} />
        </div>
      </FormSection>

      <div>
        <PrimaryButton type="submit" disabled={isSaving} className="min-h-14 w-full">{isSaving ? "Saving..." : "Save Song"}</PrimaryButton>
        <p role="status" aria-live="polite" className={`mt-4 min-h-6 text-center text-sm font-medium ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-3xl border border-white/[0.07] bg-zinc-900/60 p-5 shadow-xl shadow-black/10 sm:p-7"><h2 className="mb-5 text-xs font-bold uppercase tracking-[0.2em] text-zinc-200 sm:mb-6 sm:text-sm">{title}</h2>{children}</section>;
}

function FieldLabel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block ${className}`}><span className="mb-2 block text-sm font-semibold text-zinc-300">{label}</span>{children}</label>;
}

function TextField({ label, name, className, type = "text", inputMode, placeholder }: { label: string; name: string; className?: string; type?: "text" | "number"; inputMode?: "numeric"; placeholder?: string }) {
  return <FieldLabel label={label} className={className}><input required name={name} type={type} inputMode={inputMode} placeholder={placeholder} className={fieldStyles} /></FieldLabel>;
}

function FileField({ label, name, accept }: { label: string; name: string; accept: string }) {
  return <FieldLabel label={label}><input name={name} type="file" accept={accept} className={`${fieldStyles} cursor-pointer py-2 text-sm text-zinc-400 file:mr-4 file:min-h-8 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:font-semibold file:text-white`} /></FieldLabel>;
}

function TextAreaField({ label, name, rows }: { label: string; name: string; rows: number }) {
  return <FieldLabel label={label}><textarea required name={name} rows={rows} className={`${fieldStyles} resize-y py-3 leading-7`} /></FieldLabel>;
}

function getText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function getFile(formData: FormData, name: string) {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}
