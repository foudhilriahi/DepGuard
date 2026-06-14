export function normalizeVersionForLookup(input?: string): {
  original?: string;
  normalized?: string;
  resolution: "exact" | "range_unresolved" | "latest";
} {
  const trimmed = input?.trim();

  if (!trimmed) {
    return { original: input, normalized: undefined, resolution: "latest" };
  }

  const exact = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(trimmed);
  if (exact) {
    return { original: trimmed, normalized: trimmed, resolution: "exact" };
  }

  return { original: trimmed, normalized: undefined, resolution: "range_unresolved" };
}
