import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type Parametre = Database['public']['Tables']['parametres']['Row']

export default function ManagementParametres() {
  const [params, setParams] = useState<Parametre[]>([])
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('parametres').select('*').order('key').then(({ data }) => {
      setParams(data ?? [])
      setValeurs(Object.fromEntries((data ?? []).map((p) => [p.key, String(p.value).replace(/^"|"$/g, '')])))
      setLoading(false)
    })
  }, [])

  async function sauvegarder(key: string) {
    const raw = valeurs[key]
    const isNumeric = !Number.isNaN(Number(raw)) && raw.trim() !== ''
    const value = isNumeric ? Number(raw) : `"${raw}"`
    await supabase.from('parametres').update({ value }).eq('key', key)
    setSaved(key)
    setTimeout(() => setSaved(null), 1500)
  }

  if (loading) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink-800 font-display">Paramètres de la plateforme</h1>
        <p className="text-sm text-ink-400">Seuils, horaires de verrouillage et pondérations — modifiables à tout moment.</p>
      </div>

      <div className="space-y-3">
        {params.map((p) => (
          <Card key={p.key} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-800">{p.key}</p>
              {p.description && <p className="text-xs text-ink-400 mt-0.5">{p.description}</p>}
            </div>
            <input
              value={valeurs[p.key] ?? ''} onChange={(e) => setValeurs((v) => ({ ...v, [p.key]: e.target.value }))}
              className="w-32 rounded-xl border border-ink-200 px-3 py-2 text-sm text-right"
            />
            <Button size="sm" variant={saved === p.key ? 'success' : 'secondary'} onClick={() => sauvegarder(p.key)}>
              {saved === p.key ? 'Enregistré' : 'Enregistrer'}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  )
}
