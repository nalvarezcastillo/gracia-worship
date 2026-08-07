export function parseAssignmentText(value: string) {
  const [name = "", ...roleLines] = value.split("\n");
  return { name, role: roleLines.join("\n") };
}

export function formatAssignmentText(name: string, role: string) {
  return [name.trim(), role.trim()].filter(Boolean).join("\n");
}

export type ParsedAssignment = { name: string; role: string };

export function normalizeAssignmentTexts(values: string[]) {
  const unique = new Map<string, ParsedAssignment>();
  for (const value of values) {
    const parsed = parseAssignmentText(value);
    const assignment = { name: parsed.name.trim(), role: parsed.role.trim() };
    if (!assignment.name) continue;
    const key = `${assignment.name.toLocaleLowerCase("es")}\u0000${assignment.role.toLocaleLowerCase("es")}`;
    if (!unique.has(key)) unique.set(key, assignment);
  }
  const collator = new Intl.Collator("es", { sensitivity: "base" });
  return [...unique.values()].sort((first, second) => collator.compare(first.name, second.name) || collator.compare(first.role, second.role));
}
