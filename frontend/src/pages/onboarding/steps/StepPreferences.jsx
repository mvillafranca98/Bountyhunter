import { useState } from 'react'
import { toast } from 'react-toastify'
import { profileApi } from '../../../lib/api'

export default function StepPreferences({ onComplete }) {
  const [salary, setSalary] = useState({ min_yearly: '', max_yearly: '', min_hourly: '', max_hourly: '', preferred_type: 'yearly' })
  const [roles, setRoles] = useState([{ role_title: '', industry: '' }])
  const [autoApply, setAutoApply] = useState(false)
  const [fitThreshold, setFitThreshold] = useState(75)
  const [loading, setLoading] = useState(false)

  const addRole = () => setRoles(r => [...r, { role_title: '', industry: '' }])
  const updateRole = (i, field, val) => setRoles(r => r.map((x, idx) => idx === i ? { ...x, [field]: val } : x))
  const removeRole = (i) => setRoles(r => r.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validRoles = roles.filter(r => r.role_title.trim())
    if (!validRoles.length) { toast.error('Add at least one target role'); return }

    setLoading(true)
    try {
      await Promise.all([
        profileApi.updateSalary(salary),
        profileApi.updateRoles(validRoles),
        profileApi.update({ auto_apply: autoApply, fit_threshold: fitThreshold, onboarding_step: 2 }),
      ])
      onComplete()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save preferences')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Target roles */}
      <div>
        <label className="label mb-2">Target roles</label>
        <div className="space-y-2">
          {roles.map((role, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text" required={i === 0}
                className="input flex-1"
                placeholder="e.g. Software Engineer"
                value={role.role_title}
                onChange={e => updateRole(i, 'role_title', e.target.value)}
              />
              <input
                type="text"
                className="input w-36"
                placeholder="Industry"
                value={role.industry}
                onChange={e => updateRole(i, 'industry', e.target.value)}
              />
              {roles.length > 1 && (
                <button type="button" onClick={() => removeRole(i)} className="text-gray-500 hover:text-danger px-1">✕</button>
              )}
            </div>
          ))}
        </div>
        {roles.length < 5 && (
          <button type="button" onClick={addRole} className="text-sm text-brand-light hover:underline mt-2">+ Add role</button>
        )}
      </div>

      {/* Salary */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Salary range</label>
          <select
            className="text-xs bg-surface-900 border border-surface-600 rounded px-2 py-1 text-gray-300"
            value={salary.preferred_type}
            onChange={e => setSalary(p => ({ ...p, preferred_type: e.target.value }))}
          >
            <option value="yearly">Per year</option>
            <option value="hourly">Per hour</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {salary.preferred_type === 'yearly' ? (
            <>
              <div>
                <label className="label text-xs">Minimum ($)</label>
                <input type="number" className="input" placeholder="60000" value={salary.min_yearly}
                  onChange={e => setSalary(p => ({ ...p, min_yearly: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Maximum ($)</label>
                <input type="number" className="input" placeholder="120000" value={salary.max_yearly}
                  onChange={e => setSalary(p => ({ ...p, max_yearly: e.target.value }))} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label text-xs">Minimum ($/hr)</label>
                <input type="number" className="input" placeholder="30" value={salary.min_hourly}
                  onChange={e => setSalary(p => ({ ...p, min_hourly: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Maximum ($/hr)</label>
                <input type="number" className="input" placeholder="80" value={salary.max_hourly}
                  onChange={e => setSalary(p => ({ ...p, max_hourly: e.target.value }))} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Auto-apply settings */}
      <div className="bg-surface-900 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Auto-apply mode</p>
            <p className="text-xs text-gray-500 mt-0.5">Automatically submit applications above the fit threshold</p>
          </div>
          <button
            type="button"
            onClick={() => setAutoApply(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${autoApply ? 'bg-brand' : 'bg-surface-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoApply ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <div>
          <label className="label text-xs">Fit score threshold: <span className="text-brand-light">{fitThreshold}%</span></label>
          <input
            type="range" min={50} max={95} step={5}
            className="w-full accent-brand"
            value={fitThreshold}
            onChange={e => setFitThreshold(Number(e.target.value))}
          />
          <div className="flex justify-between text-xs text-gray-600 mt-0.5">
            <span>50% (more apps)</span><span>95% (fewer, better)</span>
          </div>
        </div>
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center">
        {loading ? 'Saving…' : 'Continue →'}
      </button>
    </form>
  )
}
