import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'

const hasSupabaseConfig = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
)

function ConfigError() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-900 px-6 text-center">
      <div className="max-w-sm">
        <p className="text-lg font-bold text-white">Configuration manquante</p>
        <p className="mt-2 text-sm text-ink-300">
          Les variables d'environnement Supabase (<code>VITE_SUPABASE_URL</code>,{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>) ne sont pas définies.
        </p>
        <p className="mt-3 text-sm text-ink-300">
          En local, copiez <code>.env.example</code> vers <code>.env</code>. Sur Cloudflare,
          ajoutez ces variables dans les paramètres du projet puis relancez le déploiement.
        </p>
      </div>
    </div>
  )
}

// App and its Supabase client are loaded only after the environment has been checked.
// This prevents Supabase's module initialization from throwing before React can render
// the configuration error, which previously resulted in a completely blank page.
const App = lazy(() => import('./App'))

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {hasSupabaseConfig ? (
      <BrowserRouter>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </BrowserRouter>
    ) : (
      <ConfigError />
    )}
  </React.StrictMode>
)
