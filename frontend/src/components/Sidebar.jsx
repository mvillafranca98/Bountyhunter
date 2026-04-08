import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const navItems = [
  { to: '/dashboard',              label: 'Dashboard',    icon: GridIcon },
  { to: '/dashboard/jobs',         label: 'Job Queue',    icon: BriefcaseIcon },
  { to: '/dashboard/applications', label: 'Applications', icon: CheckIcon },
  { to: '/dashboard/resume',       label: 'Resume',       icon: DocumentIcon },
  { to: '/dashboard/questions',    label: 'Question Bank',icon: ChatIcon },
  { to: '/dashboard/analytics',    label: 'Analytics',    icon: ChartIcon },
  { to: '/dashboard/companies',    label: 'Companies',    icon: BuildingIcon },
  { to: '/dashboard/profile',      label: 'Profile',      icon: UserIcon },
]

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside
      className={`fixed lg:relative inset-y-0 left-0 z-30 w-64 lg:w-56 flex flex-col bg-surface-950 border-r border-surface-600 shrink-0 transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Logo */}
      <div className="px-4 py-5 border-b border-surface-600 relative">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-gradient-cobalt rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">B</div>
          <span className="font-display font-semibold text-ink-primary tracking-tight">BountyHunter</span>
        </div>
        <p className="text-xs text-ink-muted mt-1 ml-9">AI Job Copilot</p>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="lg:hidden absolute top-4 right-4 p-1.5 text-ink-muted hover:text-ink-primary rounded-lg hover:bg-surface-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 text-sm transition-colors duration-100 rounded-r-lg ${
                isActive
                  ? 'bg-cobalt/10 text-white font-medium border-l-2 border-cobalt'
                  : 'text-ink-muted hover:text-ink-primary hover:bg-surface-800 border-l-2 border-transparent'
              }`
            }
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="border-t border-surface-600 px-3 py-4">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 rounded-full bg-gradient-cobalt text-white flex items-center justify-center text-xs font-bold uppercase shrink-0">
            {user?.first_name?.[0]}{user?.last_name?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink-primary truncate">{user?.first_name} {user?.last_name}</p>
            <p className="text-xs text-ink-muted truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="w-full mt-1 text-left flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-ink-muted hover:text-danger transition-colors"
        >
          <LogoutIcon className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}

// ─── Inline SVG Icons ──────────────────────────────────────────────────────────
function GridIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
}
function BriefcaseIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
}
function DocumentIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
}
function ChatIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
}
function ChartIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18"/><path strokeLinecap="round" strokeLinejoin="round" d="M7 16l4-4 4 4 5-5"/></svg>
}
function UserIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
}
function BuildingIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0H3m2 0H3m0 0h18M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>
}
function LogoutIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
}
