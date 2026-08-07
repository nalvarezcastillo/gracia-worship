import type { Metadata } from "next";
import { redirect } from "next/navigation";
import packageJson from "../../../../package.json";
import { AppSettingsForm } from "@/components/app-settings-form";
import { MainContainer } from "@/components/ui/main-container";
import { hasAuthenticatedUser } from "@/lib/auth";
import { getAppSettings } from "@/lib/app-settings";

export const metadata: Metadata = { title: "Configuración | Gracia Worship" };

export default async function SettingsPage() {
  if (!(await hasAuthenticatedUser())) redirect("/login?next=/admin/settings");
  const settings = await getAppSettings();
  return <main className="min-h-screen py-8 sm:py-12"><MainContainer className="max-w-2xl"><header><h1 className="text-[1.75rem] font-bold text-white sm:text-[2rem]">Configuración</h1></header><AppSettingsForm initialSettings={settings} version={packageJson.version} /></MainContainer></main>;
}
