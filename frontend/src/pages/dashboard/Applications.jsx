import { useEffect, useState } from 'react'
import { applicationsApi } from '../../lib/api'

function BlockerReasonBadge({ reason }) {
  const labels = {
    video_required: '🎥 Video required',
    voice_required: '🎤 Voice required',
    captcha: '🤖 CAPTCHA blocked',
    assessment: '📝 Assessment required',
    external_ats: '🔗 External ATS',
    login_required: '🔒 Login wall',
    other: '❓ Other',
  }
  return <span className="badge badge-amber">{labels[reason] || reason}</span>
}

export default function Applications() {
  const [tab, setTab] = useState('applied')
  const [applications, setApplications] = useState([])
  const [blockers, setBlockers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      applicationsApi.list(),
      applicationsApi.blockers(),
    ]).then(([appRes, blockRes]) => {
      setApplications(appRes.data.applications)
      setBlockers(blockRes.data.blockers)
    }).finally(() => setLoading(false))
  }, [])

  const expired = applications.filter(a => a.status === 'expired')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Applications</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-600">
        {[
          { key: 'applied',  label: `Applied (${applications.length})` },
          { key: 'blockers', label: `Needs You (${blockers.length})` },
          { key: 'expired',  label: `Expired (${expired.length})` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-brand text-white'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-gray-500 text-sm text-center py-8">Loading…</div>}

      {/* Applied */}
      {!loading && tab === 'applied' && (
        <div className="space-y-2">
          {applications.length === 0 && (
            <div className="card text-center py-12 text-gray-600">No applications yet</div>
          )}
          {applications.map(app => (
            <div key={app.id} className="card flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{app.title}</p>
                <p className="text-sm text-gray-400">{app.company} · <span className="capitalize">{app.source}</span></p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`badge ${app.method === 'auto' ? 'badge-green' : 'badge-blue'} capitalize`}>{app.method}</span>
                <span className="text-xs text-gray-500">{new Date(app.applied_at).toLocaleDateString()}</span>
                <a href={app.url} target="_blank" rel="noreferrer" className="text-xs text-brand-light hover:underline">View ↗</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Blockers */}
      {!loading && tab === 'blockers' && (
        <div className="space-y-2">
          {blockers.length === 0 && (
            <div className="card text-center py-12 text-gray-600">No blocked applications</div>
          )}
          {blockers.map(b => (
            <div key={b.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-white">{b.title}</p>
                  <p className="text-sm text-gray-400">{b.company}</p>
                  {b.reason_detail && <p className="text-xs text-gray-500 mt-1">{b.reason_detail}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <BlockerReasonBadge reason={b.reason} />
                  <a href={b.url} target="_blank" rel="noreferrer" className="text-xs text-brand-light hover:underline">Apply manually ↗</a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expired */}
      {!loading && tab === 'expired' && (
        <div className="space-y-2">
          {expired.length === 0 && (
            <div className="card text-center py-12 text-gray-600">No expired jobs</div>
          )}
          {expired.map(app => (
            <div key={app.id} className="card flex items-center gap-4 opacity-60">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white">{app.title}</p>
                <p className="text-sm text-gray-400">{app.company}</p>
              </div>
              <span className="badge badge-gray">Expired</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
