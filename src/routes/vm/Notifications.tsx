import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { IconChevronLeft, IconBell } from '@/components/ui/icons'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import dayjs from 'dayjs'

type Notif = Database['public']['Tables']['notifications']['Row']

export default function Notifications() {
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => {
        setNotifs(data ?? [])
        setLoading(false)
        const unread = (data ?? []).filter((n) => !n.lue).map((n) => n.id)
        if (unread.length) {
          Promise.all(unread.map((id) => supabase.from('notifications').update({ lue: true }).eq('id', id)))
        }
      })
  }, [])

  return (
    <div className="space-y-3 mt-2 pb-4">
      <div className="flex items-center gap-2">
        <Link to="/app" className="rounded-full p-1.5 hover:bg-ink-100"><IconChevronLeft className="h-5 w-5" /></Link>
        <h1 className="text-lg font-bold text-ink-800 font-display">Notifications</h1>
      </div>

      {!loading && notifs.length === 0 && (
        <Card className="flex flex-col items-center py-12 text-center">
          <IconBell className="h-8 w-8 text-ink-300" />
          <p className="mt-3 text-sm font-semibold text-ink-500">Aucune notification</p>
          <p className="text-xs text-ink-400 mt-1">Vous serez alerté ici des rappels et échéances importantes.</p>
        </Card>
      )}

      {notifs.map((n, i) => (
        <motion.div key={n.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
          <Card className={!n.lue ? 'ring-2 ring-royal-100' : undefined}>
            <div className="flex items-start gap-3">
              <div className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${n.lue ? 'bg-ink-200' : 'bg-royal-500'}`} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-800">{n.titre}</p>
                {n.corps && <p className="text-xs text-ink-500 mt-0.5">{n.corps}</p>}
                <p className="text-[10px] text-ink-400 mt-1.5">{dayjs(n.created_at).format('DD/MM/YYYY à HH:mm')}</p>
              </div>
            </div>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
