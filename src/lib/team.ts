import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TeamMember = { active: boolean; id: string; instrument: string | null; name: string; sort_order: number };

export async function getTeamMembers(activeOnly = false) {
  try {
    const supabase = await createSupabaseServerClient();
    let query = supabase.from("team_members").select("id, name, instrument, active, sort_order");
    query = activeOnly ? query.eq("active", true).order("name") : query.order("name");
    const { data, error } = await query;
    return error ? [] : data as TeamMember[];
  } catch { return []; }
}
