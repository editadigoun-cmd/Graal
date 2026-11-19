import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'\nimport { GlobalFeedbackPopup } from '@/components/ui/GlobalFeedbackPopup'
import Splash from '@/routes/Splash'
import Login from '@/routes/Login'
import { VmShell } from '@/routes/vm/VmShell'
import { ManagementShell } from '@/routes/management/ManagementShell'
import VmDashboard from '@/routes/vm/Dashboard'
import Planning from '@/routes/vm/Planning'
import Visites from '@/routes/vm/Visites'
import VisiteDetail from '@/routes/vm/VisiteDetail'
import Cloture from '@/routes/vm/Cloture'
import Garde from '@/routes/vm/Garde'
import Portefeuille from '@/routes/vm/Portefeuille'
import ClientDetail from '@/routes/vm/ClientDetail'
import Messages from '@/routes/vm/Messages'
import Conversation from '@/routes/vm/Conversation'
import Profil from '@/routes/vm/Profil'
import Notifications from '@/routes/vm/Notifications'
import Reporting from '@/routes/vm/Reporting'
import ManagementDashboard from '@/routes/management/Dashboard'
import ManagementProgrammes from '@/routes/management/Programmes'
import ManagementEquipes from '@/routes/management/Equipes'
import ManagementParametres from '@/routes/management/Parametres'
import ManagementReporting from '@/routes/management/Reporting'
import ManagementCouvertureMensuelle from '@/routes/management/CouvertureMensuelle'
import ManagementProfil from '@/routes/management/Profil'
import ManagementActivite from '@/routes/management/Activite'
import ManagementPlanActivites from '@/routes/management/PlanActivites'
import ManagementRapportsDuo from '@/routes/management/RapportsDuo'
import ManagementClients from '@/routes/management/Clients'
import ManagementPortefeuille from '@/routes/management/Portefeuille'
import ManagementProduits from '@/routes/management/Produits'
import ManagementAnimationEquipe from '@/routes/management/AnimationEquipe'
import ManagementIndicateursAnimation from '@/routes/management/IndicateursAnimation'
import ManagementPilotageVentes from '@/routes/management/PilotageVentes'
import ManagementAnalyseVentes from '@/routes/management/AnalyseVentes'
import ManagementTerrainHub from '@/routes/management/TerrainHub'
import ManagementVadPlan from '@/routes/management/VadPlan'
import ManagementQuotasVad from '@/routes/management/QuotasVad'
import ManagementRapportActiviteHebdomadaire from '@/routes/management/RapportActiviteHebdomadaire'
import ManagementControleFrequenceClients from '@/routes/management/ControleFrequenceClients'
import EvaluationSuperviseurs from '@/routes/management/EvaluationSuperviseurs'
import ManagementAnniversaires from '@/routes/management/Anniversaires'
import ManagementNotifications from '@/routes/management/Notifications'
import SupervisorVisites from '@/routes/management/Visites'
import PlanningVisitesSuperviseurs from '@/routes/management/PlanningVisitesSuperviseurs'
const ManagementSuiviTerrain = lazy(() => import('@/routes/management/SuiviTerrain'))

function ConfigError() {
  return <div className="min-h-screen flex items-center justify-center bg-ink-900 px-6 text-center"><div className="max-w-sm"><p className="text-lg font-bold text-white">Configuration manquante</p><p className="mt-2 text-sm text-ink-300">Les variables d'environnement Supabase (<code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>) ne sont pas définies pour ce déploiement. Ajoutez-les dans Cloudflare Pages/Workers → Settings → Variables and Secrets, puis relancez un déploiement.</p></div></div>
}
function Gate({ children }: { children: React.ReactNode }) { const { loading } = useAuth(); if (loading) return <Splash />; return <>{children}</> }
function RequireAuth({ children }: { children: React.ReactNode }) { const { session } = useAuth(); if (!session) return <Navigate to="/login" replace />; return <>{children}</> }
function RoleRedirect() { const { session, profile } = useAuth(); if (!session) return <Navigate to="/login" replace />; if (!profile) return <Splash />; if (profile.role === 'vm') return <Navigate to="/app" replace />; return <Navigate to="/admin" replace /> }
function RequireManagement({ children }: { children: React.ReactNode }) { const { profile } = useAuth(); if (!profile) return <Splash />; if (profile.role === 'vm') return <Navigate to="/app" replace />; return <>{children}</> }
function RequireAdmin({ children }: { children: React.ReactNode }) { const { profile } = useAuth(); if (!profile) return <Splash />; if (profile.role !== 'admin') return <Navigate to="/admin" replace />; return <>{children}</> }

export default function App() {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) return <ConfigError />
  return <AuthProvider><GlobalFeedbackPopup /><Gate><Routes>
    <Route path="/login" element={<Login />} /><Route path="/" element={<RoleRedirect />} />
    <Route path="/app" element={<RequireAuth><VmShell /></RequireAuth>}>
      <Route index element={<VmDashboard />} /><Route path="planning" element={<Planning />} /><Route path="visites" element={<Visites />} /><Route path="visites/:ligneId" element={<VisiteDetail />} /><Route path="cloture" element={<Cloture />} /><Route path="garde" element={<Garde />} /><Route path="portefeuille" element={<Portefeuille />} /><Route path="portefeuille/:clientId" element={<ClientDetail />} /><Route path="messages" element={<Messages />} /><Route path="messages/:conversationId" element={<Conversation />} /><Route path="profil" element={<Profil />} /><Route path="notifications" element={<Notifications />} /><Route path="reporting" element={<Reporting />} />
    </Route>
    <Route path="/admin" element={<RequireAuth><RequireManagement><ManagementShell /></RequireManagement></RequireAuth>}>
      <Route index element={<ManagementDashboard />} /><Route path="planning-visites-superviseurs" element={<PlanningVisitesSuperviseurs />} /><Route path="visites" element={<SupervisorVisites />} /><Route path="notifications" element={<ManagementNotifications />} /><Route path="anniversaires" element={<RequireAdmin><ManagementAnniversaires /></RequireAdmin>} /><Route path="programmes" element={<ManagementProgrammes />} /><Route path="reporting" element={<ManagementReporting />} /><Route path="couverture-mensuelle" element={<RequireAdmin><ManagementCouvertureMensuelle /></RequireAdmin>} /><Route path="equipes" element={<ManagementEquipes />} /><Route path="portefeuille" element={<ManagementPortefeuille />} /><Route path="clients" element={<RequireAdmin><ManagementClients /></RequireAdmin>} /><Route path="produits" element={<RequireAdmin><ManagementProduits /></RequireAdmin>} /><Route path="activite" element={<ManagementActivite />} /><Route path="plan-activites" element={<ManagementPlanActivites />} /><Route path="rapports-duo" element={<ManagementRapportsDuo />} /><Route path="animation-equipe" element={<ManagementAnimationEquipe />} /><Route path="indicateurs-animation" element={<RequireAdmin><ManagementIndicateursAnimation /></RequireAdmin>} /><Route path="pilotage-ventes" element={<ManagementPilotageVentes />} /><Route path="analyse-ventes" element={<ManagementAnalyseVentes />} /><Route path="terrain" element={<ManagementTerrainHub />} /><Route path="vad-plan" element={<ManagementVadPlan />} /><Route path="quotas-vad" element={<ManagementQuotasVad />} /><Route path="rapport-activite-hebdo" element={<ManagementRapportActiviteHebdomadaire />} /><Route path="controle-frequence" element={<ManagementControleFrequenceClients />} /><Route path="evaluation-superviseurs" element={<RequireAdmin><EvaluationSuperviseurs /></RequireAdmin>} /><Route path="parametres" element={<RequireAdmin><ManagementParametres /></RequireAdmin>} /><Route path="messages" element={<Messages />} /><Route path="messages/:conversationId" element={<Conversation />} /><Route path="suivi-terrain" element={<Suspense fallback={null}><ManagementSuiviTerrain /></Suspense>} /><Route path="profil" element={<ManagementProfil />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Gate></AuthProvider>
}
