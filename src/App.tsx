import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import Splash from '@/routes/Splash'
import Login from '@/routes/Login'
import { VmShell } from '@/routes/vm/VmShell'
import { ManagementShell } from '@/routes/management/ManagementShell'
import VmDashboard from '@/routes/vm/Dashboard'
import Planning from '@/routes/vm/Planning'
import Visites from '@/routes/vm/Visites'
import VisiteDetail from '@/routes/vm/VisiteDetail'
import Cloture from '@/routes/vm/Cloture'
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

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth()
  if (loading) return <Splash />
  return <>{children}</>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RoleRedirect() {
  const { profile } = useAuth()
  if (!profile) return <Splash />
  if (profile.role === 'vm') return <Navigate to="/app" replace />
  return <Navigate to="/admin" replace />
}

function RequireManagement({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth()
  if (!profile) return <Splash />
  if (profile.role === 'vm') return <Navigate to="/app" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <Gate>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RoleRedirect />} />

          <Route path="/app" element={<RequireAuth><VmShell /></RequireAuth>}>
            <Route index element={<VmDashboard />} />
            <Route path="planning" element={<Planning />} />
            <Route path="visites" element={<Visites />} />
            <Route path="visites/:ligneId" element={<VisiteDetail />} />
            <Route path="cloture" element={<Cloture />} />
            <Route path="portefeuille" element={<Portefeuille />} />
            <Route path="portefeuille/:clientId" element={<ClientDetail />} />
            <Route path="messages" element={<Messages />} />
            <Route path="messages/:conversationId" element={<Conversation />} />
            <Route path="profil" element={<Profil />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="reporting" element={<Reporting />} />
          </Route>

          <Route path="/admin" element={<RequireAuth><RequireManagement><ManagementShell /></RequireManagement></RequireAuth>}>
            <Route index element={<ManagementDashboard />} />
            <Route path="programmes" element={<ManagementProgrammes />} />
            <Route path="reporting" element={<ManagementReporting />} />
            <Route path="equipes" element={<ManagementEquipes />} />
            <Route path="parametres" element={<ManagementParametres />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Gate>
    </AuthProvider>
  )
}
