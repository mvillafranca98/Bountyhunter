import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { profileApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoApply, setAutoApply] = useState(false)
  const [fitThreshold, setFitThreshold] = useState(75)

  useEffect(() => {
    profileApi.get().then(({ data }) => {
      setProfile(data)
      setAutoApply(!!data.user?.auto_apply)
      setFitThreshold(data.user?.fit_threshold || 75)
    }).finally(() => setLoading(false))
  }, [])

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.target)
    const updates = Object.fromEntries(fd.entries())
    updates.auto_apply = autoApply
    updates.fit_threshold = fitThreshold

    try {
      await profileApi.update(updates)
      updateUser(updates)
      toast.success('Profile saved!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="text-gray-500 text-sm text-center py-16">Loading…</div>

  const u = profile?.user || {}

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Profile</h1>

      <form onSubmit={save} className="space-y-5">
        <div className="card space-y-4">
          <p className="font-medium text-white">Personal info</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input name="first_name" defaultValue={u.first_name} className="input" />
            </div>
            <div>
              <label className="label">Last name</label>
              <input name="last_name" defaultValue={u.last_name} className="input" />
            </div>
          </div>
          <div>
            <label className="label">Phone</label>
            <input name="phone" defaultValue={u.phone} className="input" placeholder="+1 555-000-0000" />
          </div>
          <div>
            <label className="label">Location</label>
            <input name="location" defaultValue={u.location} className="input" placeholder="New York, NY" />
          </div>
          <div>
            <label className="label">LinkedIn URL</label>
            <input name="linkedin_url" type="url" defaultValue={u.linkedin_url} className="input" />
          </div>
        </div>

        <div className="card space-y-4">
          <p className="font-medium text-white">Job preferences</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Work authorization</label>
              <select name="work_authorization" defaultValue={u.work_authorization} className="input">
                <option value="authorized">Authorized (no sponsorship)</option>
                <option value="visa_required">Needs visa sponsorship</option>
                <option value="citizen">US Citizen / PR</option>
              </select>
            </div>
            <div>
              <label className="label">Employment type</label>
              <select name="employment_type" defaultValue={u.employment_type} className="input">
                <option value="full-time">Full-time</option>
                <option value="part-time">Part-time</option>
                <option value="contract">Contract</option>
                <option value="any">Any</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Earliest start date</label>
            <input name="start_date" type="date" defaultValue={u.start_date} className="input" />
          </div>
        </div>

        <div className="card space-y-4">
          <p className="font-medium text-white">Auto-apply settings</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Auto-apply mode</p>
              <p className="text-xs text-gray-500">Automatically submit applications above threshold</p>
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
            <label className="label">Fit threshold: <span className="text-brand-light">{fitThreshold}%</span></label>
            <input
              type="range" min={50} max={95} step={5}
              className="w-full accent-brand"
              value={fitThreshold}
              onChange={e => setFitThreshold(Number(e.target.value))}
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </div>
  )
}
