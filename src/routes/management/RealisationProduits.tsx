import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { Card } from '@/components/ui/Card'
import { StatCard } from '@/components/ui/StatCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { isoWeekMonday, nowBenin } from '@/lib/time'

type Produit = { id: string; nom: string; equipe_id: string | null }
type LigneRealisation = { produit_id: string; quantite: number; semaine_debut: string }
type Objectif = { produit_id: string; objectif_quantite: number }

function semainesDuMois(mois: string) {
  const debut = dayjs(mois).startOf('month')
  const fin = debut.endOf('month')
  const semaines = new Set<string>()
  for (let d = debut; d.isBefore(fin) || d.isSame(fin, 'day'); d = d.add(1, 'day')) {
    if (d.day() === 1) semaines.add(d.format('YYYY-MM-DD'))
  }
  return Math.max(1, semaines.size)
}

export default function ManagementRealisationProduits() {
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [produits, setProduits] = useState<Produit[]>([])
  const [ventes, setVentes] = useState<LigneRealisation[]>([])
  const [objectifs, setObjectifs] = useState<Objectif[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const semaine = isoWeekMonday().format('YYYY-MM-DD')
  const mois = nowBenin().startOf('month').format('YYYY-MM-DD')
  const nbSemaines = useMemo(() => semainesDuMois(mois), [mois])

  useEffect(() => {
    let vivant = true
    async function charger() {
      setLoading(true)
      setErreur(null)
      let equipeIds: string[] | null = null
      if (profile?.role === 'superviseur') {
        const { data, error } = await supabase.from('superviseur_equipes').select('equipe_id').eq('superviseur_id', profile.id)
        if (error) { if (vivant) { setErreur(error.message); setLoading(false) }; return }
        equipeIds = (data ?? []).map((x) => x.equipe_id)
      }

      const { data: catalogue, error: catalogueError } = await supabase
        .from('produits').select('id, nom, equipe_id').eq('actif', true).order('nom')
      if (catalogueError) { if (vivant) { setErreur(catalogueError.message); setLoading(false) }; return }
      const autorises = ((catalogue ?? []) as Produit[]).filter((p) => !equipeIds || (p.equipe_id && equipeIds.includes(p.equipe_id)))
      const ids = autorises.map((p) => p.id)
      if (ids.length === 0) {
        if (vivant) { setProduits([]); setVentes([]); setObjectifs([]); setLoading(false) }
        return
      }

      const [{ data: ventesData, error: ventesError }, { data: objectifsData, error: objectifsError }] = await Promise.all([
        supabase.from('ventes_hebdomadaires').select('produit_id, quantite, semaine_debut').eq('semaine_debut', semaine).in('produit_id', ids),
        supabase.from('objectifs_mensuels_produits').select('produit_id, objectif_quantite').eq('mois', mois).in('produit_id', ids)
      ])
      if (ventesError || objectifsError) {
        if (vivant) { setErreur(ventesError?.message ?? objectifsError?.message ?? 'Impossible de charger les réalisations.'); setLoading(false) }
        return
      }
      if (vivant) {
        setProduits(autorises)
        setVentes((ventesData ?? []) as LigneRealisation[])
        setObjectifs((objectifsData ?? []) as Objectif[])
        setLoading(false)
      }
    }
    charger()
    const channel = supabase.channel('dashboard-realisation-produits')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes_hebdomadaires' }, () => { void charger() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objectifs_mensuels_produits' }, () => { void charger() })
      .subscribe()
    return () => {
      vivant = false
      void supabase.removeChannel(channel)
    }
  }, [profile?.id, profile?.role, semaine, mois])

  const lignes = useMemo(() => produits.map((p) => {
    const realise = ventes.filter((v) => v.produit_id === p.id).reduce((s, v) => s + Number(v.quantite || 0), 0)
    const objectifMensuel = objectifs.filter((o) => o.produit_id === p.id).reduce((s, o) => s + Number(o.objectif_quantite || 0), 0)
    const objectifHebdo = objectifMensuel / nbSemaines
    return { ...p, realise, objectifHebdo, taux: objectifHebdo > 0 ? realise / objectifHebdo * 100 : null }
  }).sort((a, b) => b.realise - a.realise || a.nom.localeCompare(b.nom, 'fr')), [produits, ventes, objectifs, nbSemaines])

  const realiseTotal = lignes.reduce((s, l) => s + l.realise, 0)
  const objectifTotal = lignes.reduce((s, l) => s + l.objectifHebdo, 0)
  const tauxGeneral = objectifTotal > 0 ? realiseTotal / objectifTotal * 100 : null

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-ink-800 font-display">Réalisation des produits</h2>
          <p className="text-xs text-ink-400">Semaine du {dayjs(semaine).format('DD/MM/YYYY')} · Données conservées toute la semaine</p>
        </div>
        <p className="text-[11px] text-ink-400">Mis à jour à partir des chiffres enregistrés</p>
      </div>
      {erreur && <Card className="border border-red-200 bg-red-50 text-sm text-red-700">{erreur}</Card>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Réalisation actuelle" value={realiseTotal} tone="royal" />
        <StatCard label="Objectif hebdomadaire" value={objectifTotal} decimals={1} tone="ink" />
        <StatCard label="Taux général" value={tauxGeneral ?? 0} decimals={1} suffix="%" tone={tauxGeneral !== null && tauxGeneral >= 100 ? "emerald" : "flame"} sub={tauxGeneral === null ? "Aucun objectif hebdomadaire défini" : undefined} />
      </div>
      {lignes.length === 0 ? <Card className="text-sm text-ink-400">Aucun produit actif pour votre périmètre.</Card> : (
        <div className="space-y-2">
          {lignes.map((l) => (
            <Card key={l.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold text-ink-800">{l.nom}</p>
                <p className="shrink-0 text-sm font-bold text-ink-800">{l.realise.toLocaleString('fr-FR')}</p>
              </div>
              <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-500">
                <span>Objectif hebdo. : {l.objectifHebdo.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span>
                <span className="font-semibold">{l.taux === null ? 'Objectif non défini' : `${l.taux.toFixed(1)}% réalisé`}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div className={`h-full rounded-full ${l.taux !== null && l.taux >= 100 ? 'bg-emerald-500' : 'bg-royal-500'}`} style={{ width: `${Math.min(100, Math.max(0, l.taux ?? 0))}%` }} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
