import { isValidMusicalGrid } from "@/lib/musical-grid";
import { isPreferredStemName, normalizeStemIdentity } from "@/lib/stem-naming";

export type PreflightSeverity = "ready" | "warning" | "info";

export type PreflightDetail = {
  href?: string;
  label: string;
  message: string;
};

export type PreflightCheck = {
  details?: PreflightDetail[];
  id: string;
  label: string;
  message: string;
  severity: PreflightSeverity;
};

export type PreflightSection = {
  checks: PreflightCheck[];
  id: "order" | "songs" | "playback" | "team";
  label: string;
};

export type PreflightResult = {
  sections: PreflightSection[];
  summary: Record<PreflightSeverity, number>;
};

export type PreflightSongKey = {
  gridBeatUnit: number | null;
  gridBeatsPerBar: number | null;
  gridBpm: number | null;
  gridOffsetSeconds: number | null;
  id: string;
  sections: number;
  stems: { name: string }[];
};

export type PreflightOccurrence = {
  effectiveKey: string | null;
  id: string;
  itemId: string;
  keyVariant: PreflightSongKey | null;
  plannedDurationSeconds: number | null;
  songId: string;
  title: string;
};

export type PreflightOperationalEntry = {
  label: string;
  plannedDurationSeconds: number | null;
};

export function buildServicePreflight({ mixOccurrenceKeys, occurrences, operationalEntries, serviceDate, serviceTime, teamAssignmentCount }: {
  mixOccurrenceKeys: Set<string>;
  occurrences: PreflightOccurrence[];
  operationalEntries: PreflightOperationalEntry[];
  serviceDate: string | null;
  serviceTime: string | null;
  teamAssignmentCount: number;
}): PreflightResult {
  const missingDurations = operationalEntries.filter((entry) => !isUsableDuration(entry.plannedDurationSeconds));
  const operationalCount = operationalEntries.length;
  const missingKeys = occurrences.filter((occurrence) => !occurrence.effectiveKey?.trim());
  const withoutMultitrack = occurrences.filter((occurrence) => !occurrence.keyVariant?.stems.length);
  const withMultitrack = occurrences.filter((occurrence) => Boolean(occurrence.keyVariant?.stems.length));
  const missingGrid = withMultitrack.filter((occurrence) => !hasValidGrid(occurrence.keyVariant));
  const missingSections = withMultitrack.filter((occurrence) => !occurrence.keyVariant?.sections);
  const duplicateStems = withMultitrack.flatMap((occurrence) => getDuplicateStemDetails(occurrence));
  const customStemDetails = withMultitrack.flatMap((occurrence) => getCustomStemDetails(occurrence));
  const customizedMixes = withMultitrack.filter((occurrence) => mixOccurrenceKeys.has(`${occurrence.itemId}:${occurrence.songId}`)).length;

  const sections: PreflightSection[] = [
    {
      id: "order",
      label: "Orden del servicio",
      checks: [
        operationalCount > 0
          ? check("operational-items", "Elementos operativos", "ready", `${operationalCount} ${operationalCount === 1 ? "elemento operativo" : "elementos operativos"} en el orden.`)
          : check("operational-items", "Elementos operativos", "warning", "El servicio no tiene elementos en el orden."),
        missingDurations.length
          ? check("planned-duration", "Duración planificada", "warning", `${missingDurations.length} ${missingDurations.length === 1 ? "ocurrencia no tiene" : "ocurrencias no tienen"} duración planificada utilizable.`, missingDurations.map((entry) => ({ label: entry.label, message: "Sin duración planificada" })))
          : check("planned-duration", "Duración planificada", "ready", operationalCount ? "Todos los elementos operativos tienen duración utilizable." : "No hay elementos que evaluar."),
        serviceDate && serviceTime?.trim()
          ? check("schedule", "Fecha y hora", "ready", "La fecha y hora del servicio están configuradas.")
          : check("schedule", "Fecha y hora", "warning", "Falta configurar la fecha o la hora del servicio."),
      ],
    },
    {
      id: "songs",
      label: "Canciones",
      checks: occurrences.length ? [
        missingKeys.length
          ? check("keys", "Tonalidades", "warning", `${missingKeys.length} ${missingKeys.length === 1 ? "ocurrencia no tiene" : "ocurrencias no tienen"} tonalidad definida.`, detailsForOccurrences(missingKeys, "Sin tonalidad efectiva"))
          : check("keys", "Tonalidades", "ready", `Las ${occurrences.length} ocurrencias de canciones tienen tonalidad efectiva.`),
        withoutMultitrack.length
          ? check("multitrack", "Multitrack", "info", `${withoutMultitrack.length} ${withoutMultitrack.length === 1 ? "ocurrencia no tiene" : "ocurrencias no tienen"} multitrack para su tonalidad efectiva.`, detailsForOccurrences(withoutMultitrack, "Sin multitrack; no bloquea la operación"))
          : check("multitrack", "Multitrack", "ready", `Las ${occurrences.length} ocurrencias de canciones tienen pistas disponibles.`),
      ] : [check("songs", "Canciones", "info", "El orden no contiene canciones.")],
    },
    {
      id: "playback",
      label: "Playback",
      checks: [
        missingGrid.length
          ? check("grid", "Grid Musical", "warning", `${missingGrid.length} ${missingGrid.length === 1 ? "ocurrencia con multitrack no tiene" : "ocurrencias con multitrack no tienen"} un Grid Musical válido.`, detailsForOccurrences(missingGrid, "Sin Grid Musical válido"))
          : check("grid", "Grid Musical", withMultitrack.length ? "ready" : "info", withMultitrack.length ? "Todas las ocurrencias con multitrack tienen Grid Musical válido." : "No hay multitracks que evaluar."),
        missingSections.length
          ? check("sections", "Secciones", "warning", `${missingSections.length} ${missingSections.length === 1 ? "ocurrencia con multitrack no tiene" : "ocurrencias con multitrack no tienen"} secciones.`, detailsForOccurrences(missingSections, "Sin secciones configuradas"))
          : check("sections", "Secciones", withMultitrack.length ? "ready" : "info", withMultitrack.length ? "Todas las ocurrencias con multitrack tienen secciones." : "No hay multitracks que evaluar."),
        duplicateStems.length
          ? check("stem-identities", "Identidad de pistas", "warning", "Hay nombres de pistas con identidad lógica duplicada.", duplicateStems)
          : check("stem-identities", "Identidad de pistas", withMultitrack.length ? "ready" : "info", withMultitrack.length ? "No hay identidades lógicas duplicadas entre las pistas usadas." : "No hay pistas que evaluar."),
        customStemDetails.length
          ? check("stem-names", "Nombres personalizados", "info", "Hay pistas con nombres personalizados válidos. Conviene mantenerlos consistentes para reutilizar presets.", customStemDetails)
          : check("stem-names", "Convención de pistas", withMultitrack.length ? "ready" : "info", withMultitrack.length ? "Las pistas usan la convención preferida." : "No hay pistas que evaluar."),
        check("custom-mix", "Mezcla personalizada", "info", `${customizedMixes} de ${withMultitrack.length} ocurrencias con multitrack tienen ajustes personalizados guardados. La ausencia de ajustes no implica falta de preparación.`),
        check("routing", "Ruteo de audio", "info", "El ruteo de audio se verifica en la estación de Playback."),
      ],
    },
    {
      id: "team",
      label: "Equipo",
      checks: [teamAssignmentCount
        ? check("team-assignments", "Asignaciones", "ready", `${teamAssignmentCount} ${teamAssignmentCount === 1 ? "asignación de equipo" : "asignaciones de equipo"}.`)
        : check("team-assignments", "Asignaciones", "info", "No hay asignaciones de equipo. Preflight no presupone roles obligatorios.")],
    },
  ];

  const checks = sections.flatMap((section) => section.checks);
  return {
    sections,
    summary: {
      info: checks.filter((entry) => entry.severity === "info").length,
      ready: checks.filter((entry) => entry.severity === "ready").length,
      warning: checks.filter((entry) => entry.severity === "warning").length,
    },
  };
}

function check(id: string, label: string, severity: PreflightSeverity, message: string, details?: PreflightDetail[]): PreflightCheck {
  return { details: details?.length ? details : undefined, id, label, message, severity };
}

function detailsForOccurrences(occurrences: PreflightOccurrence[], message: string) {
  return occurrences.map((occurrence) => ({ href: `/song/${occurrence.songId}`, label: occurrence.title, message }));
}

function getDuplicateStemDetails(occurrence: PreflightOccurrence) {
  const names = occurrence.keyVariant?.stems.map((stem) => stem.name.trim()).filter(Boolean) ?? [];
  const identities = new Map<string, string[]>();
  for (const name of names) {
    const identity = normalizeStemIdentity(name);
    if (!identity) continue;
    identities.set(identity, [...(identities.get(identity) ?? []), name]);
  }
  return Array.from(identities.values()).filter((matches) => matches.length > 1).map((matches) => ({ label: occurrence.title, message: `Identidad duplicada: ${matches.join(" / ")}` }));
}

function getCustomStemDetails(occurrence: PreflightOccurrence) {
  const customNames = [...new Set(occurrence.keyVariant?.stems.map((stem) => stem.name.trim()).filter((name) => name && !isPreferredStemName(name)) ?? [])];
  return customNames.length ? [{ label: occurrence.title, message: `Nombres personalizados: ${customNames.join(", ")}` }] : [];
}

function hasValidGrid(key: PreflightSongKey | null) {
  if (!key || key.gridBpm === null || key.gridBeatsPerBar === null || key.gridBeatUnit === null || key.gridOffsetSeconds === null) return false;
  return isValidMusicalGrid({ beatUnit: key.gridBeatUnit, beatsPerBar: key.gridBeatsPerBar, bpm: key.gridBpm, gridOffsetSeconds: key.gridOffsetSeconds });
}

function isUsableDuration(value: number | null) {
  return Number.isInteger(value) && (value ?? 0) > 0;
}
