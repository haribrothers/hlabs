// Matching for search (US-HOME-10): case- and accent-insensitive, every word of the query has to be found, and
// matches at the start rank first.

/** "Café Nextcloud" → "cafe nextcloud". */
export const foldText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * How well `text` matches `query`, lower is better, or null when it doesn't: 0 the text starts with the query,
 * 1 every query word starts a word of the text, 2 every query word is somewhere in it. An empty query matches
 * nothing.
 */
export function matchScore(text: string, query: string): number | null {
  const q = foldText(query).trim();
  if (!q) return null;
  const t = foldText(text);
  if (t.startsWith(q)) return 0;
  const words = t.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const terms = q.split(/\s+/);
  if (terms.every((term) => words.some((w) => w.startsWith(term)))) return 1;
  if (terms.every((term) => t.includes(term))) return 2;
  return null;
}

/** The best score of several texts (a name, its keywords), or null when none matches. */
export function bestMatch(texts: readonly string[], query: string): number | null {
  const scores = texts.map((t) => matchScore(t, query)).filter((s): s is number => s !== null);
  return scores.length ? Math.min(...scores) : null;
}
