import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

export function useUnreadNotifications() {
  const { session } = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) {
      setCount(0)
      return
    }

    let active = true

    async function load() {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', userId)
        .eq('lue', false)

      if (!error && active) setCount(count ?? 0)
    }

    void load()

    const channel = supabase
      .channel('notifications-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        void load()
      })
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [session])

  return count
}
