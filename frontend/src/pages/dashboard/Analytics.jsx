import { useEffect, useState } from 'react'
import { dashboardApi } from '../../lib/api'

const STATUS_COLORS = {
  new: 'bg-surface-500',
  scored: 'bg-cobalt',
  ready: 'bg-violet',
  applied: 'bg-success',
  needs_manual: 'bg-warning',
  flagged: 'bg-signal',
  low_fit: 'bg-danger',
  expired: 'bg-surface-400',
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

  if (loading) return <div className="text-ink-muted text-sm text-center py-16">Loading analytics...</div>
  if (error) return <div className="card text-center py-12 text-signal">{error}</div>
  if (!data) return null

  const totalJobs = (data.status_breakdown || []).reduce((sum, s) => sum + s.count, 0)
  const scoreDistribution = data.score_distribution || {}
  const maxScoreCount = Math.max(...Object.values(scoreDistribution), 1)

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-ink-primary">Analytics</h1>

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
          <h2 className="section-label mb-1">Fit Score Distribution</h2>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-success inline-block" />Great (80+)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning inline-block" />Good (60–79)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brass inline-block" />Fair (40–59)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-signal inline-block" />Low (&lt;40)</span>
          </div>

          {(() => {
            const totalScoreCount = Object.values(scoreDistribution).reduce((a, b) => a + b, 0)
            function barColor(range) {
              const lower = parseInt(range.split('-')[0], 10)
              if (lower >= 80) return 'bg-success'
              if (lower >= 60) return 'bg-warning'
              if (lower >= 40) return 'bg-brass'
              return 'bg-signal'
            }
            return (
              <div className="flex items-end gap-3 h-52">
                {Object.entries(scoreDistribution).map(([range, count]) => {
                  const pct = totalScoreCount > 0 ? Math.round((count / totalScoreCount) * 100) : 0
                  return (
                    <div key={range} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-xs text-ink-secondary font-semibold">{count}</span>
                      <div className="w-full flex flex-col justify-end" style={{ height: '160px' }}>
                        <div
                          className={`w-full ${barColor(range)} rounded-t opacity-90 transition-all duration-500`}
                          style={{ height: `${Math.max((count / maxScoreCount) * 100, 4)}%` }}
                        />
                      </div>
                      <span className="text-xs text-ink-muted leading-tight">{range}%</span>
                      <span className="text-[10px] text-ink-muted opacity-70">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        {/* Source breakdown */}
        <div className="card">
          <h2 className="section-label mb-4">Jobs by Source</h2>
          <div className="space-y-3">
            {(data.source_breakdown || []).length === 0 && (
              <p className="text-sm text-ink-muted">No data yet</p>
            )}
            {(data.source_breakdown || []).map(s => {
              const maxSource = Math.max(...data.source_breakdown.map(x => x.count), 1)
              return (
                <div key={s.source} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-sm text-ink-secondary capitalize">{s.source || 'unknown'}</span>
                    <span className="text-sm text-ink-muted">{s.count}</span>
                  </div>
                  <div className="w-full bg-surface-700 rounded-full h-2">
                    <div
                      className="bg-cobalt-light h-2 rounded-full transition-all"
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
          <h2 className="section-label mb-4">Jobs by Status</h2>
          <div className="flex flex-wrap gap-2">
            {(data.status_breakdown || []).length === 0 && (
              <p className="text-sm text-ink-muted">No data yet</p>
            )}
            {(data.status_breakdown || []).map(s => (
              <div key={s.status} className="bg-surface-700 rounded-lg px-3 py-2 flex items-center gap-2">
                <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[s.status] || 'bg-surface-500'}`} />
                <span className="text-sm text-ink-secondary capitalize">{s.status?.replace('_', ' ')}</span>
                <span className="text-sm font-semibold text-ink-primary">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly activity */}
        <div className="card">
          <h2 className="section-label mb-4">Weekly Activity (Last 4 Weeks)</h2>
          <div className="space-y-2">
            {(data.weekly_activity || []).length === 0 && (
              <p className="text-sm text-ink-muted">No activity in the last 4 weeks</p>
            )}
            {(data.weekly_activity || []).map(w => (
              <div key={w.week} className="bg-surface-700 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-sm text-ink-secondary">{w.week}</span>
                <span className="text-sm font-semibold text-ink-primary">{w.count} jobs</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top companies */}
      <div className="card">
        <h2 className="section-label mb-4">Top Companies</h2>
        {(data.top_companies || []).length === 0 ? (
          <p className="text-sm text-ink-muted">No data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-600">
                  <th className="text-left text-xs text-ink-muted font-medium uppercase tracking-wider py-2 pr-4">Company</th>
                  <th className="text-right text-xs text-ink-muted font-medium uppercase tracking-wider py-2 px-4">Jobs</th>
                  <th className="text-right text-xs text-ink-muted font-medium uppercase tracking-wider py-2 pl-4">Avg Score</th>
                </tr>
              </thead>
              <tbody>
                {data.top_companies.map(c => (
                  <tr key={c.company} className="border-b border-surface-700 last:border-0">
                    <td className="text-ink-primary py-2.5 pr-4">{c.company}</td>
                    <td className="text-ink-secondary text-right py-2.5 px-4">{c.count}</td>
                    <td className="text-ink-secondary text-right py-2.5 pl-4">{c.avg_score ? `${Math.round(c.avg_score)}%` : '--'}</td>
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
      <div className="border-l-2 border-cobalt pl-3">
        <p className="section-label">{label}</p>
        <p className="font-display text-3xl font-bold text-ink-primary mt-1">{value}</p>
      </div>
    </div>
  )
}
