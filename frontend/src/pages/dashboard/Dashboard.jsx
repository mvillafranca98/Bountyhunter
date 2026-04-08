import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi, jobsApi, alertsApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { toast } from 'react-toastify'

function StatCard({ label, value, color = 'text-ink-primary', sub }) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="section-label">{label}</p>
      <p className={`font-display text-4xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-ink-muted">{sub}</p>}
    </div>
  )
}

function FitPill({ score }) {
  if (score === null || score === undefined) {
    return <span className="fit-pill font-display font-bold bg-surface-800 text-ink-muted">Scoring…</span>
  }
  const color =
    score >= 80
      ? 'bg-success/15 text-success'
      : score >= 65
      ? 'bg-warning/15 text-warning'
      : 'bg-signal/15 text-signal'
  return <span className={`fit-pill font-display font-bold ${color}`}>{score}%</span>
}

function WorkTypeBadge({ workType }) {
  const map = {
    remote:  { label: '🌐 Remote',  cls: 'badge-cobalt' },
    hybrid:  { label: '🔄 Hybrid',  cls: 'badge-violet' },
    onsite:  { label: '🏢 On-site', cls: 'badge-amber' },
    'on-site': { label: '🏢 On-site', cls: 'badge-amber' },
  }
  const key = (workType || '').toLowerCase().replace(/\s+/g, '')
  const entry = map[key]
  if (!entry) return <span className="badge badge-gray">❓ Unknown</span>
  return <span className={`badge ${entry.cls}`}>{entry.label}</span>
}

function SalaryDisplay({ job }) {
  if (typeof job.salary === 'string' && job.salary.trim()) {
    return <span className="text-xs text-ink-muted">{job.salary}</span>
  }
  if (job.salary_min != null && job.salary_max != null) {
    const unit = job.salary_type === 'monthly' ? '/ mo' : '/ yr'
    const fmt = (n) => `$${Number(n).toLocaleString()}`
    return <span className="text-xs text-ink-muted">{fmt(job.salary_min)} – {fmt(job.salary_max)} {unit}</span>
  }
  return null
}

function SearchResultCard({ job }) {
  const fitScore = job.fit_score ?? null
  const fitCls =
    fitScore === null
      ? 'badge badge-gray'
      : fitScore >= 80
      ? 'badge badge-green'
      : fitScore >= 65
      ? 'badge badge-amber'
      : 'badge badge-red'

  return (
    <div className="card-hover flex flex-col gap-2 hover:border-cobalt/40 transition-all">
      {/* Top row: badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={fitCls}>
          {fitScore === null ? 'Scoring…' : `${fitScore}%`}
        </span>
        <WorkTypeBadge workType={job.work_type} />
        {job.requires_subscription === 1 && (
          <span className="badge badge-violet">💳 Subscription</span>
        )}
      </div>

      {/* Title + company */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink-primary text-sm leading-snug truncate">{job.title}</p>
        <p className="text-ink-muted text-sm truncate">
          {job.company}{job.location ? ` · ${job.location}` : ''}
        </p>
        <SalaryDisplay job={job} />
      </div>

      {/* Link */}
      {job.url && (
        <a
          href={job.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cobalt-light hover:underline self-start"
        >
          View →
        </a>
      )}
    </div>
  )
}

const MAX_SUBSCRIPTION_JOBS = 2
const MAX_RESULTS_SHOWN = 10

function filterAndSliceResults(jobs) {
  let subCount = 0
  const filtered = []
  for (const job of jobs) {
    if (job.requires_subscription === 1) {
      if (subCount >= MAX_SUBSCRIPTION_JOBS) continue
      subCount++
    }
    filtered.push(job)
    if (filtered.length >= MAX_RESULTS_SHOWN) break
  }
  return filtered
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [searching, setSearching] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [findingReal, setFindingReal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [alertKeywords, setAlertKeywords] = useState('')
  const [creatingAlert, setCreatingAlert] = useState(false)
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    dashboardApi.summary().then(r => setData(r.data)).catch(() => {})
    loadAlerts()
  }, [])

  const loadAlerts = () => {
    alertsApi.list().then(r => setAlerts(r.data.alerts || [])).catch(() => {})
  }

  const clearResults = () => setSearchResults([])

  const createAlert = async () => {
    if (!alertKeywords.trim()) return
    setCreatingAlert(true)
    try {
      const { data: r } = await alertsApi.create({ keywords: alertKeywords.trim() })
      toast.success(r.message || 'Alert created!')
      setAlertKeywords('')
      loadAlerts()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create alert')
    } finally {
      setCreatingAlert(false)
    }
  }

  const toggleAlert = async (id) => {
    try {
      await alertsApi.toggle(id)
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, is_active: a.is_active ? 0 : 1 } : a))
    } catch {
      toast.error('Failed to update alert')
    }
  }

  const deleteAlert = async (id) => {
    try {
      await alertsApi.delete(id)
      setAlerts(prev => prev.filter(a => a.id !== id))
      toast.info('Alert deleted')
    } catch {
      toast.error('Failed to delete alert')
    }
  }

  const triggerSearch = async (e) => {
    e.preventDefault()
    setSearching(true)
    try {
      const { data: r } = await jobsApi.realSearch({ keywords: searchQuery })
      toast.success(r.message || 'Search complete!')
      const jobs = r.jobs || []
      setSearchResults(filterAndSliceResults(jobs))
      dashboardApi.summary().then(res => setData(res.data)).catch(() => {})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const seedJobs = async () => {
    setSeeding(true)
    try {
      const { data: r } = await jobsApi.seed()
      toast.success(r.message || 'Sample jobs loaded!')
      dashboardApi.summary().then(r => setData(r.data)).catch(() => {})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load sample jobs')
    } finally {
      setSeeding(false)
    }
  }

  const findRealJobs = async () => {
    setFindingReal(true)
    try {
      const { data: r } = await jobsApi.realSearch()
      toast.success(r.message || 'Real jobs loaded!')
      if (r.sources) {
        const failedSources = r.sources.filter(s => s.status === 'error')
        if (failedSources.length > 0) {
          toast.warn(`Some sources unavailable: ${failedSources.map(s => s.name).join(', ')}`, { autoClose: 4000 })
        }
      }
      const jobs = r.jobs || []
      setSearchResults(filterAndSliceResults(jobs))
      dashboardApi.summary().then(res => setData(res.data)).catch(() => {})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to find real jobs')
    } finally {
      setFindingReal(false)
    }
  }

  const importJobUrl = async () => {
    if (!importUrl.trim()) return
    setImportingUrl(true)
    try {
      const { data } = await jobsApi.importUrl({ url: importUrl.trim() })
      toast.success(data.message || 'Job imported!')
      setImportUrl('')
      dashboardApi.summary().then(r => setData(r.data)).catch(() => {})
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to import job from URL')
    } finally {
      setImportingUrl(false)
    }
  }

  const flagJob = async (jobId) => {
    try {
      await jobsApi.flag(jobId)
      setData(prev => ({
        ...prev,
        top_jobs: (prev?.top_jobs || []).filter(j => j.id !== jobId),
      }))
      toast.info('Job dismissed')
    } catch {
      toast.error('Failed to dismiss job')
    }
  }

  const counts = data?.counts || {}

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-primary">Dashboard</h1>
          <p className="text-ink-secondary text-sm mt-1 flex items-center gap-1.5">
            <span className="glow-dot" />
            Hey {user?.first_name} — here's your hunt status
          </p>
        </div>
      </div>

      {/* Quick search */}
      <div className="space-y-2">
        <form onSubmit={triggerSearch} className="flex gap-3">
          <input
            type="text"
            className="input flex-1"
            placeholder="Search keywords (leave blank to use target roles)…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          <button type="submit" disabled={searching} className="btn-primary px-6 whitespace-nowrap">
            {searching ? 'Searching…' : 'Hunt jobs'}
          </button>
        </form>
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-surface-600" />
          <span className="text-xs text-ink-muted">or</span>
          <div className="h-px flex-1 bg-surface-600" />
        </div>
        <div className="flex gap-3">
          <button
            onClick={seedJobs}
            disabled={seeding || findingReal}
            className="flex-1 btn-ghost text-sm flex items-center justify-center gap-2 border border-surface-600 hover:border-cobalt"
          >
            {seeding ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-cobalt border-t-transparent rounded-full animate-spin" />
                Generating sample jobs… (~30s)
              </>
            ) : (
              '✨ Load 5 AI-scored sample jobs'
            )}
          </button>
          <button
            onClick={findRealJobs}
            disabled={findingReal || seeding}
            className="flex-1 btn-ghost text-sm flex items-center justify-center gap-2 border border-surface-600 hover:border-cobalt"
          >
            {findingReal ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-cobalt border-t-transparent rounded-full animate-spin" />
                Finding & scoring real jobs… (~30s)
              </>
            ) : (
              '🔍 Find real jobs'
            )}
          </button>
        </div>
      </div>

      {/* Search results panel */}
      {searchResults.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-semibold text-ink-primary">Latest search results</h2>
            <button onClick={clearResults} className="btn-ghost text-xs px-3 py-1 border border-surface-600 hover:border-cobalt">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {searchResults.map((job, idx) => (
              <SearchResultCard key={job.id ?? idx} job={job} />
            ))}
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Applied" value={counts.applied || 0} color="text-success" />
        <StatCard label="Ready to apply" value={(counts.scored || 0) + (counts.ready || 0)} color="text-cobalt-light" />
        <StatCard label="Needs you" value={counts.needs_manual || 0} color="text-warning" />
        <StatCard label="Expired / gone" value={counts.expired || 0} color="text-ink-muted" />
      </div>

      {/* Import job by URL */}
      <div className="flex gap-3">
        <input
          type="url"
          className="input flex-1"
          placeholder="Paste a job URL from any site (LinkedIn, Indeed, Wellfound…)"
          value={importUrl}
          onChange={e => setImportUrl(e.target.value)}
        />
        <button
          onClick={importJobUrl}
          disabled={importingUrl || !importUrl.trim()}
          className="btn-primary px-6 whitespace-nowrap"
        >
          {importingUrl ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
              Importing… (~15s)
            </>
          ) : (
            'Import job'
          )}
        </button>
      </div>

      {/* Job Alerts */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold text-ink-primary">Job Alerts</h3>
          <span className="text-xs text-ink-muted">Runs daily at 8 AM UTC</span>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            className="input text-sm flex-1"
            placeholder="e.g. AI developer remote"
            value={alertKeywords}
            onChange={e => setAlertKeywords(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAlert()}
          />
          <button
            onClick={createAlert}
            disabled={!alertKeywords.trim() || creatingAlert}
            className="btn-primary text-sm px-3"
          >
            {creatingAlert ? 'Saving...' : 'Save alert'}
          </button>
        </div>

        {alerts.length === 0 ? (
          <p className="text-xs text-ink-muted">No alerts yet. Save a search to get daily job updates.</p>
        ) : (
          <div className="space-y-2">
            {alerts.map(a => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <div className="flex-1 min-w-0">
                  <span className={a.is_active ? 'text-ink-secondary' : 'text-ink-muted line-through'}>{a.keywords}</span>
                  {a.last_run_at && (
                    <span className="text-xs text-ink-muted ml-2">Last run: {new Date(a.last_run_at).toLocaleDateString()}</span>
                  )}
                </div>
                <div className="flex gap-2 ml-3 shrink-0">
                  <button onClick={() => toggleAlert(a.id)} className="text-xs text-ink-muted hover:text-ink-primary">
                    {a.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button onClick={() => deleteAlert(a.id)} className="text-xs text-signal hover:text-signal-light">
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink-primary">Top matches</h2>
            <Link to="/dashboard/jobs" className="text-xs text-cobalt-light hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {(data?.top_jobs?.length ? data.top_jobs : []).map(job => (
              <div key={job.id} className="card-hover flex items-center gap-3 hover:border-cobalt/40 transition-all group">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink-primary text-sm truncate">{job.title}</p>
                  <p className="text-xs text-ink-muted truncate">
                    {job.company} · {job.location}
                    {job.source && <span className="ml-1 text-ink-muted">({job.source})</span>}
                  </p>
                </div>
                <FitPill score={job.fit_score} />
                <button
                  onClick={() => flagJob(job.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-ink-muted hover:text-signal rounded"
                  title="Dismiss job"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
            {!data?.top_jobs?.length && (
              <div className="card text-center py-8 text-ink-muted text-sm">
                Run a job search to see matches here
              </div>
            )}
          </div>
        </div>

        {/* Recent blockers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink-primary">Needs manual attention</h2>
            <Link to="/dashboard/applications" className="text-xs text-cobalt-light hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {(data?.recent_blockers?.length ? data.recent_blockers : []).map(b => (
              <div key={b.id} className="card flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink-primary text-sm truncate">{b.title}</p>
                  <p className="text-xs text-ink-muted">{b.company}</p>
                </div>
                <span className="badge badge-amber capitalize">{b.reason?.replace(/_/g, ' ')}</span>
              </div>
            ))}
            {!data?.recent_blockers?.length && (
              <div className="card text-center py-8 text-ink-muted text-sm">
                No blockers yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent applications */}
      {data?.recent_applications?.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink-primary">Recent applications</h2>
            <Link to="/dashboard/applications" className="text-xs text-cobalt-light hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-surface-600">
                  <th className="pb-2 font-medium text-xs text-ink-muted uppercase tracking-wider">Role</th>
                  <th className="pb-2 font-medium text-xs text-ink-muted uppercase tracking-wider">Company</th>
                  <th className="pb-2 font-medium text-xs text-ink-muted uppercase tracking-wider">Fit</th>
                  <th className="pb-2 font-medium text-xs text-ink-muted uppercase tracking-wider">Method</th>
                  <th className="pb-2 font-medium text-xs text-ink-muted uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-600">
                {data.recent_applications.map(app => (
                  <tr key={app.id} className="text-ink-secondary">
                    <td className="py-2.5 font-medium text-ink-primary">{app.title}</td>
                    <td className="py-2.5 text-ink-muted">{app.company}</td>
                    <td className="py-2.5"><FitPill score={app.fit_score} /></td>
                    <td className="py-2.5">
                      <span className={`badge ${app.method === 'auto' ? 'badge-green' : 'badge-cobalt'}`}>
                        {app.method}
                      </span>
                    </td>
                    <td className="py-2.5 text-ink-muted">{new Date(app.applied_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
