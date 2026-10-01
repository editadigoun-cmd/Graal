import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { IconCheckCircle, IconMapPin, IconSearch, IconUsers } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import { todayBenin } from '@/lib/time'

type Client = {
  id: string
  nom: string
  centre: string | null
  specialite: string
  potentiel: string
  secteur: string
}

export default function ManagementPortefeuille() {
  const { profile } = useAuth()
  const [clients, setClients] = useState<Client[]>([])
  const [visites, setVisites] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  async function load() {
    if (!profile?.id) return
    const { data: links } = await supabase
      .from('portefeuille_superviseurs')
      .select('client_id')
      .eq('superviseur_id', profile.id)

    const ids = (links ?? []).map((x) => x.client_id)
    if (ids.length) {
      const { data } = await supabase.from('clients').select('id,nom,centre,specialite,potentiel,secteur').in('id', ids).order('nom')
      setClients((data ?? []) as Client[])
    } else {
      setClients([])
    }

    const { count } = await supabase
      .from('visites')
      .select('id', { count: 'exact', head: true })
      .eq('vm_id', profile.id)
      .eq('jour', todayBenin().format('YYYY-MM-DD'))
      .eq('statut', 'REALISEE')
    setVisites(count ?? 0)
    setLoading(false)
  }

  useEffect(() => { load() }, [profile?.id])

  async function enregistrerVisite(client: Client) {
    if (!profile?.id) return
    setBusy(client.id)
    setMessage(null)

    let latitude = 0
    let longitude = 0
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
      )
      latitude = position.coords.latitude
      longitude = position.coords.longitude
    } catch {
      setMessage('La localisation est nécessaire pour enregistrer la visite.')
      setBusy(null)
      return
    }

    const { error } = await supabase.from('visites').insert({
      client_id: client.id,
      vm_id: profile.id,
      jour: todayBenin().format('YYYY-MM-DD'),
      type_visite: 'MEDICAL',
      statut: 'REALISEE',
      hors_programme: true,
      cachet_prospect: false,
      cachet_centre: false,
      prescriptions_constatees: 0,
      latitude,
      longitude
    })

    if (error) setMessage(error.message)
    else {
      setMessage(`Visite enregistrée pour ${client.nom}.`)
      await load()
    }
    setBusy(null)
  }

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase().trim()
    return !q || c.nom.toLowerCase().includes(q) || (c.centre ?? '').toLowerCase().includes(q)
  })

  if (loading) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>

  const objectif = 8
  const reste = Math.max(0, objectif - visites)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Mon portefeuille</h1>
        <p className="text-sm text-ink-400">Portefeuille personnel du superviseur et visites terrain</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-royal-600 text-white p-4">
          <p className="text-xs opacity-80">Visites aujourd'hui</p>
          <p className="mt-1 text-2xl font-extrabold">{visites}/8</p>
          <p className="text-[11px] opacity-80">{reste ? `${reste} visite(s) restante(s)` : 'Objectif atteint'}</p>
        </div>
        <div className="rounded-2xl bg-white border border-ink-100 p-4">
          <p className="text-xs text-ink-400">Portefeuille</p>
          <p className="mt-1 text-2xl font-extrabold text-ink-800">{clients.length}</p>
          <p className="text-[11px] text-ink-400">client(s) affecté(s)</p>
        </div>
        <div className="rounded-2xl bg-white border border-ink-100 p-4 col-span-2 md:col-span-1">
          <p className="text-xs text-ink-400">Progression</p>
          <p className="mt-1 text-2xl font-extrabold text-ink-800">{Math.min(100, Math.round(visites / objectif * 100))}%</p>
          <p className="text-[11px] text-ink-400">objectif quotidien</p>
        </div>
      </div>

      {message && <div className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-xs text-ink-600">{message}</div>}

      <Card className="flex items-center gap-3">
        <IconSearch className="h-4 w-4 text-ink-300" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un client ou centre…" className="w-full outline-none text-sm" />
      </Card>

      <div className="space-y-2.5">
        {filtered.map((client) => (
          <Card key={client.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-800 truncate">{client.nom}</p>
                <p className="text-[11px] text-ink-400">{client.centre ?? 'Centre non renseigné'} · {client.specialite}</p>
                <div className="mt-2 flex gap-1.5 flex-wrap">
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">{client.potentiel}</span>
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-500">Secteur {client.secteur}</span>
                </div>
              </div>
              <Button size="sm" loading={busy === client.id} disabled={visites >= 8} icon={visites >= 8 ? <IconCheckCircle className="h-4 w-4" /> : <IconMapPin className="h-4 w-4" />} onClick={() => enregistrerVisite(client)}>
                {visites >= 8 ? 'Objectif atteint' : 'Visiter'}
              </Button>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <Card className="py-10 text-center text-xs text-ink-400"><IconUsers className="mx-auto h-7 w-7 mb-2" />Aucun client dans le portefeuille du superviseur.</Card>}
      </div>
    </div>
  )
}
