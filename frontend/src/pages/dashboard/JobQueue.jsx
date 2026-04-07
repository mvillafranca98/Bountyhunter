import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { jobsApi, applicationsApi } from '../../lib/api'

const STATUS_TABS = [
  { key: null,           label: 'All' },
  { key: 'scored',       label: 'Scored' },
  { key: 'ready',        label: 'Ready' },
  { key: 'applied',      label: 'Applied' },
  { key: 'needs_manual', label: 'Needs You' },
  { key: 'low_fit',      label: 'Low Fit' },
  { key: 'flagged',      label: 'Flagged' },
  { key: 'expired',      label: 'Expired' },
]

function FitBadge({ score }) {
  if (!score) return <span className="badge badge-gray">—</span>
  if (score >= 80) return <span className="badge badge-green">{score}%</span>
  if (score >= 65) return <span className="badge badge-amber">{score}%</span>
  return <span className="badge badge-red">{score}%</span>
}

function StatusBadge({ status }) {
  const map = {
    new: 'badge-gray', scored: 'badge-cobalt', ready: 'badge-violet',
    applied: 'badge-green', needs_manual: 'badge-amber',
    expired: 'badge-gray', low_fit: 'badge-red', flagged: 'badge-red',
  }
  return <span className={`badge ${map[status] || 'badge-gray'} capitalize`}>{status?.replace('_', ' ')}</span>
}

export default function JobQueue() {
  const [jobs, setJobs] = useState([])
  const [counts, setCounts] = useState({})
  const [activeStatus, setActiveStatus] = useState(null)
  const [sortBy, setSortBy] = useState('newest')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [notes, setNotes] = useState([])
  const [timeline, setTimeline] = useState([])
  const [noteText, setNoteText] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)

  const load = async (status, sort) => {
    setLoading(true)
    try {
      const params = { sort }
      if (status) params.status = status
      const [jobsRes, countsRes] = await Promise.all([
        jobsApi.list(params),
        jobsApi.counts(),
      ])
      setJobs(jobsRes.data.jobs)
      setCounts(countsRes.data.counts)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(activeStatus, sortBy) }, [activeStatus, sortBy])

  // Load notes + timeline when a job is selected
  useEffect(() => {
    if (!selected) { setNotes([]); setTimeline([]); return }
    setNotesLoading(true)
    Promise.all([
      jobsApi.getNotes(selected.id),
      jobsApi.getTimeline(selected.id),
    ]).then(([notesRes, timelineRes]) => {
      setNotes(notesRes.data.notes || [])
      setTimeline(timelineRes.data.timeline || [])
    }).catch(() => {}).finally(() => setNotesLoading(false))
  }, [selected?.id])

  const addNote = async () => {
    if (!noteText.trim() || !selected) return
    try {
      const { data } = await jobsApi.addNote(selected.id, noteText)
      setNotes(prev => [data.note, ...prev])
      setNoteText('')
      toast.success('Note added')
    } catch { toast.error('Failed to add note') }
  }

  const deleteNote = async (noteId) => {
    try {
      await jobsApi.deleteNote(selected.id, noteId)
      setNotes(prev => prev.filter(n => n.id !== noteId))
    } catch { toast.error('Failed to delete note') }
  }

  const prepareJob = async (job) => {
    setPreparing(true)
    try {
      const { data } = await jobsApi.prepare(job.id)
      toast.success('Resume tailored + cover letter ready!')
      setSelected({ ...job, prepared: data })
      load(activeStatus, sortBy)
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
      load(activeStatus, sortBy)
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
      load(activeStatus, sortBy)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    } finally {
      setApplying(false)
    }
  }

  const downloadDocx = async (jobId) => {
    setDownloading(true)
    try {
      const { data, headers } = await jobsApi.downloadResume(jobId)
      const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const disposition = headers['content-disposition'] || ''
      a.download = disposition.match(/filename="(.+)"/)?.[1] || 'Resume.docx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to download resume')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl font-bold text-ink-primary">Job Queue</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-ink-muted">Sort by:</span>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input text-sm py-1.5 w-auto"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="score">Highest score</option>
          </select>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 flex-wrap overflow-x-auto pb-1">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveStatus(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeStatus === tab.key
                ? 'bg-cobalt text-white font-medium font-display'
                : 'text-ink-muted hover:text-ink-primary hover:bg-surface-800'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="text-xs opacity-60 ml-1.5">{counts[tab.key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      <div className="space-y-2">
        {loading && (
          <div className="text-ink-muted text-sm text-center py-8">Loading…</div>
        )}
        {!loading && jobs.length === 0 && (
          <div className="card text-center py-16 text-ink-muted">
            {activeStatus
              ? `No jobs with status "${activeStatus}"`
              : 'Run a search from the Dashboard to populate jobs here'}
          </div>
        )}
        {jobs.map(job => (
          <div
            key={job.id}
            onClick={() => setSelected(s => s?.id === job.id ? null : job)}
            className={`card cursor-pointer transition-all ${
              selected?.id === job.id
                ? 'border-cobalt/60 bg-cobalt/5'
                : 'hover:border-surface-500'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-ink-primary">{job.title}</p>
                  <StatusBadge status={job.status} />
                </div>
                <p className="text-sm text-ink-secondary mt-0.5">{job.company} · {job.location}</p>
                {(job.salary_min || job.salary_max) && (
                  <p className="text-xs text-ink-muted mt-1">
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
                  <span className="text-xs text-ink-muted">{new Date(job.posted_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.id === job.id && (
              <div className="mt-4 pt-4 border-t border-surface-600 space-y-4">
                {/* Fit reasoning */}
                {job.fit_reasoning && (
                  <div className="bg-surface-900 rounded-lg p-3 space-y-2">
                    <p className="section-label">Fit Analysis</p>
                    <p className="text-sm text-ink-secondary">{job.fit_reasoning.reasoning}</p>
                    {job.fit_reasoning.highlights?.length > 0 && (
                      <div>
                        <p className="text-xs text-success font-medium mb-1">Strengths</p>
                        <ul className="text-xs text-ink-muted space-y-0.5 list-disc list-inside">
                          {job.fit_reasoning.highlights.map((h, i) => <li key={i}>{h}</li>)}
                        </ul>
                      </div>
                    )}
                    {job.fit_reasoning.gaps?.length > 0 && (
                      <div>
                        <p className="text-xs text-warning font-medium mb-1">Gaps</p>
                        <ul className="text-xs text-ink-muted space-y-0.5 list-disc list-inside">
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
                      <div className="flex items-center justify-between mb-2">
                        <p className="section-label">Tailored Resume (preview)</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadDocx(job.id) }}
                          disabled={downloading}
                          className="btn-ghost text-xs flex items-center gap-1"
                        >
                          {downloading ? 'Downloading...' : 'Download .docx'}
                        </button>
                      </div>
                      <pre className="text-xs text-ink-secondary whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                        {selected.prepared.tailored_resume?.slice(0, 800)}…
                      </pre>
                    </div>
                    {selected.prepared.cover_letter && (
                      <div className="bg-surface-900 rounded-lg p-3">
                        <p className="section-label mb-2">Cover Letter</p>
                        <p className="text-xs text-ink-secondary whitespace-pre-wrap max-h-40 overflow-y-auto">
                          {selected.prepared.cover_letter}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                <div className="bg-surface-900 rounded-lg p-3 space-y-3" onClick={e => e.stopPropagation()}>
                  <p className="section-label">Notes</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addNote()}
                      placeholder="Add a note..."
                      className="input text-sm flex-1"
                    />
                    <button onClick={addNote} disabled={!noteText.trim()} className="btn-primary text-xs px-3">Add</button>
                  </div>
                  {notesLoading && <p className="text-xs text-ink-muted">Loading...</p>}
                  {notes.length > 0 && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {notes.map(n => (
                        <div key={n.id} className="flex items-start gap-2 bg-surface-800 rounded-lg px-2.5 py-2">
                          <p className="text-xs text-ink-secondary flex-1">{n.content}</p>
                          <span className="text-xs text-ink-muted shrink-0">{new Date(n.created_at).toLocaleDateString()}</span>
                          <button onClick={() => deleteNote(n.id)} className="text-xs text-signal/70 hover:text-signal shrink-0">x</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div className="bg-surface-900 rounded-lg p-3 space-y-2" onClick={e => e.stopPropagation()}>
                    <p className="section-label">Timeline</p>
                    <div className="space-y-0 relative pl-4 border-l border-surface-600 max-h-48 overflow-y-auto">
                      {timeline.map((event, i) => (
                        <div key={i} className="relative pb-3 last:pb-0">
                          <div className={`absolute -left-[calc(1rem+4.5px)] top-1 w-2.5 h-2.5 rounded-full ${
                            event.type === 'created'  ? 'bg-surface-500' :
                            event.type === 'prepared' ? 'bg-violet' :
                            event.type === 'applied'  ? 'bg-success' :
                            event.type === 'note'     ? 'bg-cobalt' : 'bg-surface-500'
                          }`} />
                          <p className="text-xs text-ink-secondary">{event.detail}</p>
                          <p className="text-xs text-ink-muted">{new Date(event.date).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
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
                        <button onClick={() => autoApply(selected)} disabled={applying} className="btn-primary text-xs">
                          {applying ? 'Queuing…' : 'Auto-apply'}
                        </button>
                      )}
                      <button onClick={() => applyManual(job)} disabled={applying} className="btn-secondary text-xs">
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
