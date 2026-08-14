import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { CircularProgress } from '@/components/ui/CircularProgress'
import { Switch } from '@/components/ui/Switch'
import { AvatarUpload } from '@/components/ui/AvatarUpload'
import { IconLogout, IconUsers, IconMapPin, IconLock, IconBell } from '@/components/ui/icons'
import { useAuth } from '@/features/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { todayBenin } from '@/lib/time'
import { isBiometricAvailable, hasBiometricEnrolled, enrollBiometric, clearBiometricEnrollment } from '@/lib/biometric'
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '@/lib/pushNotifications'

export default function Profil() {
  const { profile, signOut } = useAuth()
  const [equipeNom, setEquipeNom] = useState('')
  const [scoreMensuel, setScoreMensuel] = useState(0)
  const [historique, setHistorique] = useState<{ jour: string; realisees: number }[]>([])
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioEnrolled, setBioEnrolled] = useState(false)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState('')

  useEffect(() => {
    if (!profile) return
    supabase.from('equipes').select('nom').eq('id', profile.equipe_id ?? '').maybeSingle()
      .then(({ data }) => setEquipeNom(data?.nom ?? '—'))

    supabase.rpc('score_mensuel_vm', { p_vm_id: profile.id, p_mois: todayBenin().startOf('month').format('YYYY-MM-DD') })
      .then(({ data }) => setScoreMensuel((Array.isArray(data) ? data[0] : data)?.score_global ?? 0))

    supabase.from('v_taux_realisation_journalier').select('jour, visites_realisees')
      .gte('jour', todayBenin().subtract(13, 'day').format('YYYY-MM-DD')).order('jour', { ascending: false })
      .then(({ data }) => setHistorique((data ?? []).map((r) => ({ jour: r.jour!, realisees: r.visites_realisees ?? 0 }))))

    isBiometricAvailable().then(setBioAvailable)
    setBioEnrolled(hasBiometricEnrolled())

    setPushSupported(isPushSupported())
    isSubscribedToPush().then(setPushEnabled)
  }, [profile])

  async function togglePush() {
    if (!profile) return
    setPushBusy(true)
    setPushError('')
    if (pushEnabled) {
      await unsubscribeFromPush()
      setPushEnabled(false)
    } else {
      const res = await subscribeToPush(profile.id)
      if (res.ok) setPushEnabled(true)
      else setPushError(res.error ?? 'Échec de l\'activation.')
    }
    setPushBusy(false)
  }

  async function toggleBiometric() {
    if (!profile) return
    if (bioEnrolled) {
      clearBiometricEnrollment()
      setBioEnrolled(false)
    } else {
      const ok = await enrollBiometric(profile.id, profile.full_name)
      setBioEnrolled(ok)
    }
  }

  if (!profile) return null

  return (
    <div className="space-y-4 mt-2 pb-4">
      <Card className="flex flex-col items-center text-center py-7">
        <AvatarUpload size={76} />
        <p className="mt-3 text-lg font-bold text-ink-800 font-display">{profile.full_name}</p>
        <p className="text-xs text-ink-400 capitalize">{profile.role === 'vm' ? 'Visiteur médical' : profile.role}</p>
        <div className="mt-4"><CircularProgress value={scoreMensuel} label="score mensuel" size={92} tone={scoreMensuel >= 90 ? 'emerald' : 'flame'} /></div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex items-center gap-3 py-4">
          <div className="rounded-xl bg-royal-50 p-2 text-royal-600"><IconUsers className="h-5 w-5" /></div>
          <div><p className="text-[11px] text-ink-400">Équipe</p><p className="text-sm font-bold text-ink-800">{equipeNom}</p></div>
        </Card>
        <Card className="flex items-center gap-3 py-4">
          <div className="rounded-xl bg-emerald-50 p-2 text-emerald-600"><IconMapPin className="h-5 w-5" /></div>
          <div><p className="text-[11px] text-ink-400">Secteur</p><p className="text-sm font-bold text-ink-800">{profile.secteur ?? '—'}</p></div>
        </Card>
      </div>

      <Card>
        <p className="text-sm font-bold text-ink-800 mb-3">Historique (14 derniers jours)</p>
        <div className="flex items-end gap-1.5 h-20">
          {historique.slice().reverse().map((h) => (
            <div key={h.jour} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-royal-600 to-emerald-500"
                style={{ height: `${Math.min(100, h.realisees * 5)}%`, minHeight: h.realisees > 0 ? 4 : 0 }}
              />
            </div>
          ))}
        </div>
      </Card>

      {bioAvailable && (
        <Card className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-ink-100 p-2 text-ink-600"><IconLock className="h-5 w-5" /></div>
            <div>
              <p className="text-sm font-bold text-ink-800">Déverrouillage biométrique</p>
              <p className="text-[11px] text-ink-400">Face ID / empreinte sur cet appareil</p>
            </div>
          </div>
          <Switch checked={bioEnrolled} onChange={toggleBiometric} label="Déverrouillage biométrique" />
        </Card>
      )}

      {pushSupported && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-ink-100 p-2 text-ink-600"><IconBell className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-bold text-ink-800">Notifications push</p>
                <p className="text-[11px] text-ink-400">Rappels et alertes même app fermée</p>
              </div>
            </div>
            <Switch checked={pushEnabled} onChange={togglePush} loading={pushBusy} label="Notifications push" />
          </div>
          {pushError && <p className="mt-2 text-[11px] text-red-500">{pushError}</p>}
        </Card>
      )}

      <Button variant="secondary" fullWidth icon={<IconLogout className="h-4 w-4" />} onClick={signOut}>
        Se déconnecter
      </Button>
    </div>
  )
}
