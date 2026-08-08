import { parseAssignmentText } from "@/lib/assignment-text";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";

export function getServiceAssignmentResources(assignments: CurrentServiceTeamMember[], assignmentText: string, teamMembers: { id: string; name: string }[] = []) {
  const parsed = parseAssignmentText(assignmentText);
  const personName = normalizeAssignmentValue(parsed.name);
  const roleName = normalizeAssignmentValue(parsed.role);
  if (!personName) return [];

  const catalogMember = teamMembers.find((member) => normalizeAssignmentValue(member.name) === personName);
  const personAssignments = assignments.filter((assignment) => catalogMember
    ? assignment.team_member_id === catalogMember.id || (!assignment.team_member_id && normalizeAssignmentValue(assignment.person_name) === personName)
    : normalizeAssignmentValue(assignment.person_name) === personName);
  const match = roleName
    ? personAssignments.find((assignment) => normalizeAssignmentValue(assignment.role_name) === roleName)
    : personAssignments.length === 1 ? personAssignments[0] : undefined;
  if (!match) return [];

  return [...match.resources]
    .sort((first, second) => first.categorySortOrder - second.categorySortOrder
      || first.name.localeCompare(second.name, "es", { sensitivity: "base" }))
    .map((resource) => resource.name);
}

function normalizeAssignmentValue(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}
