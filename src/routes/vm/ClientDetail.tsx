import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { PotentielBadge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconChevronLeft, IconClock, IconMapPin, IconAlert } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Client = Database['public']['Tables']['clients']['Row']
type Visite = Database['public']['Tables']['visites']['Row']
type ClientFreq = Database['public']['Views']['v_client_frequence']['Row']
type Justification = Database['public']['Tables']['justifications_frequence']['Row']

export default function ClientDetail() {
  const { clientId } = useParams()
  const { session } = useAuth()
  const [client, setClient] = useState<Client | null>(null)
  const [freq, setFreq] = useState<ClientFreq | null>(null)
  const [visites, setVisites] = useState<Visite[]>([])
  const [loading, setLoading] = useState(true)
  const [justification, setJustification] = useState<Justification | null>(null)
  const [justificationTexte, setJustificationTexte] = useState('')
  const [savingJustification, setSavingJustification] = useState(false)
  const moisCourant = dayjs().format('YYYY-MM-01')

  useEffect(() => {
    if (!clientId || !session) return
    Promise.all([
      supabase.from('clients').select('*').eq('id', clientId).single(),
      supabase.from('v_client_frequence').select('*').eq('client_id', clientId).maybeSingle(),
      supabase.from('visites').select('*').eq('client_id', clientId).order('jour', { ascending: false }).limit(20),
      supabase.from('justifications_frequence').select('*')
        .eq('client_id', clientId).eq('vm_id', session.user.id).eq('mois', moisCourant).maybeSingle()
    ]).then(([c, f, v, j]) => {
      setClient(c.data)
      setFreq(f.data)
      setVisites(v.data ?? [])
      setJustification(j.data)
      setJustificationTexte(j.data?.justification ?? '')
      setLoading(false)
    })
  }, [clientId, session, moisCourant])

  async function enregistrerJustification() {
    if (!clientId || !session || !justificationTexte.trim()) return
    setSavingJustification(true)
    const { data, error } = await supabase.from('justifications_frequence')
      .upsert(
        { client_id: clientId, vm_id: session.user.id, mois: moisCourant, justification: justificationTexte.trim() },
        { onConflict: 'client_id,vm_id,mois' }
      )
      .select('*')
      .single()
    setSavingJustification(false)
    if (!error) setJustification(data)
  }

  if (loading) return <div className="space-y-3 mt-2"><Skeleton className="h-32" /><Skeleton className="h-48" /></div>
  if (!client) return <p className="mt-6 text-center text-sm text-ink-400">Client introuvable.</p>

  return (
    <div className="space-y-4 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <Link to="/app/portefeuille" className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold text-ink-800 font-display truncate">{client.nom}</h1>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <PotentielBadge potentiel={client.potentiel} />
          <span className="text-xs font-semibold text-ink-500">Secteur {client.secteur}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-[11px] text-ink-400">Spécialité</p><p className="font-semibold text-ink-700">{client.specialite}</p></div>
          <div><p className="text-[11px] text-ink-400">Centre</p><p className="font-semibold text-ink-700">{client.centre || '—'}</p></div>
          <div><p className="text-[11px] text-ink-400">Contacts</p><p className="font-semibold text-ink-700">{client.contacts || '—'}</p></div>
          <div><p className="text-[11px] text-ink-400">Jour habituel</p><p className="font-semibold text-ink-700">{client.jour_heure_habituel || '—'}</p></div>
        </div>
        {client.observations && (
          <p className="mt-3 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">{client.observations}</p>
        )}
      </Card>

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Respect de la fréquence de visite</p>
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">Ce mois</span>
          <span className={`font-bold ${freq?.frequence_respectee ? 'text-emerald-600' : 'text-flame-600'}`}>
            {freq?.visites_mois_courant ?? 0} / {freq?.frequence_visite_mensuelle ?? '—'} visite(s)
          </span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-ink-100 overflow-hidden">
          <div
            className={`h-full rounded-full ${freq?.frequence_respectee ? 'bg-emerald-500' : 'bg-flame-500'}`}
            style={{ width: `${Math.min(100, ((freq?.visites_mois_courant ?? 0) / (freq?.frequence_visite_mensuelle || 1)) * 100)}%` }}
          />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-ink-400">
          <span>Dernière visite : {freq?.derniere_visite ? dayjs(freq.derniere_visite).format('DD/MM/YYYY') : 'jamais'}</span>
          {freq?.prochaine_visite_due && <span>Prochaine due : {dayjs(freq.prochaine_visite_due).format('DD/MM')}</span>}
        </div>
      </Card>

      {freq && !freq.frequence_respectee && (
        <Card className="border border-flame-200 bg-flame-50/50">
          <div className="flex items-center gap-2 mb-2">
            <IconAlert className="h-4 w-4 text-flame-600 flex-shrink-0" />
            <p className="text-sm font-bold text-flame-700">Fréquence non respectée ce mois — justification requise</p>
          </div>
          <textarea
            value={justificationTexte}
            onChange={(e) => setJustificationTexte(e.target.value)}
            rows={3}
            placeholder="Expliquez pourquoi ce client n'a pas été visité selon la fréquence attendue…"
            className="w-full rounded-xl border border-flame-200 bg-white px-3 py-2 text-sm outline-none focus:border-flame-400 focus:ring-4 focus:ring-flame-100"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            {justification && (
              <p className="text-[10px] text-ink-400">
                Enregistrée le {dayjs(justification.updated_at).format('DD/MM/YYYY à HH:mm')}
              </p>
            )}
            <Button size="sm" loading={savingJustification} disabled={!justificationTexte.trim()} onClick={enregistrerJustification} className="ml-auto">
              {justification ? 'Mettre à jour' : 'Enregistrer la justification'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Historique des visites</p>
        {visites.length === 0 && <p className="text-xs text-ink-400">Aucune visite enregistrée pour ce client.</p>}
        <div className="space-y-2.5">
          {visites.map((v) => (
            <div key={v.id} className="flex items-center gap-3 rounded-xl bg-ink-50 p-3">
              <div className="rounded-lg bg-white p-1.5 text-ink-400 shadow-softer"><IconClock className="h-3.5 w-3.5" /></div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-ink-700">{dayjs(v.jour).format('dddd D MMMM YYYY')}</p>
                <p className="text-[11px] text-ink-400">
                  {v.type_visite === 'MEDICAL' ? 'Visite médicale' : 'Visite pharmacie'}
                  {v.hors_programme && ' · Hors programme'}
                </p>
              </div>
              {v.latitude && (
                <IconMapPin className="h-3.5 w-3.5 text-ink-300" />
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
