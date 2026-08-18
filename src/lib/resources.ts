import { createSupabaseServerClient } from "@/lib/supabase/server";
import { joinResourceUsages } from "@/lib/resource-availability";

export type ResourceCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type ServiceResource = {
  active: boolean;
  category_id: string;
  created_at: string;
  id: string;
  name: string;
  notes: string | null;
};

export type ResourceUsage = {
  assignment_id: string;
  person_name: string;
  resource_id: string;
};

export async function getResourceManagerData(serviceId: number) {
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: categories, error: categoriesError }, { data: resources, error: resourcesError }, { data: links, error: linksError }, { data: team }] = await Promise.all([
      supabase.from("resource_categories").select("id, name, sort_order").order("sort_order"),
      supabase.from("resources").select("id, name, category_id, active, notes, created_at"),
      supabase.from("service_team_assignment_resources").select("resource_id, assignment_id").eq("service_id", serviceId),
      supabase.from("service_team_assignments").select("id, person_name").eq("service_id", serviceId),
    ]);
    const usages = linksError ? [] : joinResourceUsages(links ?? [], team ?? []);

    return {
      categories: categoriesError ? [] : categories as ResourceCategory[],
      resources: resourcesError ? [] : resources as ServiceResource[],
      usages: usages as ResourceUsage[],
      loadError: categoriesError?.message ?? resourcesError?.message ?? null,
    };
  } catch (error) {
    return { categories: [], resources: [], usages: [], loadError: error instanceof Error ? error.message : "No fue posible cargar los recursos." };
  }
}
