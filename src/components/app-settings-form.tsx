"use client";

import { useEffect, useState } from "react";
import { AppActionBar } from "@/components/app-action-bar";
import { AppFormSection } from "@/components/app-form-section";
import { PrimaryButton } from "@/components/ui/action-button";
import { appFieldStyles, appLabelStyles } from "@/components/ui/styles";
import type { AppSettings } from "@/lib/app-settings";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const acceptedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function AppSettingsForm({ initialSettings, version }: { initialSettings: AppSettings; version: string }) {
  const [settings, setSettings] = useState(initialSettings);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialSettings.logo_url ?? "/branding/gracia-worship-logo.png");
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  function selectLogo(file: File | null) {
    setMessage("");
    if (file && !acceptedLogoTypes.has(file.type)) { setLogoFile(null); setIsError(true); setMessage("Selecciona un archivo PNG, JPG, JPEG o WEBP."); return; }
    setLogoFile(file); setIsError(false);
    if (!file) setPreviewUrl(settings.logo_url ?? "/branding/gracia-worship-logo.png");
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true); setMessage(""); setIsError(false);
    const supabase = createSupabaseBrowserClient();
    let nextLogoUrl = settings.logo_url;
    let newStoragePath: string | null = null;

    try {
      if (logoFile) {
        const extension = logoFile.type === "image/png" ? "png" : logoFile.type === "image/webp" ? "webp" : "jpg";
        newStoragePath = `branding/app-logo-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("songs").upload(newStoragePath, logoFile, { contentType: logoFile.type, upsert: false });
        if (uploadError) throw uploadError;
        nextLogoUrl = supabase.storage.from("songs").getPublicUrl(newStoragePath).data.publicUrl;
      }

      const { data, error, status } = await supabase.from("app_settings").update({
        church_name: settings.church_name.trim(),
        ministry_name: settings.ministry_name.trim(),
        logo_url: nextLogoUrl,
        service_day: settings.service_day.trim(),
        service_time: settings.service_time.trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", 1).select("id, church_name, ministry_name, logo_url, service_day, service_time").single();
      if (error) { if (process.env.NODE_ENV !== "production") console.error("Unable to save app settings:", { ...error, status }); throw error; }
      if (!data) throw new Error("Supabase no devolvió la configuración guardada.");

      const previousPath = getManagedLogoPath(settings.logo_url);
      setSettings(data as AppSettings); setLogoFile(null); setPreviewUrl(data.logo_url ?? "/branding/gracia-worship-logo.png"); setMessage("Configuración guardada correctamente.");
      if (previousPath && previousPath !== newStoragePath) {
        const { error: removeError } = await supabase.storage.from("songs").remove([previousPath]);
        if (removeError && process.env.NODE_ENV !== "production") console.error("Unable to remove previous app logo:", removeError);
      }
    } catch (error) {
      if (newStoragePath) await supabase.storage.from("songs").remove([newStoragePath]);
      if (process.env.NODE_ENV !== "production") console.error("App settings save failed:", error);
      setIsError(true); setMessage(error instanceof Error ? error.message : "No fue posible guardar la configuración.");
    } finally { setIsSaving(false); }
  }

  return <form onSubmit={save} className="mt-6 space-y-6">
    <AppFormSection title="Identidad"><Field label="Nombre de la iglesia"><input required value={settings.church_name} onChange={(event) => setSettings({ ...settings, church_name: event.target.value })} className={`${appFieldStyles} mt-2`} /></Field><Field label="Nombre del ministerio"><input required value={settings.ministry_name} onChange={(event) => setSettings({ ...settings, ministry_name: event.target.value })} className={`${appFieldStyles} mt-2`} /></Field><Field label="Logo"><div role="img" aria-label="Vista previa del logo" className="mt-2 h-32 w-32 rounded-2xl border border-white/10 bg-zinc-950 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${previewUrl}")` }} /><input type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" onChange={(event) => selectLogo(event.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm text-zinc-400 file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-4 file:font-semibold file:text-white" /></Field></AppFormSection>
    <AppFormSection title="Servicio"><div className="grid gap-4 sm:grid-cols-2"><Field label="Día habitual"><input required value={settings.service_day} onChange={(event) => setSettings({ ...settings, service_day: event.target.value })} className={`${appFieldStyles} mt-2`} /></Field><Field label="Hora habitual"><input required value={settings.service_time} onChange={(event) => setSettings({ ...settings, service_time: event.target.value })} className={`${appFieldStyles} mt-2`} /></Field></div></AppFormSection>
    <AppFormSection title="Información"><dl className="space-y-2 text-sm"><div className="flex justify-between gap-4"><dt className="text-zinc-500">Nombre de la aplicación</dt><dd className="font-medium text-zinc-200">Gracia Worship</dd></div><div className="flex justify-between gap-4"><dt className="text-zinc-500">Versión actual</dt><dd className="font-medium text-zinc-200">{version}</dd></div></dl></AppFormSection>
    <AppActionBar><PrimaryButton type="submit" disabled={isSaving || !settings.church_name.trim() || !settings.ministry_name.trim() || !settings.service_day.trim() || !settings.service_time.trim()}>{isSaving ? "Guardando..." : "Guardar cambios"}</PrimaryButton><p role="status" aria-live="polite" className={`min-h-5 text-sm ${isError ? "text-rose-400" : "text-emerald-400"}`}>{message}</p></AppActionBar>
  </form>;
}

function Field({ children, label }: { children: React.ReactNode; label: string }) { return <label className={appLabelStyles}>{label}{children}</label>; }
function getManagedLogoPath(value: string | null) { if (!value || value.startsWith("/")) return null; try { const marker = "/storage/v1/object/public/songs/"; const path = new URL(value).pathname; const index = path.indexOf(marker); if (index < 0) return null; const storagePath = decodeURIComponent(path.slice(index + marker.length)); return storagePath.startsWith("branding/app-logo-") ? storagePath : null; } catch { return null; } }
