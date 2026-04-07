import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden bg-surface-900">
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center justify-between px-4 bg-surface-950 border-b border-surface-600">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 text-ink-muted hover:text-ink-primary rounded-lg hover:bg-surface-800 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-gradient-cobalt rounded-md flex items-center justify-center">
            <span className="font-display font-bold text-white text-xs">B</span>
          </div>
          <span className="font-display font-semibold text-ink-primary text-sm">BountyHunter</span>
        </div>
        <div className="w-10" />
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-20 bg-surface-950/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />

      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
