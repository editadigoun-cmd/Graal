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

    let cancelled = false
    setState((current) => ({ ...current, status: 'locating' }))

    const fallback = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!cancelled) setState({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            status: 'ok'
          })
        },
        (error) => {
          if (!cancelled) setState({
            latitude: null,
            longitude: null,
            status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error'
          })
        },
        // Certains téléphones Android d'entrée de gamme mettent longtemps à obtenir
        // un fix GPS précis. Autoriser le fournisseur réseau en solution de secours.
        { enableHighAccuracy: false, timeout: 25000, maximumAge: 180000 }
      )
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!cancelled) setState({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          status: 'ok'
        })
      },
      (error) => {
        if (cancelled) return
        if (error.code === error.PERMISSION_DENIED) {
          setState({ latitude: null, longitude: null, status: 'denied' })
          return
        }
        fallback()
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 120000 }
    )

    return () => { cancelled = true }
  }, [])

  return state
}
