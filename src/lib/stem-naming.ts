export const PREFERRED_STEM_NAMES = [
  "Click",
  "Guide",
  "Drums",
  "Perc",
  "Bass",
  "EGs",
  "Piano",
  "Synths",
  "BGVs",
] as const;

// Intentionally conservative: only Unicode/case/whitespace variants share an identity.
export function normalizeStemIdentity(name: string) {
  return name.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function preferredStemName(name: string) {
  const identity = normalizeStemIdentity(name);
  return PREFERRED_STEM_NAMES.find((preferred) => normalizeStemIdentity(preferred) === identity) ?? name.trim();
}

export function isPreferredStemName(name: string) {
  const identity = normalizeStemIdentity(name);
  return PREFERRED_STEM_NAMES.some((preferred) => normalizeStemIdentity(preferred) === identity);
}
