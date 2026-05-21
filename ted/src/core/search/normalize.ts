/** Normalise pour recherche (minuscules, sans accents). */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Tokens significatifs (≥2 caractères), sans stopwords courants. */
export function searchTokens(text: string): string[] {
  const stop = new Set([
    'le',
    'la',
    'les',
    'de',
    'du',
    'des',
    'un',
    'une',
    'et',
    'ou',
    'en',
    'au',
    'aux',
    'pour',
    'par',
    'sur',
    'dans',
    'est',
    'sont',
    'peut',
    'puis',
    'je',
    'ce',
    'cette',
    'mon',
    'mes',
    'qui',
    'que',
    'quoi',
    'comment',
    'pourquoi',
  ]);
  return normalizeForSearch(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !stop.has(t));
}
