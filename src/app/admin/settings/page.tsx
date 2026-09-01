import type { Metadata } from "next";
import { redirect } from "next/navigation";
import packageJson from "../../../../package.json";
import { AppSettingsForm } from "@/components/app-settings-form";
import { AppPage } from "@/components/app-page";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/app-settings";

export const metadata: Metadata = { title: "Configuración | Gracia Worship" };

export default async function SettingsPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/settings");
  const settings = await getAppSettings();
  return <AppPage eyebrow="Aplicación" title="Configuración" description="Identidad y valores predeterminados de Gracia Worship." maxWidth="max-w-4xl"><AppSettingsForm initialSettings={settings} version={packageJson.version} /></AppPage>;
}
