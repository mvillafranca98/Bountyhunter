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

function WorkTypeBadge({ workType }) {
  const map = {
    remote:  { label: '🌐 Remote',  cls: 'badge-cobalt' },
    hybrid:  { label: '🔄 Hybrid',  cls: 'badge-violet' },
    onsite:  { label: '🏢 On-site', cls: 'badge-amber'  },
    unknown: { label: '❓ Unknown', cls: 'badge-gray'   },
  }
  const { label, cls } = map[workType] || map.unknown
  return <span className={`badge ${cls} text-xs`}>{label}</span>
}

function SubscriptionBadge() {
  return (
    <span className="badge badge-amber text-xs" title="Subscription may be required to apply">
      💳 Subscription
    </span>
  )
}

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
  const [workTypeFilter, setWorkTypeFilter] = useState(null)  // null | 'remote' | 'hybrid' | 'onsite'
  const [showSubscription, setShowSubscription] = useState(false)  // false = hide subscription jobs
  const [dateFilter, setDateFilter] = useState(null)  // null | '1d' | '7d' | '30d'
  const [postedAfterFilter, setPostedAfterFilter] = useState(null)  // null | '1d' | '7d' | '14d' | '30d'
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 20
  const [totalCount, setTotalCount] = useState(0)
  const [notes, setNotes] = useState([])
  const [timeline, setTimeline] = useState([])
  const [noteText, setNoteText] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)

  const load = async (status, sort, workType, subscription, createdAfter, postedAfter, search, currentPage) => {
    setLoading(true)
    try {
      const params = { sort, limit: PAGE_SIZE, offset: (currentPage || 0) * PAGE_SIZE }
      if (status) params.status = status
      if (workType) params.work_type = workType
      if (subscription) params.subscription = 'include'
      if (createdAfter) params.created_after = createdAfter
      if (postedAfter) params.posted_after = postedAfter
      if (search) params.search = search
      const [jobsRes, countsRes] = await Promise.all([
        jobsApi.list(params),
        jobsApi.counts(),
      ])
      setJobs(jobsRes.data.jobs)
      setTotalCount(jobsRes.data.total ?? jobsRes.data.jobs.length)
      setCounts(countsRes.data.counts)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load jobs')
    } finally {
      setLoading(false)
    }
  }

  const getCreatedAfterISO = (filter) => {
    if (!filter) return null
    const days = filter === '1d' ? 1 : filter === '7d' ? 7 : 30
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }

  const getPostedAfterISO = (filter) => {
    if (!filter) return null
    const days = { '1d': 1, '7d': 7, '14d': 14, '30d': 30 }[filter] || 7
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  }

  useEffect(() => {
    load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
  }, [activeStatus, sortBy, workTypeFilter, showSubscription, dateFilter, postedAfterFilter, searchQuery, page])

  // Reset page when filters change
  useEffect(() => { setPage(0) }, [activeStatus, sortBy, workTypeFilter, showSubscription, dateFilter, postedAfterFilter, searchQuery])

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
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
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
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
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
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
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

  const downloadCoverLetter = (jobId, title, company) => {
    const text = selected?.prepared?.cover_letter
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `CoverLetter_${company || 'Company'}_${title || 'Role'}.txt`.replace(/[^a-zA-Z0-9_.-]/g, '_')
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const flagJob = async (jobId, e) => {
    e.stopPropagation()
    try {
      await jobsApi.flag(jobId)
      setSelected(null)
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
    } catch { toast.error('Failed to flag job') }
  }

  const shortlistJob = async (jobId, e) => {
    e.stopPropagation()
    try {
      await jobsApi.updateStatus(jobId, 'ready')
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'ready' } : j))
      if (selected?.id === jobId) setSelected(s => ({ ...s, status: 'ready' }))
      toast.success('Shortlisted ✓')
    } catch { toast.error('Failed to shortlist') }
  }

  const deleteUnreviewed = async () => {
    const unreviewed = counts.new + counts.scored + counts.low_fit || 0
    if (!window.confirm(`Delete all ${unreviewed} unreviewed jobs (new, scored, low fit)? Your shortlisted, applied, and flagged jobs will be kept.`)) return
    try {
      const { data } = await jobsApi.bulkDelete({ filter: 'unreviewed' })
      toast.success(`Deleted ${data.deleted} unreviewed jobs`)
      setSelected(null)
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete unreviewed jobs') }
  }

  const cleanupInvalid = async () => {
    if (!window.confirm('Clean up jobs with broken URLs or garbage titles? This removes data from loosely-parsed sources.')) return
    try {
      const { data } = await jobsApi.bulkDelete({ filter: 'invalid' })
      toast.success(`Removed ${data.deleted} invalid jobs`)
      setSelected(null)
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
    } catch (err) { toast.error(err.response?.data?.error || 'Cleanup failed') }
  }

  const bulkDeleteFlagged = async () => {
    if (!window.confirm('Delete all flagged jobs?')) return
    try {
      await jobsApi.bulkDelete({ filter: 'flagged' })
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete flagged jobs') }
  }

  const bulkDeleteOlderThan = async (days) => {
    if (!window.confirm(`Delete all jobs older than ${days} days?`)) return
    try {
      const created_before = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      await jobsApi.bulkDelete({ created_before })
      load(activeStatus, sortBy, workTypeFilter, showSubscription, getCreatedAfterISO(dateFilter), getPostedAfterISO(postedAfterFilter), searchQuery, page)
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete old jobs') }
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-3xl font-bold text-ink-primary">Job Queue</h1>
          {((counts.new || 0) + (counts.scored || 0) + (counts.low_fit || 0)) > 0 && (
            <span className="badge badge-amber text-xs">
              {(counts.new || 0) + (counts.scored || 0) + (counts.low_fit || 0)} unreviewed
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {((counts.new || 0) + (counts.scored || 0) + (counts.low_fit || 0)) > 0 && (
            <button
              onClick={deleteUnreviewed}
              className="btn-ghost text-xs border border-signal/40 text-signal hover:bg-signal/10 px-3 py-1.5"
            >
              🗑 Delete all unreviewed
            </button>
          )}
          <button
            onClick={cleanupInvalid}
            className="btn-ghost text-xs border border-brass/40 text-brass hover:bg-brass/10 px-3 py-1.5"
            title="Remove jobs with broken URLs or malformed titles"
          >
            🧹 Clean up invalid
          </button>
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

      {/* Search bar */}
      <form
        onSubmit={e => { e.preventDefault(); setSearchQuery(searchInput.trim()) }}
        className="flex gap-2"
      >
        <input
          type="text"
          className="input flex-1"
          placeholder="Search by job title or company…"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-primary px-4">Search</button>
        {searchQuery && (
          <button
            type="button"
            onClick={() => { setSearchInput(''); setSearchQuery('') }}
            className="btn-ghost px-3 border border-surface-600 text-ink-muted"
          >
            Clear
          </button>
        )}
      </form>

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

      {/* Work type filter + subscription toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="section-label mr-1">Work type</span>
          {[
            { key: null,      label: 'All' },
            { key: 'remote',  label: '🌐 Remote' },
            { key: 'hybrid',  label: '🔄 Hybrid' },
            { key: 'onsite',  label: '🏢 On-site' },
          ].map(({ key, label }) => (
            <button
              key={String(key)}
              onClick={() => setWorkTypeFilter(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                workTypeFilter === key
                  ? 'bg-cobalt text-white'
                  : 'bg-surface-700 text-ink-muted hover:text-ink-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSubscription(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-colors ${
            showSubscription
              ? 'border-brass/40 bg-brass/10 text-brass'
              : 'border-surface-600 text-ink-muted hover:text-ink-primary'
          }`}
        >
          <span>💳</span>
          <span>{showSubscription ? 'Showing subscription jobs' : 'Subscription jobs hidden'}</span>
        </button>
      </div>

      {/* Date added filter pills */}
      <div className="flex items-center gap-1.5">
        <span className="section-label mr-1">Date added</span>
        {[
          { key: null,  label: 'All' },
          { key: '1d',  label: 'Today' },
          { key: '7d',  label: '7 days' },
          { key: '30d', label: '30 days' },
        ].map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setDateFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              dateFilter === key
                ? 'bg-cobalt text-white'
                : 'bg-surface-700 text-ink-muted hover:text-ink-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Posted within filter pills */}
      <div className="flex items-center gap-1.5">
        <span className="section-label mr-1">Posted within</span>
        {[
          { key: null,   label: 'Any time' },
          { key: '1d',   label: 'Today' },
          { key: '7d',   label: '7 days' },
          { key: '14d',  label: '14 days' },
          { key: '30d',  label: '30 days' },
        ].map(({ key, label }) => (
          <button
            key={String(key)}
            onClick={() => setPostedAfterFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              postedAfterFilter === key
                ? 'bg-violet text-white'
                : 'bg-surface-700 text-ink-muted hover:text-ink-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {jobs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={bulkDeleteFlagged}
            className="btn-ghost text-xs border border-surface-600 flex items-center gap-1"
          >
            🚩 Delete Flagged
          </button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-muted">🗑 Delete older than:</span>
            <select
              defaultValue=""
              onChange={e => { if (e.target.value) { bulkDeleteOlderThan(Number(e.target.value)); e.target.value = '' } }}
              className="btn-ghost text-xs border border-surface-600 py-1 px-2 rounded cursor-pointer"
            >
              <option value="" disabled>Choose…</option>
              <option value="7">7 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
            </select>
          </div>
        </div>
      )}

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
                  <WorkTypeBadge workType={job.work_type || 'unknown'} />
                  {job.requires_subscription === 1 && <SubscriptionBadge />}
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
                <div className="flex items-center gap-1">
                  {!['ready', 'applied', 'needs_manual'].includes(job.status) && (
                    <button
                      onClick={(e) => shortlistJob(job.id, e)}
                      className="p-1 text-ink-muted hover:text-brass rounded transition-colors"
                      title="Shortlist job"
                    >
                      ⭐
                    </button>
                  )}
                  {job.status === 'ready' && (
                    <span className="text-xs text-brass" title="Shortlisted">⭐</span>
                  )}
                  {!['flagged', 'applied', 'expired'].includes(job.status) && (
                    <button
                      onClick={(e) => flagJob(job.id, e)}
                      className="p-1 text-ink-muted hover:text-signal rounded transition-colors"
                      title="Flag job"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path d="M3.5 2.75a.75.75 0 0 0-1.5 0v14.5a.75.75 0 0 0 1.5 0v-4.392l1.657-.348a6.449 6.449 0 0 1 4.271.572 7.948 7.948 0 0 0 5.965.524l2.078-.64A.75.75 0 0 0 18 12.25v-8.5a.75.75 0 0 0-.904-.734l-2.38.501a7.25 7.25 0 0 1-4.186-.363l-.502-.2a8.75 8.75 0 0 0-5.053-.439L3.5 3.066V2.75Z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.id === job.id && (
              <div className="mt-4 pt-4 border-t border-surface-600 space-y-4">
                {/* Meta badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  <WorkTypeBadge workType={job.work_type || 'unknown'} />
                  {job.requires_subscription === 1 && <SubscriptionBadge />}
                </div>

                {/* Subscription warning */}
                {job.requires_subscription === 1 && (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
                    <span className="text-base leading-none mt-0.5">💳</span>
                    <p className="text-xs text-amber-300">
                      This job may require a subscription to apply. Check the listing before applying.
                    </p>
                  </div>
                )}

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
                        <div className="flex items-center justify-between mb-2">
                          <p className="section-label">Cover Letter</p>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadCoverLetter(job.id, job.title, job.company) }}
                            className="btn-ghost text-xs flex items-center gap-1"
                          >
                            Download .txt
                          </button>
                        </div>
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
                        job.requires_subscription === 1
                          ? (
                            <a
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-primary text-xs"
                              onClick={e => e.stopPropagation()}
                            >
                              Visit Externally ↗
                            </a>
                          ) : (
                            <button onClick={() => autoApply(selected)} disabled={applying} className="btn-primary text-xs">
                              {applying ? 'Queuing…' : 'Auto-apply'}
                            </button>
                          )
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

      {/* Pagination */}
      {(totalCount > PAGE_SIZE || page > 0) && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-ink-muted">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, page * PAGE_SIZE + jobs.length)} of {totalCount}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="btn-ghost text-xs px-3 py-1.5 border border-surface-600 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={jobs.length < PAGE_SIZE}
              className="btn-ghost text-xs px-3 py-1.5 border border-surface-600 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

