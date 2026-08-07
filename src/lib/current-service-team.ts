import { createSupabaseServerClient } from "@/lib/supabase/server";

export type CurrentServiceTeamMember = { id: string; microphone_name: string | null; person_name: string; role_name: string; sort_order: number; team_member_id: string | null };

export type CurrentServiceTeamGroup = {
  personName: string;
  roles: string[];
  microphones: string[];
};

export function groupCurrentServiceTeam(assignments: CurrentServiceTeamMember[]): CurrentServiceTeamGroup[] {
  const groups = new Map<string, CurrentServiceTeamGroup>();

  for (const assignment of assignments) {
    const personName = assignment.person_name.trim();
    if (!personName) continue;
    const key = personName.toLocaleLowerCase("es");
    const group = groups.get(key) ?? { personName, roles: [], microphones: [] };
    addUnique(group.roles, assignment.role_name);
    addUnique(group.microphones, assignment.microphone_name);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function addUnique(values: string[], candidate: string | null) {
  const value = candidate?.trim();
  if (!value || values.some((current) => current.localeCompare(value, "es", { sensitivity: "base" }) === 0)) return;
  values.push(value);
}

export async function getCurrentServiceTeam() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("current_service_team").select("id, team_member_id, person_name, role_name, microphone_name, sort_order").order("sort_order").order("created_at");
    return error ? [] : data as CurrentServiceTeamMember[];
  } catch { return []; }
}
