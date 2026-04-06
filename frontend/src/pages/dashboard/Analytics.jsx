import { useEffect, useState } from 'react'
import { dashboardApi } from '../../lib/api'

const STATUS_COLORS = {
  new: 'bg-gray-500',
  scored: 'bg-blue-500',
  ready: 'bg-purple-500',
  applied: 'bg-green-500',
  needs_manual: 'bg-amber-500',
  flagged: 'bg-red-500',
  low_fit: 'bg-red-400',
  expired: 'bg-gray-400',
}

export default function Analytics() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    dashboardApi.analytics()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load analytics'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-500 text-sm text-center py-16">Loading analytics...</div>
  if (error) return <div className="card text-center py-12 text-red-400">{error}</div>
  if (!data) return null

  const totalJobs = (data.status_breakdown || []).reduce((sum, s) => sum + s.count, 0)
  const scoreDistribution = data.score_distribution || {}
  const maxScoreCount = Math.max(...Object.values(scoreDistribution), 1)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Total Jobs Found" value={totalJobs} />
        <SummaryCard label="Avg Fit Score" value={data.score_stats?.average ? `${data.score_stats.average}%` : '--'} />
        <SummaryCard label="Applications" value={data.applications_total} />
        <SummaryCard label="Highest Score" value={data.score_stats?.highest ? `${data.score_stats.highest}%` : '--'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score distribution */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Fit Score Distribution</h2>
          <div className="flex items-end gap-3 h-36">
            {Object.entries(scoreDistribution).map(([range, count]) => (
              <div key={range} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs text-gray-400 font-medium">{count}</span>
                <div
                  className="w-full bg-brand rounded-t transition-all"
                  style={{ height: `${Math.max((count / maxScoreCount) * 100, 4)}%` }}
                />
                <span className="text-xs text-gray-500">{range}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Source breakdown */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Jobs by Source</h2>
          <div className="space-y-3">
            {(data.source_breakdown || []).length === 0 && (
              <p className="text-sm text-gray-600">No data yet</p>
            )}
            {(data.source_breakdown || []).map(s => {
              const maxSource = Math.max(...data.source_breakdown.map(x => x.count), 1)
              return (
                <div key={s.source} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-300 capitalize">{s.source || 'unknown'}</span>
                    <span className="text-gray-400">{s.count}</span>
                  </div>
                  <div className="w-full bg-surface-700 rounded-full h-2">
                    <div
                      className="bg-brand-light h-2 rounded-full transition-all"
                      style={{ width: `${(s.count / maxSource) * 100}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Status breakdown */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Jobs by Status</h2>
          <div className="flex flex-wrap gap-2">
            {(data.status_breakdown || []).length === 0 && (
              <p className="text-sm text-gray-600">No data yet</p>
            )}
            {(data.status_breakdown || []).map(s => (
              <div key={s.status} className="flex items-center gap-2 bg-surface-700 rounded-lg px-3 py-2">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s.status] || 'bg-gray-500'}`} />
                <span className="text-sm text-gray-300 capitalize">{s.status?.replace('_', ' ')}</span>
                <span className="text-sm font-semibold text-white">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly activity */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Weekly Activity (Last 4 Weeks)</h2>
          <div className="space-y-2">
            {(data.weekly_activity || []).length === 0 && (
              <p className="text-sm text-gray-600">No activity in the last 4 weeks</p>
            )}
            {(data.weekly_activity || []).map(w => (
              <div key={w.week} className="flex items-center justify-between bg-surface-700 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-300">{w.week}</span>
                <span className="text-sm font-semibold text-white">{w.count} jobs</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top companies */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">Top Companies</h2>
        {(data.top_companies || []).length === 0 ? (
          <p className="text-sm text-gray-600">No data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="text-left text-gray-400 font-medium py-2 pr-4">Company</th>
                  <th className="text-right text-gray-400 font-medium py-2 px-4">Jobs</th>
                  <th className="text-right text-gray-400 font-medium py-2 pl-4">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {data.top_companies.map(c => (
                  <tr key={c.company} className="border-b border-surface-700 last:border-0">
                    <td className="text-white py-2.5 pr-4">{c.company}</td>
                    <td className="text-gray-300 text-right py-2.5 px-4">{c.count}</td>
                    <td className="text-gray-300 text-right py-2.5 pl-4">{c.avg_score ? `${Math.round(c.avg_score)}%` : '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value }) {
  return (
    <div className="card">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  )
}
