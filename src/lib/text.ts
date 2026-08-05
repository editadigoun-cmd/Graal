/** Normalise un texte pour une comparaison/recherche insensible aux accents et à la casse. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
