import type { ResourceUsage, ServiceResource } from "@/lib/resources";

export type ResourceAvailabilityStatus = "AVAILABLE" | "ASSIGNED_TO_CURRENT" | "ASSIGNED_TO_OTHER" | "INACTIVE";

export type ResourceAvailability = {
  assignedPersonName: string | null;
  assignedServiceTeamId: string | null;
  resource: ServiceResource;
  status: ResourceAvailabilityStatus;
};

export function buildResourceAvailabilityMap(resources: ServiceResource[], usages: ResourceUsage[], currentServiceTeamId: string | null) {
  const usageByResourceId = new Map(usages.map((usage) => [usage.resource_id, usage]));
  return new Map(resources.map((resource) => {
    const usage = usageByResourceId.get(resource.id);
    const status: ResourceAvailabilityStatus = !resource.active
      ? "INACTIVE"
      : !usage
        ? "AVAILABLE"
        : usage.service_team_id === currentServiceTeamId
          ? "ASSIGNED_TO_CURRENT"
          : "ASSIGNED_TO_OTHER";
    return [resource.id, {
      assignedPersonName: usage?.person_name ?? null,
      assignedServiceTeamId: usage?.service_team_id ?? null,
      resource,
      status,
    }];
  }));
}

export function joinResourceUsages(links: Array<{ resource_id: string; service_team_id: string }>, team: Array<{ id: string; person_name: string }>): ResourceUsage[] {
  const namesByTeamId = new Map(team.map((member) => [member.id, member.person_name]));
  return links.flatMap((link) => {
    const personName = namesByTeamId.get(link.service_team_id);
    return personName ? [{ resource_id: link.resource_id, service_team_id: link.service_team_id, person_name: personName }] : [];
  });
}
