import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { jobsApi, applicationsApi } from '../../lib/api'

const STATUS_TABS = [
  { key: null,           label: 'All' },
  { key: 'scored',       label: 'Scored' },
  { key: 'ready',        label: 'Ready' },
  { key: 'applied',      label: 'Applied' },
  { key: 'needs_manual', label: 'Needs You' },
  { key: 'expired',      label: 'Expired' },
  { key: 'low_fit',      label: 'Low Fit' },
]

function FitBadge({ score }) {
  if (!score) return <span className="badge badge-gray">—</span>
  if (score >= 80) return <span className="badge badge-green">{score}%</span>
  if (score >= 65) return <span className="badge badge-amber">{score}%</span>
  return <span className="badge badge-red">{score}%</span>
}

function StatusBadge({ status }) {
  const map = {
    new: 'badge-gray', scored: 'badge-blue', ready: 'badge-purple',
    applied: 'badge-green', needs_manual: 'badge-amber',
    expired: 'badge-gray', low_fit: 'badge-red',
  }
  return <span className={`badge ${map[status] || 'badge-gray'} capitalize`}>{status?.replace('_', ' ')}</span>
}

export default function JobQueue() {
  const [jobs, setJobs] = useState([])
  const [counts, setCounts] = useState({})
  const [activeStatus, setActiveStatus] = useState(null)
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [applying, setApplying] = useState(false)

  const load = async (status) => {
    setLoading(true)
    try {
      const [jobsRes, countsRes] = await Promise.all([
        jobsApi.list(status ? { status } : {}),
        jobsApi.counts(),
      ])
      setJobs(jobsRes.data.jobs)
      setCounts(countsRes.data.counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(activeStatus) }, [activeStatus])

  const prepareJob = async (job) => {
    setPreparing(true)
    try {
      const { data } = await jobsApi.prepare(job.id)
      toast.success('Resume tailored + cover letter ready!')
      setSelected({ ...job, prepared: data })
      load(activeStatus)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Preparation failed')
    } finally {
      setPreparing(false)
    }
  }

  const applyManual = async (job) => {
    setApplying(true)
    try {
      await applicationsApi.apply(job.id, { method: 'manual' })
      toast.success('Marked as applied!')
      setSelected(null)
      load(activeStatus)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    } finally {
      setApplying(false)
    }
  }

  const autoApply = async (job) => {
    if (!job.prepared) { toast.error('Prepare the job first'); return }
    setApplying(true)
    try {
      await applicationsApi.apply(job.id, {
        method: 'auto',
        auto_apply: true,
        resume_version_id: job.prepared?.resume_version_id,
        cover_letter: job.prepared?.cover_letter,
      })
      toast.success('Auto-apply queued!')
      setSelected(null)
      load(activeStatus)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Job Queue</h1>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeStatus === tab.key
                ? 'bg-brand text-white font-medium'
                : 'text-gray-400 hover:text-white hover:bg-surface-700'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="ml-1.5 text-xs opacity-70">{counts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs table */}
      <div className="space-y-2">
        {loading && <div className="text-gray-500 text-sm text-center py-8">Loading…</div>}
        {!loading && jobs.length === 0 && (
          <div className="card text-center py-12 text-gray-600">
            {activeStatus ? `No jobs with status "${activeStatus}"` : 'Run a search from the Dashboard to populate jobs here'}
          </div>
        )}
        {jobs.map(job => (
          <div
            key={job.id}
            onClick={() => setSelected(s => s?.id === job.id ? null : job)}
            className={`card cursor-pointer transition-all ${selected?.id === job.id ? 'border-brand/60 bg-brand/5' : 'hover:border-surface-500'}`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-white">{job.title}</p>
                  <StatusBadge status={job.status} />
                </div>
                <p className="text-sm text-gray-400 mt-0.5">{job.company} · {job.location}</p>
                {(job.salary_min || job.salary_max) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {job.salary_min && `$${job.salary_min.toLocaleString()}`}
                    {job.salary_min && job.salary_max && ' – '}
                    {job.salary_max && `$${job.salary_max.toLocaleString()}`}
                    {job.salary_type && ` / ${job.salary_type}`}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <FitBadge score={job.fit_score} />
                {job.posted_at && (
                  <span className="text-xs text-gray-600">{new Date(job.posted_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.id === job.id && (
              <div className="mt-4 pt-4 border-t border-surface-600 space-y-4">
                {/* Fit reasoning */}
                {job.fit_reasoning && (
                  <div className="bg-surface-900 rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fit Analysis</p>
                    <p className="text-sm text-gray-300">{job.fit_reasoning.reasoning}</p>
                    {job.fit_reasoning.highlights?.length > 0 && (
                      <div>
                        <p className="text-xs text-success font-medium mb-1">Strengths</p>
                        <ul className="text-xs text-gray-400 space-y-0.5 list-disc list-inside">
                          {job.fit_reasoning.highlights.map((h, i) => <li key={i}>{h}</li>)}
                        </ul>
                      </div>
                    )}
                    {job.fit_reasoning.gaps?.length > 0 && (
                      <div>
                        <p className="text-xs text-warning font-medium mb-1">Gaps</p>
                        <ul className="text-xs text-gray-400 space-y-0.5 list-disc list-inside">
                          {job.fit_reasoning.gaps.map((g, i) => <li key={i}>{g}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Prepared materials */}
                {selected.prepared && (
                  <div className="space-y-3">
                    <div className="bg-surface-900 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tailored Resume (preview)</p>
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                        {selected.prepared.tailored_resume?.slice(0, 800)}…
                      </pre>
                    </div>
                    {selected.prepared.cover_letter && (
                      <div className="bg-surface-900 rounded-lg p-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Cover Letter</p>
                        <p className="text-xs text-gray-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {selected.prepared.cover_letter}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                  <a href={job.url} target="_blank" rel="noreferrer" className="btn-ghost text-xs">
                    View posting ↗
                  </a>
                  {!['applied', 'needs_manual', 'expired'].includes(job.status) && (
                    <>
                      {!selected.prepared && (
                        <button onClick={() => prepareJob(job)} disabled={preparing} className="btn-primary text-xs">
                          {preparing ? 'Preparing…' : 'Prepare (tailor + cover letter)'}
                        </button>
                      )}
                      {selected.prepared && (
                        <button onClick={() => autoApply(job)} disabled={applying} className="btn-primary text-xs">
                          {applying ? 'Queuing…' : 'Auto-apply'}
                        </button>
                      )}
                      <button onClick={() => applyManual(job)} disabled={applying} className="btn-ghost text-xs">
                        Mark as applied (manual)
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
