import type { Metadata } from "next";
import { LiveMode } from "@/components/live-mode";
import { MainContainer } from "@/components/ui/main-container";
import type { ActiveSetlistRow } from "@/lib/database.types";
import type { ServiceItem } from "@/lib/service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "En Vivo | Gracia Worship" };
export const dynamic = "force-dynamic";

type LiveService = Pick<ActiveSetlistRow, "service_name" | "service_date" | "service_time">;

export default async function LivePage() {
  const supabase = await createSupabaseServerClient();
  const { data: serviceData, error: serviceError } = await supabase
      .from("active_setlist")
      .select("id, service_name, service_date, service_time")
      .eq("status", "active")
      .maybeSingle();
  const { data: itemsData, error: itemsError } = await supabase
      .from("service_items")
      .select("id, position, type, title, details, song_ids, created_at")
      .eq("service_id", serviceData?.id ?? -1)
      .order("position", { ascending: true });

  const service = serviceError ? null : serviceData as LiveService | null;
  const items = itemsError ? [] : (itemsData ?? []) as ServiceItem[];
  const loadError = serviceError?.message ?? itemsError?.message;

  return (
    <main className="min-h-screen py-6 sm:py-10">
      <MainContainer className="max-w-3xl">
        <LiveMode service={service} items={items} loadError={loadError} />
      </MainContainer>
    </main>
  );
}
