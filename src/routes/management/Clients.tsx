import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge, PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconUsers, IconSearch, IconLock, IconCheckCircle, IconCheck, IconX } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Client = Database['public']['Tables']['clients']['Row']
type Profile = Database['public']['Tables']['profiles']['Row']
type Specialite = Database['public']['Enums']['specialite_client']
type Potentiel = Database['public']['Enums']['potentiel_client']

const SPECIALITE_LABEL: Record<Specialite, string> = {
  GENERALISTE: 'Généraliste', GYNECOLOGUE: 'Gynécologue', PEDIATRE: 'Pédiatre', CARDIOLOGUE: 'Cardiologue',
  RHUMATOLOGUE: 'Rhumatologue', ORL: 'ORL', AUTRE_SPECIALITE: 'Autre spécialité',
  MATERNITE: 'Maternité', DISPENSAIRE: 'Dispensaire', PHARMACIE: 'Pharmacie'
}

const EMPTY_FORM = {
  nom: '', centre: '', specialite: 'GENERALISTE' as Specialite, potentiel: 'MOYEN' as Potentiel,
  categorie: '', secteur: 'A' as 'A' | 'B', jour_heure_habituel: '', contacts: '', observations: '',
  frequence_visite_mensuelle: '2', vm_id: ''
}

export default function ManagementClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [portefeuille, setPortefeuille] = useState<{ client_id: string; vm_id: string }[]>([])
  const [vms, setVms] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [search, setSearch] = useState('')
  const [secteurFilter, setSecteurFilter] = useState('')
  const [potentielFilter, setPotentielFilter] = useState('')

  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [bulkVmId, setBulkVmId] = useState('')
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMsg, setBulkMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    const [{ data: cl }, { data: pf }, { data: vm }] = await Promise.all([
      supabase.from('clients').select('*').order('nom'),
      supabase.from('portefeuille').select('client_id, vm_id'),
      supabase.from('profiles').select('*').eq('role', 'vm').order('full_name')
    ])
    setClients(cl ?? [])
    setPortefeuille(pf ?? [])
    setVms(vm ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const vmParClient = useMemo(() => Object.fromEntries(portefeuille.map((p) => [p.client_id, p.vm_id])), [portefeuille])
  const vmNomById = useMemo(() => Object.fromEntries(vms.map((v) => [v.id, v.full_name])), [vms])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return clients.filter((c) => {
      if (secteurFilter && c.secteur !== secteurFilter) return false
      if (potentielFilter && c.potentiel !== potentielFilter) return false
      if (q && !c.nom.toLowerCase().includes(q) && !(c.centre ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [clients, search, secteurFilter, potentielFilter])

  const selectedClients = clients.filter((c) => selection.has(c.id))
  const secteursSelection = new Set(selectedClients.map((c) => c.secteur))
  const secteurCommun = secteursSelection.size === 1 ? [...secteursSelection][0] : null
  const toutSelectionne = filtered.length > 0 && filtered.every((c) => selection.has(c.id))

  function toggleSelection(id: string) {
    setSelection((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectionTout() {
    setSelection((s) => {
      if (toutSelectionne) {
        const next = new Set(s)
        filtered.forEach((c) => next.delete(c.id))
        return next
      }
      const next = new Set(s)
      filtered.forEach((c) => next.add(c.id))
      return next
    })
  }

  function annulerSelection() {
    setSelection(new Set())
    setBulkVmId('')
    setBulkMsg(null)
  }

  async function affecterSelection() {
    if (!bulkVmId || selectedClients.length === 0) return
    setBulkSaving(true)
    setBulkMsg(null)
    const ids = selectedClients.map((c) => c.id)
    await supabase.from('portefeuille').delete().in('client_id', ids)
    const { error } = await supabase.from('portefeuille').insert(ids.map((client_id) => ({ client_id, vm_id: bulkVmId })))
    setBulkSaving(false)
    if (error) setBulkMsg({ type: 'error', text: error.message })
    else {
      setBulkMsg({ type: 'success', text: `${ids.length} client(s) affecté(s).` })
      setSelection(new Set())
      setBulkVmId('')
      load()
    }
  }

  function ouvrirAjout() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormMsg(null)
    setModalOpen(true)
  }

  function ouvrirEdition(c: Client) {
    setEditingId(c.id)
    setForm({
      nom: c.nom, centre: c.centre ?? '', specialite: c.specialite, potentiel: c.potentiel,
      categorie: c.categorie ?? '', secteur: c.secteur, jour_heure_habituel: c.jour_heure_habituel ?? '',
      contacts: c.contacts ?? '', observations: c.observations ?? '',
      frequence_visite_mensuelle: String(c.frequence_visite_mensuelle), vm_id: vmParClient[c.id] ?? ''
    })
    setFormMsg(null)
    setModalOpen(true)
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormMsg(null)
    const payload = {
      nom: form.nom, centre: form.centre || null, specialite: form.specialite, potentiel: form.potentiel,
      categorie: form.categorie || null, secteur: form.secteur, jour_heure_habituel: form.jour_heure_habituel || null,
      contacts: form.contacts || null, observations: form.observations || null,
      frequence_visite_mensuelle: Number(form.frequence_visite_mensuelle) || 2
    }

    let clientId = editingId
    if (editingId) {
      const { error } = await supabase.from('clients').update(payload).eq('id', editingId)
      if (error) { setFormMsg({ type: 'error', text: error.message }); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('clients').insert(payload).select('id').single()
      if (error || !data) { setFormMsg({ type: 'error', text: error?.message ?? 'Erreur' }); setSaving(false); return }
      clientId = data.id
    }

    const vmActuel = editingId ? vmParClient[editingId] : undefined
    if (clientId && form.vm_id && form.vm_id !== vmActuel) {
      await supabase.from('portefeuille').delete().eq('client_id', clientId)
      const { error: pfError } = await supabase.from('portefeuille').insert({ client_id: clientId, vm_id: form.vm_id })
      if (pfError) { setFormMsg({ type: 'error', text: `Client enregistré, mais affectation VM échouée : ${pfError.message}` }); setSaving(false); load(); return }
    } else if (clientId && !form.vm_id && vmActuel) {
      await supabase.from('portefeuille').delete().eq('client_id', clientId)
    }

    setSaving(false)
    setModalOpen(false)
    load()
  }

  async function toggleActif(c: Client) {
    await supabase.from('clients').update({ actif: !c.actif }).eq('id', c.id)
    load()
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const totalActifs = clients.filter((c) => c.actif).length
  const totalGros = clients.filter((c) => c.potentiel === 'GROS' && c.actif).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-800 font-display">Portefeuille clients</h1>
          <p className="text-sm text-ink-400">Ajout, modification et affectation des clients aux visiteurs médicaux</p>
        </div>
        <Button size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={ouvrirAjout}>Ajouter un client</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Clients au total" value={clients.length} tone="royal" icon={<IconUsers className="h-4 w-4" />} />
        <StatCard label="Clients actifs" value={totalActifs} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Gros potentiel actifs" value={totalGros} tone="flame" icon={<IconUsers className="h-4 w-4" />} />
      </div>

      <Card className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative flex-1">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un centre…"
            className="w-full rounded-xl border border-ink-200 pl-10 pr-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100"
          />
        </div>
        <select value={secteurFilter} onChange={(e) => setSecteurFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
          <option value="">Tous les secteurs</option>
          <option value="A">Secteur A</option>
          <option value="B">Secteur B</option>
        </select>
        <select value={potentielFilter} onChange={(e) => setPotentielFilter(e.target.value)}
          className="rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
          <option value="">Tous les potentiels</option>
          <option value="GROS">Gros</option>
          <option value="MOYEN">Moyen</option>
          <option value="FAIBLE">Faible</option>
        </select>
      </Card>

      {selection.size > 0 && (
        <Card className="flex flex-col sm:flex-row sm:items-center gap-3 border border-royal-200 bg-royal-50/50">
          <p className="text-xs font-semibold text-royal-700 flex-1">
            {selection.size} client{selection.size > 1 ? 's' : ''} sélectionné{selection.size > 1 ? 's' : ''}
            {secteurCommun && ` · secteur ${secteurCommun}`}
          </p>
          {secteurCommun ? (
            <>
              <select value={bulkVmId} onChange={(e) => setBulkVmId(e.target.value)}
                className="rounded-xl border border-ink-200 px-3.5 py-2 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="">Affecter à…</option>
                {vms.filter((v) => v.secteur === secteurCommun).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
              <Button size="sm" loading={bulkSaving} disabled={!bulkVmId} onClick={affecterSelection}>Affecter</Button>
            </>
          ) : (
            <p className="text-xs text-flame-600 font-semibold">Secteurs mélangés : affectation groupée impossible</p>
          )}
          <button onClick={annulerSelection} className="rounded-full p-2 text-ink-400 hover:bg-ink-100" title="Annuler la sélection">
            <IconX className="h-4 w-4" />
          </button>
        </Card>
      )}
      {bulkMsg && (
        <p className={`text-xs rounded-xl px-3.5 py-2.5 ${bulkMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {bulkMsg.text}
        </p>
      )}

      {filtered.length > 0 && (
        <button onClick={toggleSelectionTout} className="flex items-center gap-2 text-xs font-semibold text-ink-500 md:hidden">
          <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${toutSelectionne ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
            {toutSelectionne && <IconCheck className="h-3.5 w-3.5 text-white" />}
          </span>
          Tout sélectionner
        </button>
      )}

      {/* Liste mobile : toute la carte est cliquable pour sélectionner (case à cocher trop petite à viser dans un tableau qui défile) */}
      <div className="space-y-2.5 md:hidden">
        {filtered.map((c) => {
          const selected = selection.has(c.id)
          return (
            <Card
              key={c.id}
              onClick={() => toggleSelection(c.id)}
              className={`cursor-pointer transition ${selected ? 'border-2 border-royal-400 bg-royal-50/50' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                  {selected && <IconCheck className="h-3.5 w-3.5 text-white" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-800 truncate">{c.nom}</p>
                      {c.centre && <p className="text-[11px] text-ink-400 truncate">{c.centre}</p>}
                    </div>
                    <Badge tone={c.actif ? 'success' : 'neutral'}>{c.actif ? 'Actif' : 'Inactif'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <PotentielBadge potentiel={c.potentiel} compact />
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">Secteur {c.secteur}</span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">{SPECIALITE_LABEL[c.specialite]}</span>
                  </div>
                  <p className="mt-2 text-[11px] text-ink-500">
                    VM : {vmParClient[c.id] ? vmNomById[vmParClient[c.id]] ?? '—' : 'Sans affectation'}
                  </p>
                  <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => ouvrirEdition(c)} className="rounded-full px-3 py-1.5 text-[11px] font-semibold bg-royal-50 text-royal-700 hover:bg-royal-100 transition">
                      Modifier
                    </button>
                    <button onClick={() => toggleActif(c)}
                      title={c.actif ? 'Désactiver' : 'Réactiver'}
                      className={`rounded-full p-2 transition ${c.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {c.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )
        })}
        {filtered.length === 0 && (
          <Card className="text-center py-8 text-xs text-ink-400">Aucun client ne correspond à ces filtres.</Card>
        )}
      </div>

      {/* Tableau desktop */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleSelectionTout} className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border ${toutSelectionne ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                    {toutSelectionne && <IconCheck className="h-3 w-3 text-white" />}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-semibold">Client</th>
                <th className="px-4 py-3 text-left font-semibold">Spécialité</th>
                <th className="px-4 py-3 text-left font-semibold">Potentiel</th>
                <th className="px-4 py-3 text-left font-semibold">Secteur</th>
                <th className="px-4 py-3 text-left font-semibold">VM</th>
                <th className="px-4 py-3 text-left font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => toggleSelection(c.id)}
                  className={`cursor-pointer transition hover:bg-ink-50/60 ${selection.has(c.id) ? 'bg-royal-50/40' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className={`flex h-4.5 w-4.5 items-center justify-center rounded-md border ${selection.has(c.id) ? 'border-royal-600 bg-royal-600' : 'border-ink-300'}`}>
                      {selection.has(c.id) && <IconCheck className="h-3 w-3 text-white" />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-ink-800">{c.nom}</p>
                    {c.centre && <p className="text-[10px] text-ink-400">{c.centre}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-600">{SPECIALITE_LABEL[c.specialite]}</td>
                  <td className="px-4 py-3"><PotentielBadge potentiel={c.potentiel} compact /></td>
                  <td className="px-4 py-3 text-xs text-ink-600">Secteur {c.secteur}</td>
                  <td className="px-4 py-3 text-xs text-ink-500">{vmParClient[c.id] ? vmNomById[vmParClient[c.id]] ?? '—' : '—'}</td>
                  <td className="px-4 py-3"><Badge tone={c.actif ? 'success' : 'neutral'}>{c.actif ? 'Actif' : 'Inactif'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => ouvrirEdition(c)} className="rounded-full px-3 py-1.5 text-[11px] font-semibold bg-royal-50 text-royal-700 hover:bg-royal-100 transition">
                        Modifier
                      </button>
                      <button onClick={() => toggleActif(c)}
                        title={c.actif ? 'Désactiver' : 'Réactiver'}
                        className={`rounded-full p-2 transition ${c.actif ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                        {c.actif ? <IconLock className="h-3.5 w-3.5" /> : <IconCheckCircle className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-ink-400">Aucun client ne correspond à ces filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Modifier le client' : 'Ajouter un client'} maxWidth="max-w-2xl">
        <form onSubmit={enregistrer} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Nom & prénoms / raison sociale</label>
              <input required value={form.nom} onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Centre</label>
              <input value={form.centre} onChange={(e) => setForm((f) => ({ ...f, centre: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Catégorie</label>
              <input value={form.categorie} onChange={(e) => setForm((f) => ({ ...f, categorie: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Spécialité</label>
              <select value={form.specialite} onChange={(e) => setForm((f) => ({ ...f, specialite: e.target.value as Specialite }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                {(Object.keys(SPECIALITE_LABEL) as Specialite[]).map((s) => <option key={s} value={s}>{SPECIALITE_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Potentiel</label>
              <select value={form.potentiel} onChange={(e) => setForm((f) => ({ ...f, potentiel: e.target.value as Potentiel }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="GROS">Gros</option>
                <option value="MOYEN">Moyen</option>
                <option value="FAIBLE">Faible</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Secteur</label>
              <select value={form.secteur} onChange={(e) => {
                const secteur = e.target.value as 'A' | 'B'
                setForm((f) => {
                  const vmActuel = vms.find((v) => v.id === f.vm_id)
                  const vmToujoursValide = vmActuel && vmActuel.secteur === secteur
                  return { ...f, secteur, vm_id: vmToujoursValide ? f.vm_id : '' }
                })
              }}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="A">Secteur A</option>
                <option value="B">Secteur B</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Fréquence de visite (par mois)</label>
              <input type="number" min={1} value={form.frequence_visite_mensuelle}
                onChange={(e) => setForm((f) => ({ ...f, frequence_visite_mensuelle: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Jour / heure habituel</label>
              <input value={form.jour_heure_habituel} onChange={(e) => setForm((f) => ({ ...f, jour_heure_habituel: e.target.value }))}
                placeholder="Ex : Lundi 10h"
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Contacts</label>
              <input value={form.contacts} onChange={(e) => setForm((f) => ({ ...f, contacts: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Observations</label>
              <textarea value={form.observations} onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} rows={2}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-semibold text-ink-500">Visiteur médical affecté</label>
              <select value={form.vm_id} onChange={(e) => setForm((f) => ({ ...f, vm_id: e.target.value }))}
                className="w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-royal-400 focus:ring-4 focus:ring-royal-100">
                <option value="">Sans affectation</option>
                {vms.filter((v) => v.secteur === form.secteur).map((v) => <option key={v.id} value={v.id}>{v.full_name}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-ink-400">Seuls les VM du secteur sélectionné sont proposés (verrouillage sectoriel).</p>
            </div>
          </div>

          {formMsg && (
            <p className={`text-xs rounded-xl px-3 py-2.5 ${formMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {formMsg.text}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <Button type="submit" loading={saving}>{editingId ? 'Enregistrer' : 'Ajouter le client'}</Button>
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
