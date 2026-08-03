import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { StatCard } from '@/components/ui/StatCard'
import { IconPlus, IconPill, IconSearch, IconLock, IconCheckCircle } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Produit = Database['public']['Tables']['produits']['Row']

export default function ManagementProduits() {
  const [produits, setProduits] = useState<Produit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Produit | null>(null)
  const [nom, setNom] = useState('')
  const [saving, setSaving] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const charger = async () => {
    setLoading(true)
    const { data } = await supabase.from('produits').select('*').order('nom')
    setProduits(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    charger()
  }, [])

  const filtres = produits.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase()))
  const actifs = produits.filter((p) => p.actif).length

  const ouvrirAjout = () => {
    setEditing(null)
    setNom('')
    setErreur(null)
    setModalOpen(true)
  }

  const ouvrirModif = (p: Produit) => {
    setEditing(p)
    setNom(p.nom)
    setErreur(null)
    setModalOpen(true)
  }

  const enregistrer = async () => {
    const valeur = nom.trim()
    if (!valeur) {
      setErreur('Le nom du produit est requis.')
      return
    }
    setSaving(true)
    setErreur(null)
    const query = editing
      ? supabase.from('produits').update({ nom: valeur }).eq('id', editing.id)
      : supabase.from('produits').insert({ nom: valeur })
    const { error } = await query
    setSaving(false)
    if (error) {
      setErreur(error.message.includes('duplicate') || error.message.includes('unique')
        ? 'Un produit avec ce nom existe déjà.'
        : "Une erreur est survenue lors de l'enregistrement.")
      return
    }
    setModalOpen(false)
    charger()
  }

  const toggleActif = async (p: Produit) => {
    await supabase.from('produits').update({ actif: !p.actif }).eq('id', p.id)
    charger()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-ink-800 font-display">Catalogue produits</h1>
          <p className="text-sm text-ink-400 mt-0.5">Produits présentables lors des visites médicales</p>
        </div>
        <Button onClick={ouvrirAjout}>
          <IconPlus className="h-4 w-4" /> Ajouter un produit
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Produits au catalogue" value={produits.length} tone="royal" icon={<IconPill className="h-4 w-4" />} />
        <StatCard label="Actifs" value={actifs} tone="emerald" icon={<IconCheckCircle className="h-4 w-4" />} />
        <StatCard label="Désactivés" value={produits.length - actifs} tone="flame" icon={<IconLock className="h-4 w-4" />} />
      </div>

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
                <th className="px-5 py-3">Statut</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.map((p) => (
                <tr key={p.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
                  <td className="px-5 py-3 font-semibold text-ink-700">{p.nom}</td>
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
          {erreur && <p className="text-xs font-semibold text-red-500">{erreur}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button onClick={enregistrer} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
