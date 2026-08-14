// Parseur CSV minimal (gère guillemets, virgule/point-virgule comme séparateur, \r\n) — pas de
// dépendance externe pour un besoin aussi simple, réutilisé par tous les écrans d'import.
export function parseCsv(texte: string): string[][] {
  const lignes: string[][] = []
  let ligne: string[] = []
  let champ = ''
  let dansGuillemets = false
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i]
    if (dansGuillemets) {
      if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++ }
      else if (c === '"') dansGuillemets = false
      else champ += c
    } else if (c === '"') dansGuillemets = true
    else if (c === ',' || c === ';') { ligne.push(champ); champ = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++
      ligne.push(champ); champ = ''
      if (ligne.some((v) => v.trim() !== '')) lignes.push(ligne)
      ligne = []
    } else champ += c
  }
  if (champ !== '' || ligne.length > 0) { ligne.push(champ); if (ligne.some((v) => v.trim() !== '')) lignes.push(ligne) }
  return lignes
}
