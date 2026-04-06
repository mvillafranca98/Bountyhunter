import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Onboarding from './pages/onboarding/Onboarding'
import AppShell from './components/AppShell'
import Dashboard from './pages/dashboard/Dashboard'
import JobQueue from './pages/dashboard/JobQueue'
import Applications from './pages/dashboard/Applications'
import QuestionBank from './pages/dashboard/QuestionBank'
import Profile from './pages/dashboard/Profile'
import ResumeStudio from './pages/dashboard/ResumeStudio'
import Analytics from './pages/dashboard/Analytics'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace />
  if (user.onboarding_step < 3) return <Navigate to="/onboarding" replace />
  return children
}

function RequireGuest({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (user) return <Navigate to="/" replace />
  return children
}

function Spinner() {
  return (
    <div className="w-8 h-8 border-2 border-brand border-t-transparent rounded-full animate-spin" />
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Guest routes */}
        <Route path="/login"    element={<RequireGuest><Login /></RequireGuest>} />
        <Route path="/register" element={<RequireGuest><Register /></RequireGuest>} />

        {/* Onboarding (auth required but onboarding not complete) */}
        <Route path="/onboarding" element={<Onboarding />} />

        {/* App (auth + onboarding required) */}
        <Route path="/" element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="jobs"        element={<JobQueue />} />
          <Route path="applications" element={<Applications />} />
          <Route path="questions"   element={<QuestionBank />} />
          <Route path="resume"      element={<ResumeStudio />} />
          <Route path="analytics"   element={<Analytics />} />
          <Route path="profile"     element={<Profile />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
