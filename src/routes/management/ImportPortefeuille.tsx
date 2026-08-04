import { useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { IconDownload, IconChevronLeft } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

const SPECIALITES = ['GENERALISTE', 'GYNECOLOGUE', 'PEDIATRE', 'CARDIOLOGUE', 'RHUMATOLOGUE', 'ORL', 'AUTRE_SPECIALITE', 'MATERNITE', 'DISPENSAIRE', 'PHARMACIE']
const POTENTIELS = ['GROS', 'MOYEN', 'FAIBLE']
const SECTEURS = ['A', 'B']

const CHAMPS = [
  { key: 'nom', label: 'Nom du client', requis: true },
  { key: 'centre', label: 'Centre', requis: false },
  { key: 'specialite', label: 'Spécialité', requis: true },
  { key: 'potentiel', label: 'Potentiel (GROS/MOYEN/FAIBLE)', requis: true },
  { key: 'categorie', label: 'Catégorie', requis: false },
  { key: 'secteur', label: 'Secteur (A/B)', requis: true },
  { key: 'jour_heure', label: 'Jour / heure habituel', requis: false },
  { key: 'contacts', label: 'Contacts', requis: false },
  { key: 'observations', label: 'Observations', requis: false },
  { key: 'frequence', label: 'Fréquence de visite mensuelle', requis: false },
  { key: 'email_vm', label: 'Email du VM assigné', requis: false }
] as const

type ChampKey = typeof CHAMPS[number]['key']
type Mapping = Record<ChampKey, number>

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

function autoDetecter(header: string[]): Mapping {
  const norm = header.map((h) => h.trim().toLowerCase())
  const mapping = {} as Mapping
  for (const c of CHAMPS) mapping[c.key] = norm.indexOf(c.key)
  return mapping
}

export default function ManagementImportPortefeuille() {
  const { profile } = useAuth()
  const fileRef = useRef<HTMLInputElement>(null)
  const [etape, setEtape] = useState<'upload' | 'mappage' | 'apercu'>('upload')
  const [fichierNom, setFichierNom] = useState('')
  const [header, setHeader] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
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
      if (rows.length === 0) return
      setHeader(rows[0].map((h) => h.trim()))
      setRawRows(rows.slice(1))
      setMapping(autoDetecter(rows[0]))
      setEtape('mappage')
    }
    reader.readAsText(file, 'utf-8')
  }

  function construireLignes(m: Mapping): LigneImport[] {
    const get = (row: string[], key: ChampKey) => (m[key] >= 0 ? (row[m[key]] ?? '').trim() : '')
    return rawRows.map((row) => {
      const l: LigneImport = {
        nom: get(row, 'nom'), centre: get(row, 'centre'), specialite: get(row, 'specialite').toUpperCase(),
        potentiel: get(row, 'potentiel').toUpperCase(), categorie: get(row, 'categorie'), secteur: get(row, 'secteur').toUpperCase(),
        jour_heure: get(row, 'jour_heure'), contacts: get(row, 'contacts'), observations: get(row, 'observations'),
        frequence: get(row, 'frequence'), email_vm: get(row, 'email_vm').toLowerCase(), erreurs: []
      }
      if (!l.nom) l.erreurs.push('Nom manquant')
      if (!SPECIALITES.includes(l.specialite)) l.erreurs.push(`Spécialité invalide (${l.specialite || 'vide'})`)
      if (!POTENTIELS.includes(l.potentiel)) l.erreurs.push(`Potentiel invalide (${l.potentiel || 'vide'})`)
      if (!SECTEURS.includes(l.secteur)) l.erreurs.push(`Secteur invalide (${l.secteur || 'vide'})`)
      if (l.frequence && Number.isNaN(Number(l.frequence))) l.erreurs.push('Fréquence non numérique')
      return l
    })
  }

  function validerMappage() {
    if (!mapping) return
    setLignes(construireLignes(mapping))
    setEtape('apercu')
  }

  function recommencer() {
    setEtape('upload')
    setHeader([])
    setRawRows([])
    setMapping(null)
    setLignes([])
    setFichierNom('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function lancerImport() {
    if (!profile || lignes.length === 0) return
    const valides = lignes.filter((l) => l.erreurs.length === 0)
    setImporting(true)
    setResultat(null)

    const { data: vms } = await supabase.from('profiles').select('id, email').eq('role', 'vm')
    const vmParEmail = Object.fromEntries((vms ?? []).filter((v) => v.email).map((v) => [v.email!.toLowerCase(), v.id]))

    let inserts = 0
    const erreursExec: string[] = []

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
    recommencer()
  }

  const valides = lignes.filter((l) => l.erreurs.length === 0).length
  const invalides = lignes.length - valides
  const champsRequisNonMappes = mapping ? CHAMPS.filter((c) => c.requis && mapping[c.key] < 0) : []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Import du portefeuille clients</h1>
        <p className="text-sm text-ink-400">Chargement initial ou mise à jour périodique depuis un fichier CSV</p>
      </div>

      {etape === 'upload' && (
        <Card>
          <div className="flex items-start gap-2 mb-4">
            <IconDownload className="h-4 w-4 text-ink-400 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-ink-600">Fichier CSV avec en-tête en première ligne</p>
              <p className="text-[11px] text-ink-400 mt-1">
                Les colonnes n'ont pas besoin de porter un nom précis ni d'être dans un ordre particulier :
                l'étape suivante permet de vérifier et corriger le mappage de chaque colonne avant l'import.
              </p>
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
      )}

      {etape === 'mappage' && mapping && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={recommencer} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600">
              <IconChevronLeft className="h-3.5 w-3.5" /> Choisir un autre fichier
            </button>
          </div>

          <Card>
            <p className="text-sm font-bold text-ink-800 mb-1">Mappage des colonnes</p>
            <p className="text-xs text-ink-400 mb-4">
              {fichierNom} · {rawRows.length} ligne(s) détectée(s). Pour chaque champ attendu, choisissez la colonne du
              fichier qui lui correspond (détection automatique pré-remplie, à corriger si besoin).
            </p>

            <div className="space-y-2.5">
              {CHAMPS.map((c) => (
                <div key={c.key} className="flex items-center gap-3">
                  <span className="w-52 flex-shrink-0 text-xs font-semibold text-ink-600">
                    {c.label}{c.requis && <span className="text-flame-500"> *</span>}
                  </span>
                  <select
                    value={mapping[c.key]}
                    onChange={(e) => setMapping((m) => (m ? { ...m, [c.key]: Number(e.target.value) } : m))}
                    className="flex-1 rounded-xl border border-ink-200 px-3 py-2 text-xs outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
                  >
                    <option value={-1}>— Ne pas importer —</option>
                    {header.map((h, i) => (
                      <option key={i} value={i}>{h || `Colonne ${i + 1}`}</option>
                    ))}
                  </select>
                  <span className="w-40 flex-shrink-0 truncate text-[11px] text-ink-400">
                    {mapping[c.key] >= 0 ? `ex : ${rawRows[0]?.[mapping[c.key]] || '—'}` : ''}
                  </span>
                </div>
              ))}
            </div>

            {champsRequisNonMappes.length > 0 && (
              <p className="mt-4 text-xs font-semibold text-flame-600">
                Champs obligatoires non mappés : {champsRequisNonMappes.map((c) => c.label).join(', ')}
              </p>
            )}

            <div className="mt-5">
              <Button onClick={validerMappage} disabled={champsRequisNonMappes.length > 0}>
                Valider le mappage et prévisualiser
              </Button>
            </div>
          </Card>
        </>
      )}

      {etape === 'apercu' && (
        <>
          <div className="flex items-center gap-4">
            <button onClick={() => setEtape('mappage')} className="flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-royal-600">
              <IconChevronLeft className="h-3.5 w-3.5" /> Modifier le mappage
            </button>
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
