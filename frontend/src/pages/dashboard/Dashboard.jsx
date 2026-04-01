import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { dashboardApi, jobsApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { toast } from 'react-toastify'

function StatCard({ label, value, color = 'text-white', sub }) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600">{sub}</p>}
    </div>
  )
}

function FitPill({ score }) {
  const color = score >= 80 ? 'bg-success/15 text-success' : score >= 65 ? 'bg-warning/15 text-warning' : 'bg-danger/15 text-danger'
  return <span className={`fit-pill ${color}`}>{score}%</span>
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    dashboardApi.summary().then(r => setData(r.data)).catch(() => {})
  }, [])

  const triggerSearch = async (e) => {
    e.preventDefault()
    setSearching(true)
    try {
      const { data: r } = await jobsApi.search({ keywords: searchQuery || undefined })
      toast.success(r.message)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Search failed')
    } finally {
      setSearching(false)
    }
  }

  const counts = data?.counts || {}

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Hey {user?.first_name} — here's your hunt status</p>
        </div>
      </div>

      {/* Quick search */}
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

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Applied" value={counts.applied || 0} color="text-success" />
        <StatCard label="Ready to apply" value={(counts.scored || 0) + (counts.ready || 0)} color="text-brand-light" />
        <StatCard label="Needs you" value={counts.needs_manual || 0} color="text-warning" />
        <StatCard label="Expired / gone" value={counts.expired || 0} color="text-gray-500" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top jobs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">Top matches</h2>
            <Link to="/jobs" className="text-xs text-brand-light hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {(data?.top_jobs?.length ? data.top_jobs : []).map(job => (
              <div key={job.id} className="card flex items-center gap-3 hover:border-brand/40 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{job.title}</p>
                  <p className="text-xs text-gray-500 truncate">{job.company} · {job.location}</p>
                </div>
                <FitPill score={job.fit_score} />
              </div>
            ))}
            {!data?.top_jobs?.length && (
              <div className="card text-center py-8 text-gray-600 text-sm">
                Run a job search to see matches here
              </div>
            )}
          </div>
        </div>

        {/* Recent blockers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white">Needs manual attention</h2>
            <Link to="/applications" className="text-xs text-brand-light hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {(data?.recent_blockers?.length ? data.recent_blockers : []).map(b => (
              <div key={b.id} className="card flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white text-sm truncate">{b.title}</p>
                  <p className="text-xs text-gray-500">{b.company}</p>
                </div>
                <span className="badge badge-amber capitalize">{b.reason?.replace(/_/g, ' ')}</span>
              </div>
            ))}
            {!data?.recent_blockers?.length && (
              <div className="card text-center py-8 text-gray-600 text-sm">
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
            <h2 className="font-semibold text-white">Recent applications</h2>
            <Link to="/applications" className="text-xs text-brand-light hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-surface-600">
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Company</th>
                  <th className="pb-2 font-medium">Fit</th>
                  <th className="pb-2 font-medium">Method</th>
                  <th className="pb-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-600">
                {data.recent_applications.map(app => (
                  <tr key={app.id} className="text-gray-300">
                    <td className="py-2.5 font-medium text-white">{app.title}</td>
                    <td className="py-2.5 text-gray-400">{app.company}</td>
                    <td className="py-2.5"><FitPill score={app.fit_score} /></td>
                    <td className="py-2.5">
                      <span className={`badge ${app.method === 'auto' ? 'badge-green' : 'badge-blue'}`}>
                        {app.method}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-500">{new Date(app.applied_at).toLocaleDateString()}</td>
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
