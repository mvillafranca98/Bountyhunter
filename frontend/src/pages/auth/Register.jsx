import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useAuth } from '../../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const set = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('Password must be 8+ characters'); return }
    setLoading(true)
    try {
      await register(form)
      navigate('/onboarding')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-800 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-brand rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">B</div>
          <h1 className="text-2xl font-bold text-white">Create your account</h1>
          <p className="text-gray-400 text-sm mt-1">Start hunting smarter</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input type="text" required className="input" placeholder="Jane" value={form.first_name} onChange={set('first_name')} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input type="text" required className="input" placeholder="Doe" value={form.last_name} onChange={set('last_name')} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" required className="input" placeholder="you@example.com" value={form.email} onChange={set('email')} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required minLength={8} className="input" placeholder="8+ characters" value={form.password} onChange={set('password')} />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Have an account?{' '}
          <Link to="/login" className="text-brand-light hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
