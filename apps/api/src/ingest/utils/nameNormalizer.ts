// Name normalization and similarity comparison utilities for matching
// legislator names across data sources (RST_PROPOSER, PUBL_PROPOSER, etc.)

const HONORIFIC_SUFFIXES = ["의원", "위원장", "위원", "장관", "총리"];

/**
 * Normalize a Korean name: NFC unicode normalize, strip whitespace, strip honorifics.
 */
export function normalizeName(s: string): string {
  if (!s) return "";
  let out = s.normalize("NFC").trim();
  // Remove all internal whitespace
  out = out.replace(/\s+/g, "");
  // Strip honorific suffixes (longest first)
  const sorted = [...HONORIFIC_SUFFIXES].sort((a, b) => b.length - a.length);
  for (const honorific of sorted) {
    if (out.endsWith(honorific)) {
      out = out.slice(0, -honorific.length);
      break;
    }
  }
  return out.trim();
}

/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev: number[] = new Array(b.length + 1);
  const curr: number[] = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }

  return prev[b.length]!;
}

/**
 * Compare two names. Returns a similarity score in [0, 1]:
 *   1.0  -> exact match
 *   0.9  -> normalized exact match
 *   ~0.7 -> close (Levenshtein distance 1 on short Korean names)
 *   0    -> no meaningful match
 */
export function compareName(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 0.9;

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  // Korean names are typically 2-4 chars; one edit on a 3-char name is too much
  if (maxLen <= 2) return 0;
  if (dist === 1 && maxLen >= 3) {
    // Approx 0.7 score for close-but-not-exact
    return 0.7;
  }
  // Fall through: compute normalized similarity but only return if reasonably high
  const sim = 1 - dist / maxLen;
  return sim >= 0.6 ? sim : 0;
}
