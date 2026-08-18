import type { ResourceUsage, ServiceResource } from "@/lib/resources";

export type ResourceAvailabilityStatus = "AVAILABLE" | "ASSIGNED_TO_CURRENT" | "ASSIGNED_TO_OTHER" | "INACTIVE";

export type ResourceAvailability = {
  assignedPersonName: string | null;
  assignedAssignmentId: string | null;
  resource: ServiceResource;
  status: ResourceAvailabilityStatus;
};

export function buildResourceAvailabilityMap(resources: ServiceResource[], usages: ResourceUsage[], currentAssignmentId: string | null) {
  const usageByResourceId = new Map(usages.map((usage) => [usage.resource_id, usage]));
  return new Map(resources.map((resource) => {
    const usage = usageByResourceId.get(resource.id);
    const status: ResourceAvailabilityStatus = !resource.active
      ? "INACTIVE"
      : !usage
        ? "AVAILABLE"
        : usage.assignment_id === currentAssignmentId
          ? "ASSIGNED_TO_CURRENT"
          : "ASSIGNED_TO_OTHER";
    return [resource.id, {
      assignedPersonName: usage?.person_name ?? null,
      assignedAssignmentId: usage?.assignment_id ?? null,
      resource,
      status,
    }];
  }));
}

export function joinResourceUsages(links: Array<{ assignment_id: string; resource_id: string }>, team: Array<{ id: string; person_name: string }>): ResourceUsage[] {
  const namesByTeamId = new Map(team.map((member) => [member.id, member.person_name]));
  return links.flatMap((link) => {
    const personName = namesByTeamId.get(link.assignment_id);
    return personName ? [{ assignment_id: link.assignment_id, resource_id: link.resource_id, person_name: personName }] : [];
  });
}
