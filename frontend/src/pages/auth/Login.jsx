import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const user = await login(form.email, form.password)
      navigate(user.onboarding_step < 3 ? '/onboarding' : '/dashboard')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left panel — decorative, hidden on mobile */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-brand flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Background glow orbs */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-cobalt/30 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-violet/30 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
          {/* Monogram */}
          <div className="w-20 h-20 bg-gradient-cobalt rounded-2xl flex items-center justify-center text-white font-display font-bold text-4xl shadow-glow-cobalt mb-8">
            BH
          </div>

          {/* Headline */}
          <h2 className="font-display text-3xl font-bold text-white leading-tight mb-4">
            Hunt smarter.<br />Land faster.
          </h2>

          {/* Subtext */}
          <p className="text-ink-secondary text-base leading-relaxed mb-10">
            AI-powered job search that scores, tracks, and applies — all in one place.
          </p>

          {/* Feature chips */}
          <div className="flex flex-wrap justify-center gap-2">
            {['9 job sources', 'AI scoring', 'Auto-apply'].map((chip) => (
              <span
                key={chip}
                className="px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-xs font-medium backdrop-blur-sm"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 md:w-1/2 bg-surface-900 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile-only logo */}
          <div className="flex justify-center mb-8 md:hidden">
            <div className="w-12 h-12 bg-gradient-cobalt rounded-xl flex items-center justify-center text-white font-display font-bold text-xl">
              B
            </div>
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold text-ink-primary mb-1">Welcome back</h1>
            <p className="text-sm text-ink-muted">
              New here?{' '}
              <Link to="/register" className="text-cobalt hover:text-cobalt/80 transition-colors">
                Create an account
              </Link>
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                required
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                required
                className="input"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
