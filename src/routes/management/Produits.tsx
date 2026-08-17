import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconPill, IconSearch, IconLock, IconCheckCircle, IconDownload } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { parseCsv } from '@/lib/csv'
import type { Database } from '@/types/database'

type Produit = Database['public']['Tables']['produits']['Row']
type Equipe = Database['public']['Tables']['equipes']['Row']

export default function ManagementProduits() {
  const [produits, setProduits] = useState<Produit[]>([])
  const [equipes, setEquipes] = useState<Equipe[]>([])
  const [equipeFiltre, setEquipeFiltre] = useState<string>('TOUS')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Produit | null>(null)
  const [nom, setNom] = useState('')
  const [equipeChoisie, setEquipeChoisie] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [listMsg, setListMsg] = useState<string | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importEquipe, setImportEquipe] = useState('')
  const [importNoms, setImportNoms] = useState<string[]>([])
  const [importFichierNom, setImportFichierNom] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResultat, setImportResultat] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const charger = async () => {
    setLoading(true)
    const [{ data: p }, { data: e }] = await Promise.all([
      supabase.from('produits').select('*').order('nom'),
      supabase.from('equipes').select('*').order('nom')
    ])
    setProduits(p ?? [])
    setEquipes(e ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  const produitsEquipe = equipeFiltre === 'TOUS' ? produits : produits.filter((p) => p.equipe_id === equipeFiltre)
  const filtres = produitsEquipe.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase()))
  const actifs = produitsEquipe.filter((p) => p.actif).length

  const ouvrirAjout = () => {
    setEditing(null)
    setNom('')
    setEquipeChoisie(equipeFiltre !== 'TOUS' ? equipeFiltre : equipes[0]?.id ?? '')
    setErreur(null)
    setModalOpen(true)
  }

  const ouvrirModif = (p: Produit) => {
    setEditing(p)
    setNom(p.nom)
    setEquipeChoisie(p.equipe_id)
    setErreur(null)
    setModalOpen(true)
  }

  const enregistrer = async () => {
    const valeur = nom.trim()
    if (!valeur) { setErreur('Le nom du produit est requis.'); return }
    if (!equipeChoisie) { setErreur('L\'équipe est requise.'); return }
    setSaving(true)
    setErreur(null)
    const query = editing
      ? supabase.from('produits').update({ nom: valeur, equipe_id: equipeChoisie }).eq('id', editing.id)
      : supabase.from('produits').insert({ nom: valeur, equipe_id: equipeChoisie })
    const { error } = await query
    setSaving(false)
    if (error) {
      setErreur(error.message.includes('duplicate') || error.message.includes('unique')
        ? 'Ce produit existe déjà pour cette équipe.'
        : "Une erreur est survenue lors de l'enregistrement.")
      return
    }
    setModalOpen(false)
    charger()
  }

  const toggleActif = async (p: Produit) => {
    setListMsg(null)
    const { error } = await supabase.from('produits').update({ actif: !p.actif }).eq('id', p.id)
    if (error) setListMsg(error.message)
    charger()
  }

  const ouvrirImport = () => {
    setImportEquipe(equipeFiltre !== 'TOUS' ? equipeFiltre : equipes[0]?.id ?? '')
    setImportNoms([])
    setImportFichierNom('')
    setImportResultat(null)
    setImportOpen(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleFichierImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFichierNom(file.name)
    setImportResultat(null)
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCsv(String(reader.result))
      // Une seule colonne attendue (nom du produit) ; si un en-tête "nom" est présent, on l'ignore.
      const noms = rows
        .map((r) => (r[0] ?? '').trim())
        .filter((v) => v && v.toLowerCase() !== 'nom')
      setImportNoms(Array.from(new Set(noms)))
    }
    reader.readAsText(file, 'utf-8')
  }

  async function lancerImport() {
    if (!importEquipe || importNoms.length === 0) return
    setImporting(true)
    setImportResultat(null)
    const { data: existants } = await supabase.from('produits').select('nom').eq('equipe_id', importEquipe)
    const existantsSet = new Set((existants ?? []).map((p) => p.nom.toLowerCase()))
    const aInserer = importNoms.filter((n) => !existantsSet.has(n.toLowerCase()))

    let inserts = 0
    const erreurs: string[] = []
    for (const n of aInserer) {
      const { error } = await supabase.from('produits').insert({ nom: n, equipe_id: importEquipe })
      if (error) erreurs.push(`${n} : ${error.message}`)
      else inserts++
    }

    setImporting(false)
    const ignores = importNoms.length - aInserer.length
    setImportResultat(
      `${inserts} produit(s) importé(s) sur ${importNoms.length}.` +
      (ignores > 0 ? ` ${ignores} déjà existant(s) ignoré(s).` : '') +
      (erreurs.length > 0 ? ` ${erreurs.length} erreur(s).` : '')
    )
    setImportNoms([])
    setImportFichierNom('')
    if (fileRef.current) fileRef.current.value = ''
    if (inserts > 0) charger()
  }

  const nomEquipe = (id: string | null) => equipes.find((e) => e.id === id)?.nom ?? '—'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink-800 font-display">Catalogue produits</h1>
          <p className="text-sm text-ink-400 mt-0.5">Produits présentables lors des visites médicales, par équipe</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={ouvrirImport}>
            <IconDownload className="h-4 w-4" /> Importer CSV
          </Button>
          <Button onClick={ouvrirAjout}>
            <IconPlus className="h-4 w-4" /> Ajouter un produit
          </Button>
        </div>
      </div>

      {equipes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setEquipeFiltre('TOUS')}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${equipeFiltre === 'TOUS' ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
          >
            Tous
          </button>
          {equipes.map((e) => (
            <button
              key={e.id}
              onClick={() => setEquipeFiltre(e.id)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${equipeFiltre === e.id ? 'bg-royal-600 text-white' : 'bg-ink-100 text-ink-500 hover:bg-ink-200'}`}
            >
              {e.nom}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label={`Produits · ${equipeFiltre === 'TOUS' ? 'Toutes équipes' : nomEquipe(equipeFiltre)}`} value={produitsEquipe.length} tone="royal" icon={<IconPill className="h-4 w-4" />} />
        <StatCard label="Actifs" value={actifs} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Désactivés" value={produitsEquipe.length - actifs} tone="flame" icon={<IconLock className="h-4 w-4" />} />
      </div>

      {listMsg && <p className="text-xs font-semibold text-red-500">{listMsg}</p>}

      <Card className="p-4">
        <div className="relative">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit..."
            className="w-full rounded-xl2 border border-ink-100 bg-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
          />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : filtres.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">Aucun produit trouvé.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 text-left text-xs font-semibold text-ink-400 uppercase tracking-wide">
                <th className="px-5 py-3">Produit</th>
                {equipeFiltre === 'TOUS' && <th className="px-5 py-3">Équipe</th>}
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <td className="px-5 py-3 font-semibold text-ink-700">{p.nom}</td>
                  {equipeFiltre === 'TOUS' && <td className="px-5 py-3 text-ink-500">{nomEquipe(p.equipe_id)}</td>}
                  <td className="px-5 py-3">
                    <Badge tone={p.actif ? 'success' : 'neutral'}>{p.actif ? 'Actif' : 'Désactivé'}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => ouvrirModif(p)}
                        className="rounded-full px-3 py-1.5 text-[11px] font-semibold bg-royal-50 text-royal-700 hover:bg-royal-100 transition"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => toggleActif(p)}
                        title={p.actif ? 'Désactiver' : 'Réactiver'}
                        className={`rounded-full p-2 transition ${p.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                      >
                        {p.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le produit' : 'Ajouter un produit'}>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-500">Nom du produit</label>
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex : Doliprane 500mg"
              className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-ink-500">Équipe</label>
            <select
              value={equipeChoisie}
              onChange={(e) => setEquipeChoisie(e.target.value)}
              className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
            >
              <option value="">— Choisir —</option>
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          {erreur && <p className="text-xs font-semibold text-red-500">{erreur}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={enregistrer} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importer des produits (CSV)" description="Un produit par ligne, avec ou sans en-tête « nom »">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-ink-500">Équipe de destination</label>
            <select
              value={importEquipe}
              onChange={(e) => setImportEquipe(e.target.value)}
              className="mt-1 w-full rounded-xl2 border border-ink-100 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-royal-300"
            >
              {equipes.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink-500">Fichier CSV</label>
            <input
              ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFichierImport}
              className="mt-1 block w-full text-sm text-ink-600 file:mr-4 file:rounded-xl file:border-0 file:bg-royal-50 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-royal-700 hover:file:bg-royal-100"
            />
          </div>

          {importNoms.length > 0 && (
            <div className="rounded-xl2 border border-ink-100 bg-ink-50/60 p-3">
              <p className="text-xs font-semibold text-ink-600 mb-1.5">
                {importFichierNom} · {importNoms.length} produit(s) détecté(s)
              </p>
              <div className="max-h-32 overflow-y-auto text-xs text-ink-500 space-y-0.5">
                {importNoms.slice(0, 20).map((n, i) => <p key={i}>{n}</p>)}
                {importNoms.length > 20 && <p className="italic text-ink-400">… et {importNoms.length - 20} de plus</p>}
              </div>
            </div>
          )}

          {importResultat && (
            <p className="text-xs rounded-xl px-3.5 py-2.5 bg-emerald-50 text-emerald-700">{importResultat}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Fermer</Button>
            <Button onClick={lancerImport} loading={importing} disabled={!importEquipe || importNoms.length === 0}>
              Importer {importNoms.length > 0 ? `(${importNoms.length})` : ''}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
