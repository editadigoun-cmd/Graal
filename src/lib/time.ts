import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import isoWeek from 'dayjs/plugin/isoWeek'
import 'dayjs/locale/fr'

dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(isoWeek)
dayjs.locale('fr')

export const BENIN_TZ = 'Africa/Porto-Novo'

export function nowBenin() {
  return dayjs().tz(BENIN_TZ)
}

export function todayBenin() {
  return nowBenin().startOf('day')
}

export function isoWeekMonday(d = nowBenin()) {
  return d.tz(BENIN_TZ).startOf('isoWeek')
}

/** Échéance standard du samedi à 14h (Bénin), prolongée si un délai individuel est accordé. */
export function deadlineSoumission(semaineDebut: string, delaiSupplementaireJusquA?: string | null) {
  const standard = dayjs.tz(semaineDebut, BENIN_TZ).subtract(2, 'day').hour(14).minute(0).second(0).millisecond(0)
  if (!delaiSupplementaireJusquA) return standard

  const supplement = dayjs(delaiSupplementaireJusquA).tz(BENIN_TZ)
  return supplement.isValid() && supplement.isAfter(standard) ? supplement : standard
}

export function heureCloture(heure = '19:00') {
  const [h, m] = heure.split(':').map(Number)
  return todayBenin().hour(h).minute(m).second(0)
}

export function formatCountdown(target: dayjs.Dayjs) {
  const diff = target.diff(nowBenin(), 'second')
  if (diff <= 0) return null
  const d = Math.floor(diff / 86400)
  const h = Math.floor((diff % 86400) / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  if (d > 0) return `${d}j ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${s}s`
  return `${m}m ${s}s`
}
