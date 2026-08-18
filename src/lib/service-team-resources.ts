import { parseAssignmentText } from "@/lib/assignment-text";
import type { CurrentServiceTeamMember } from "@/lib/current-service-team";

export function getServiceAssignmentResources(assignments: CurrentServiceTeamMember[], assignmentText: string, teamMembers: { id: string; name: string }[] = []) {
  const parsed = parseAssignmentText(assignmentText);
  const personName = normalizeAssignmentValue(parsed.name);
  const roleName = normalizeAssignmentValue(parsed.role);
  if (!personName) return [];

  const personAssignments = getPersonAssignments(assignments, personName, teamMembers);
  const match = roleName
    ? personAssignments.find((assignment) => normalizeAssignmentValue(assignment.role_name) === roleName)
    : personAssignments.length === 1 ? personAssignments[0] : undefined;
  if (!match) return [];

  const assignedResources = [...match.resources]
    .sort((first, second) => first.categorySortOrder - second.categorySortOrder
      || first.name.localeCompare(second.name, "es", { sensitivity: "base" }))
    .map((resource) => resource.name);

  const microphoneName = match.microphone_name?.trim();
  if (microphoneName && !assignedResources.some((resource) => normalizeAssignmentValue(resource) === normalizeAssignmentValue(microphoneName))) {
    assignedResources.unshift(microphoneName);
  }

  return assignedResources;
}

export function getServiceEntryMicrophones(assignments: CurrentServiceTeamMember[], assignmentText: string, teamMembers: { id: string; name: string }[] = []) {
  const personName = normalizeAssignmentValue(parseAssignmentText(assignmentText).name);
  if (!personName) return [];

  const microphoneNames = getPersonAssignments(assignments, personName, teamMembers).flatMap((assignment) => [
    ...assignment.resources.map((resource) => resource.name),
    ...(assignment.microphone_name ? [assignment.microphone_name] : []),
  ]).filter(isMicrophoneName);

  const unique = new Map<string, string>();
  for (const name of microphoneNames) {
    const value = name.trim();
    const key = normalizeAssignmentValue(value);
    if (value && !unique.has(key)) unique.set(key, value);
  }
  return [...unique.values()].sort((first, second) => first.localeCompare(second, "es", { sensitivity: "base", numeric: true }));
}

function getPersonAssignments(assignments: CurrentServiceTeamMember[], personName: string, teamMembers: { id: string; name: string }[]) {
  const catalogMember = teamMembers.find((member) => normalizeAssignmentValue(member.name) === personName);
  return assignments.filter((assignment) => catalogMember
    ? assignment.team_member_id === catalogMember.id || (!assignment.team_member_id && normalizeAssignmentValue(assignment.person_name) === personName)
    : normalizeAssignmentValue(assignment.person_name) === personName);
}

function isMicrophoneName(value: string) {
  return /\bmic(?:rofono|rophone)?\b/.test(normalizeAssignmentValue(value));
}

function normalizeAssignmentValue(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
}
