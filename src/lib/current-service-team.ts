import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AssignedServiceResource = { categorySortOrder: number; id: string; name: string };
export type CurrentServiceTeamMember = { id: string; microphone_name: string | null; person_name: string; resources: AssignedServiceResource[]; role_name: string; sort_order: number; team_member_id: string | null };

export type CurrentServiceTeamGroup = {
  personName: string;
  roles: string[];
  resources: string[];
};

export function groupCurrentServiceTeam(assignments: CurrentServiceTeamMember[]): CurrentServiceTeamGroup[] {
  const groups = new Map<string, CurrentServiceTeamGroup & { resourceIds: Set<string> }>();

  for (const assignment of assignments) {
    const personName = assignment.person_name.trim();
    if (!personName) continue;
    const key = personName.toLocaleLowerCase("es");
    const group = groups.get(key) ?? { personName, roles: [], resources: [], resourceIds: new Set<string>() };
    addUnique(group.roles, assignment.role_name);
    if (assignment.resources.length) {
      for (const resource of assignment.resources) {
        if (group.resourceIds.has(resource.id)) continue;
        group.resourceIds.add(resource.id);
        addUnique(group.resources, resource.name);
      }
    } else {
      addUnique(group.resources, assignment.microphone_name);
    }
    groups.set(key, group);
  }

  return [...groups.values()].map(({ personName, roles, resources }) => ({
    personName,
    roles,
    resources: resources.sort((first, second) => first.localeCompare(second, "es", { sensitivity: "base" })),
  }));
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
    if (error) return [];
    const members = data ?? [];
    const { data: links, error: linksError } = await supabase.from("current_service_team_resources").select("service_team_id, resource_id");
    if (linksError || !links?.length) return members.map((member) => ({ ...member, resources: [] })) as CurrentServiceTeamMember[];
    const resourceIds = [...new Set(links.map((link) => link.resource_id))];
    const [{ data: resources }, { data: categories }] = await Promise.all([
      supabase.from("resources").select("id, name, category_id").in("id", resourceIds),
      supabase.from("resource_categories").select("id, sort_order"),
    ]);
    const categoryOrder = new Map((categories ?? []).map((category) => [category.id, category.sort_order]));
    const resourcesById = new Map((resources ?? []).map((resource) => [resource.id, {
      categorySortOrder: categoryOrder.get(resource.category_id) ?? Number.MAX_SAFE_INTEGER,
      id: resource.id,
      name: resource.name,
    }]));
    return members.map((member) => ({
      ...member,
      resources: links.filter((link) => link.service_team_id === member.id).flatMap((link) => {
        const resource = resourcesById.get(link.resource_id);
        return resource ? [resource] : [];
      }),
    })) as CurrentServiceTeamMember[];
  } catch { return []; }
}
