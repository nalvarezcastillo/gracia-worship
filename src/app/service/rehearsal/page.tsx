import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RehearsalPage() {
  const supabase = await createSupabaseServerClient();
  const { data: service, error } = await supabase.from("active_setlist").select("id").eq("status", "active").maybeSingle();
  if (error || !service) notFound();
  redirect(`/service/${service.id}/rehearsal`);
}
