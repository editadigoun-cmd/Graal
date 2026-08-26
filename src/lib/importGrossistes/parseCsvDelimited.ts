// Le parseur CSV générique de l'app (@/lib/csv) scinde sur "," ET ";" — inadapté ici : ces
// exports grossiste sont strictement point-virgule mais contiennent des virgules littérales
// (décimales françaises "9,33", désignations "DICACILLINE 2,4MUI...") qui seraient sinon
// interprétées à tort comme séparateurs de champ.
export function parseCsvDelimited(texte: string, delimiteur: string): string[][] {
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
    else if (c === delimiteur) { ligne.push(champ); champ = '' }
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
