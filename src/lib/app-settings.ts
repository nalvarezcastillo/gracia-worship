import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppSettings = {
  church_name: string;
  id: number;
  logo_url: string | null;
  ministry_name: string;
  service_day: string;
  service_time: string;
};

export const defaultAppSettings: AppSettings = {
  church_name: "Silverdale Gracia",
  id: 1,
  logo_url: null,
  ministry_name: "Gracia Worship",
  service_day: "Sábado",
  service_time: "7:00 PM",
};

export async function getAppSettings() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("app_settings").select("id, church_name, ministry_name, logo_url, service_day, service_time").eq("id", 1).maybeSingle();
    if (error || !data) return defaultAppSettings;
    return data as AppSettings;
  } catch {
    return defaultAppSettings;
  }
}
