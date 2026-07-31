import { useEffect, useState } from 'react'

interface GeoState {
  latitude: number | null
  longitude: number | null
  status: 'idle' | 'locating' | 'ok' | 'denied' | 'error'
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ latitude: null, longitude: null, status: 'idle' })

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ latitude: null, longitude: null, status: 'error' })
      return
    }
    setState((s) => ({ ...s, status: 'locating' }))
    navigator.geolocation.getCurrentPosition(
      (pos) => setState({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, status: 'ok' }),
      (err) => setState({ latitude: null, longitude: null, status: err.code === err.PERMISSION_DENIED ? 'denied' : 'error' }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    )
  }, [])

  return state
}
