import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { profileApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

const WORK_STYLES = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'On-site' },
  { value: 'any', label: 'Any' },
]

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry (0-2 yrs)' },
  { value: 'mid', label: 'Mid (2-5 yrs)' },
  { value: 'senior', label: 'Senior (5-10 yrs)' },
  { value: 'lead', label: 'Lead / Staff (8+ yrs)' },
]

const DEAL_BREAKER_OPTIONS = [
  { value: 'degree_required', label: 'Skip jobs requiring specific degrees' },
  { value: 'onsite_only', label: 'Skip on-site only jobs' },
  { value: 'residency_required', label: 'Skip jobs requiring US/EU residency' },
]

const INDUSTRY_OPTIONS = [
  'AI/ML', 'Healthcare', 'SaaS', 'Fintech', 'E-commerce',
  'Education', 'Cybersecurity', 'Gaming', 'Media', 'Enterprise',
]

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [autoApply, setAutoApply] = useState(false)
  const [fitThreshold, setFitThreshold] = useState(60)

  // Job search preferences state
  const [prefs, setPrefs] = useState({
    work_style: 'remote',
    deal_breakers: [],
    target_industries: [],
    experience_level: 'mid',
    languages: ['English'],
    target_regions: [],
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [langInput, setLangInput] = useState('')

  useEffect(() => {
    Promise.all([
      profileApi.get(),
      profileApi.getPreferences(),
    ]).then(([profileRes, prefsRes]) => {
      setProfile(profileRes.data)
      setAutoApply(!!profileRes.data.user?.auto_apply)
      setFitThreshold(profileRes.data.user?.fit_threshold || 60)
      setPrefs(prefsRes.data)
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

  const savePrefs = async () => {
    setSavingPrefs(true)
    try {
      await profileApi.updatePreferences(prefs)
      toast.success('Search preferences saved!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save preferences')
    } finally {
      setSavingPrefs(false)
    }
  }

  const toggleDealBreaker = (value) => {
    setPrefs(p => ({
      ...p,
      deal_breakers: p.deal_breakers.includes(value)
        ? p.deal_breakers.filter(d => d !== value)
        : [...p.deal_breakers, value],
    }))
  }

  const toggleIndustry = (value) => {
    setPrefs(p => ({
      ...p,
      target_industries: p.target_industries.includes(value)
        ? p.target_industries.filter(i => i !== value)
        : [...p.target_industries, value],
    }))
  }

  const addLanguage = () => {
    const lang = langInput.trim()
    if (lang && !prefs.languages.includes(lang)) {
      setPrefs(p => ({ ...p, languages: [...p.languages, lang] }))
    }
    setLangInput('')
  }

  const removeLanguage = (lang) => {
    setPrefs(p => ({ ...p, languages: p.languages.filter(l => l !== lang) }))
  }

  const toggleRegion = (value) => {
    setPrefs(p => ({
      ...p,
      target_regions: (p.target_regions || []).includes(value)
        ? (p.target_regions || []).filter(r => r !== value)
        : [...(p.target_regions || []), value],
    }))
  }

  if (loading) return <div className="text-ink-muted text-sm text-center py-16">Loading...</div>

  const u = profile?.user || {}

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="font-display text-3xl font-bold text-ink-primary">Profile</h1>

      <form onSubmit={save} className="space-y-5">
        {/* Personal Info */}
        <div className="card space-y-4">
          <p className="font-display font-semibold text-ink-primary">Personal info</p>
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

        {/* Job Preferences */}
        <div className="card space-y-4">
          <p className="font-display font-semibold text-ink-primary">Job preferences</p>
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

        {/* Auto-apply Settings */}
        <div className="card space-y-4">
          <p className="font-display font-semibold text-ink-primary">Auto-apply settings</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-primary">Auto-apply mode</p>
              <p className="text-xs text-ink-muted">Automatically submit applications above threshold</p>
            </div>
            <button
              type="button"
              onClick={() => setAutoApply(v => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${autoApply ? 'bg-cobalt' : 'bg-surface-600'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoApply ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div>
            <label className="label">Fit threshold: <span className="text-cobalt-light">{fitThreshold}%</span></label>
            <input
              type="range" min={50} max={95} step={5}
              className="w-full accent-cobalt"
              value={fitThreshold}
              onChange={e => setFitThreshold(Number(e.target.value))}
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </form>

      {/* Job Search Preferences (separate save) */}
      <div className="card space-y-5">
        <div>
          <p className="font-display font-semibold text-ink-primary">Job search preferences</p>
          <p className="text-xs text-ink-muted mt-0.5">These preferences improve AI fit scoring accuracy</p>
        </div>

        {/* Work Style */}
        <div>
          <label className="label mb-2">Work style</label>
          <div className="flex flex-wrap gap-2">
            {WORK_STYLES.map(ws => (
              <button
                key={ws.value}
                type="button"
                onClick={() => setPrefs(p => ({ ...p, work_style: ws.value }))}
                className={`px-3 py-1.5 rounded-lg text-sm font-display transition-colors ${
                  prefs.work_style === ws.value
                    ? 'bg-cobalt text-white font-medium'
                    : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink-secondary'
                }`}
              >
                {ws.label}
              </button>
            ))}
          </div>
        </div>

        {/* Experience Level */}
        <div>
          <label className="label mb-2">Experience level</label>
          <div className="flex flex-wrap gap-2">
            {EXPERIENCE_LEVELS.map(lvl => (
              <button
                key={lvl.value}
                type="button"
                onClick={() => setPrefs(p => ({ ...p, experience_level: lvl.value }))}
                className={`px-3 py-1.5 rounded-lg text-sm font-display transition-colors ${
                  prefs.experience_level === lvl.value
                    ? 'bg-cobalt text-white font-medium'
                    : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink-secondary'
                }`}
              >
                {lvl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Deal Breakers */}
        <div>
          <label className="label mb-2">Deal breakers</label>
          <p className="text-xs text-ink-muted mb-2">Jobs matching these criteria will be scored lower</p>
          <div className="space-y-2">
            {DEAL_BREAKER_OPTIONS.map(db => (
              <label key={db.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.deal_breakers.includes(db.value)}
                  onChange={() => toggleDealBreaker(db.value)}
                  className="w-4 h-4 rounded border-surface-600 bg-surface-700 accent-cobalt"
                />
                <span className="text-sm text-ink-secondary">{db.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Target Industries */}
        <div>
          <label className="label mb-2">Target industries</label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_OPTIONS.map(ind => (
              <button
                key={ind}
                type="button"
                onClick={() => toggleIndustry(ind)}
                className={`px-3 py-1.5 rounded-lg text-sm font-display transition-colors ${
                  prefs.target_industries.includes(ind)
                    ? 'bg-cobalt text-white font-medium'
                    : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink-secondary'
                }`}
              >
                {ind}
              </button>
            ))}
          </div>
        </div>

        {/* Target Regions */}
        <div>
          <label className="label mb-2">Target regions <span className="text-ink-muted font-normal text-xs">(to avoid timezone/language issues)</span></label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'americas',        label: '🌎 Americas' },
              { value: 'europe',          label: '🌍 Europe' },
              { value: 'asia_pacific',    label: '🌏 Asia-Pacific' },
              { value: 'africa_me',       label: '🌍 Africa / Middle East' },
              { value: 'remote_any',      label: '🌐 Remote (any region)' },
            ].map(r => (
              <button
                key={r.value}
                type="button"
                onClick={() => toggleRegion(r.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  (prefs.target_regions || []).includes(r.value)
                    ? 'bg-cobalt text-white'
                    : 'bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink-secondary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {(prefs.target_regions || []).length === 0 && (
            <p className="text-xs text-ink-muted mt-1.5">No filter — all regions shown</p>
          )}
        </div>

        {/* Languages */}
        <div>
          <label className="label mb-2">Languages spoken</label>
          <div className="flex flex-wrap gap-2 mb-2">
            {prefs.languages.map(lang => (
              <span key={lang} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm bg-surface-700 text-ink-secondary">
                {lang}
                <button
                  type="button"
                  onClick={() => removeLanguage(lang)}
                  className="text-ink-muted hover:text-signal ml-0.5"
                >
                  x
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className="input flex-1"
              placeholder="Add a language..."
              value={langInput}
              onChange={e => setLangInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLanguage() } }}
            />
            <button
              type="button"
              onClick={addLanguage}
              className="bg-surface-700 text-ink-muted hover:bg-surface-600 hover:text-ink-secondary px-3 py-1.5 rounded-lg text-sm font-display"
            >
              Add
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={savePrefs}
          disabled={savingPrefs}
          className="btn-primary w-full"
        >
          {savingPrefs ? 'Saving...' : 'Save search preferences'}
        </button>
      </div>
    </div>
  )
}
