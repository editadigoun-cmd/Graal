import { useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconDownload } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

const SPECIALITES = ['GENERALISTE', 'GYNECOLOGUE', 'PEDIATRE', 'CARDIOLOGUE', 'RHUMATOLOGUE', 'ORL', 'AUTRE_SPECIALITE', 'MATERNITE', 'DISPENSAIRE', 'PHARMACIE']
const POTENTIELS = ['GROS', 'MOYEN', 'FAIBLE']
const SECTEURS = ['A', 'B']
const COLONNES = ['nom', 'centre', 'specialite', 'potentiel', 'categorie', 'secteur', 'jour_heure', 'contacts', 'observations', 'frequence', 'email_vm']

interface LigneImport {
  nom: string; centre: string; specialite: string; potentiel: string; categorie: string
  secteur: string; jour_heure: string; contacts: string; observations: string; frequence: string; email_vm: string
  erreurs: string[]
}

function parseCsv(texte: string): string[][] {
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

export default function ManagementImportPortefeuille() {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [fichierNom, setFichierNom] = useState('')
  const [lignes, setLignes] = useState<LigneImport[]>([])
  const [importing, setImporting] = useState(false)
  const [resultat, setResultat] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFichierNom(file.name)
    setResultat(null)
    const reader = new FileReader()
    reader.onload = () => {
      const texte = String(reader.result)
      const rows = parseCsv(texte)
      if (rows.length === 0) { setLignes([]); return }
      const header = rows[0].map((h) => h.trim().toLowerCase())
      const idx = (col: string) => header.indexOf(col)

      const parsed: LigneImport[] = rows.slice(1).map((r) => {
        const get = (col: string) => (idx(col) >= 0 ? (r[idx(col)] ?? '').trim() : '')
        const l: LigneImport = {
          nom: get('nom'), centre: get('centre'), specialite: get('specialite').toUpperCase(),
          potentiel: get('potentiel').toUpperCase(), categorie: get('categorie'), secteur: get('secteur').toUpperCase(),
          jour_heure: get('jour_heure'), contacts: get('contacts'), observations: get('observations'),
          frequence: get('frequence'), email_vm: get('email_vm').toLowerCase(), erreurs: []
        }
        if (!l.nom) l.erreurs.push('Nom manquant')
        if (!SPECIALITES.includes(l.specialite)) l.erreurs.push(`Spécialité invalide (${l.specialite || 'vide'})`)
        if (!POTENTIELS.includes(l.potentiel)) l.erreurs.push(`Potentiel invalide (${l.potentiel || 'vide'})`)
        if (!SECTEURS.includes(l.secteur)) l.erreurs.push(`Secteur invalide (${l.secteur || 'vide'})`)
        if (l.frequence && Number.isNaN(Number(l.frequence))) l.erreurs.push('Fréquence non numérique')
        return l
      })
      setLignes(parsed)
    }
    reader.readAsText(file, 'utf-8')
  }

  async function lancerImport() {
    if (!profile || lignes.length === 0) return
    const valides = lignes.filter((l) => l.erreurs.length === 0)
    setImporting(true)
    setResultat(null)

    let vmParEmail: Record<string, string> = {}
    const { data: vms } = await supabase.from('profiles').select('id, email').eq('role', 'vm')
    vmParEmail = Object.fromEntries((vms ?? []).filter((v) => v.email).map((v) => [v.email!.toLowerCase(), v.id]))

    let inserts = 0
    let erreursExec: string[] = []

    for (const l of valides) {
      const { data: client, error } = await supabase.from('clients').insert({
        nom: l.nom, centre: l.centre || null, specialite: l.specialite as any, potentiel: l.potentiel as any,
        categorie: l.categorie || null, secteur: l.secteur as any, jour_heure_habituel: l.jour_heure || null,
        contacts: l.contacts || null, observations: l.observations || null,
        frequence_visite_mensuelle: l.frequence ? Number(l.frequence) : undefined
      }).select('id').single()

      if (error || !client) { erreursExec.push(`${l.nom} : ${error?.message ?? 'échec insertion'}`); continue }
      inserts++

      if (l.email_vm) {
        const vmId = vmParEmail[l.email_vm]
        if (!vmId) erreursExec.push(`${l.nom} : VM introuvable pour l'email ${l.email_vm} (client créé sans affectation)`)
        else {
          const { error: pfError } = await supabase.from('portefeuille').insert({ client_id: client.id, vm_id: vmId })
          if (pfError) erreursExec.push(`${l.nom} : affectation VM échouée (${pfError.message})`)
        }
      }
    }

    await supabase.from('imports_portefeuille').insert({
      uploaded_by: profile.id, fichier_nom: fichierNom, nb_lignes: lignes.length,
      nb_erreurs: lignes.length - inserts, statut: erreursExec.length > 0 ? 'TERMINE_AVEC_ERREURS' : 'TERMINE',
      details: { erreurs: erreursExec, lignes_ignorees: lignes.filter((l) => l.erreurs.length > 0).map((l) => ({ nom: l.nom, erreurs: l.erreurs })) }
    })

    setImporting(false)
    setResultat({
      type: erreursExec.length > 0 ? 'error' : 'success',
      text: `${inserts} client(s) importé(s) sur ${lignes.length} ligne(s).${erreursExec.length > 0 ? ` ${erreursExec.length} erreur(s) : ${erreursExec.slice(0, 3).join(' · ')}${erreursExec.length > 3 ? '…' : ''}` : ''}`
    })
    setLignes([])
    setFichierNom('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const valides = lignes.filter((l) => l.erreurs.length === 0).length
  const invalides = lignes.length - valides

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Import du portefeuille clients</h1>
        <p className="text-sm text-ink-400">Chargement initial ou mise à jour périodique depuis un fichier CSV</p>
      </div>

      <Card>
        <div className="flex items-start gap-2 mb-4">
          <IconDownload className="h-4 w-4 text-ink-400 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-ink-600">Format attendu (fichier CSV, en-tête en première ligne)</p>
            <p className="text-[11px] text-ink-400 mt-1 font-mono">{COLONNES.join(', ')}</p>
            <p className="text-[11px] text-ink-400 mt-1">
              specialite : {SPECIALITES.join(' / ')} · potentiel : GROS/MOYEN/FAIBLE · secteur : A/B ·
              email_vm (optionnel) affecte directement le client à ce visiteur médical.
              Depuis Excel : Fichier → Enregistrer sous → CSV.
            </p>
          </div>
        </div>

        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile}
          className="block w-full text-sm text-ink-600 file:mr-4 file:rounded-xl file:border-0 file:bg-royal-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-royal-700 hover:file:bg-royal-100" />
      </Card>

      {lignes.length > 0 && (
        <>
          <div className="flex items-center gap-3">
            <Badge tone="success">{valides} valide(s)</Badge>
            {invalides > 0 && <Badge tone="danger">{invalides} en erreur (ignorée(s))</Badge>}
            <Button size="sm" loading={importing} onClick={lancerImport} disabled={valides === 0}>
              Lancer l'import ({valides} client{valides > 1 ? 's' : ''})
            </Button>
          </div>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-ink-100 bg-ink-50/60 text-ink-500">
                    <th className="px-3 py-2 text-left font-semibold">Nom</th>
                    <th className="px-3 py-2 text-left font-semibold">Spécialité</th>
                    <th className="px-3 py-2 text-left font-semibold">Potentiel</th>
                    <th className="px-3 py-2 text-left font-semibold">Secteur</th>
                    <th className="px-3 py-2 text-left font-semibold">VM</th>
                    <th className="px-3 py-2 text-left font-semibold">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {lignes.map((l, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-semibold text-ink-800">{l.nom || '—'}</td>
                      <td className="px-3 py-2 text-ink-500">{l.specialite}</td>
                      <td className="px-3 py-2 text-ink-500">{l.potentiel}</td>
                      <td className="px-3 py-2 text-ink-500">{l.secteur}</td>
                      <td className="px-3 py-2 text-ink-500">{l.email_vm || '—'}</td>
                      <td className="px-3 py-2">
                        {l.erreurs.length === 0
                          ? <Badge tone="success">OK</Badge>
                          : <Badge tone="danger">{l.erreurs.join(' · ')}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {resultat && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${resultat.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-flame-50 text-flame-700'}`}>
          {resultat.text}
        </p>
      )}
    </div>
  )
}
