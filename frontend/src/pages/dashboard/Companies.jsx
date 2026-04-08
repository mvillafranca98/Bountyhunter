import { useEffect, useState } from 'react'
import { companiesApi } from '../../lib/api'

const ATS_TYPES = [
  { value: 'greenhouse', label: 'Greenhouse', color: 'badge-cobalt' },
  { value: 'lever',      label: 'Lever',      color: 'badge-violet' },
  { value: 'ashby',      label: 'Ashby',      color: 'badge-amber' },
  { value: 'wellfound',  label: 'Wellfound',  color: 'badge-gray' },
]

function AtsBadge({ type }) {
  const t = ATS_TYPES.find(a => a.value === type) || { label: type, color: 'badge-gray' }
  return <span className={`badge ${t.color} text-xs`}>{t.label}</span>
}

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ company_name: '', ats_type: 'greenhouse', ats_slug: '', website_url: '' })
  const [addError, setAddError] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const res = await companiesApi.list()
      setCompanies(res.data.companies || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function scanAll() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await companiesApi.scanAll()
      setScanResult(res.data)
      await load()
    } catch (e) {
      setScanResult({ error: e.response?.data?.error || 'Scan failed' })
    } finally {
      setScanning(false)
    }
  }

  async function scanOne(id) {
    try {
      const res = await companiesApi.scanOne(id)
      setScanResult(res.data)
      await load()
    } catch (e) {
      setScanResult({ error: e.response?.data?.error || 'Scan failed' })
    }
  }

  async function remove(id) {
    await companiesApi.remove(id)
    setCompanies(prev => prev.filter(c => c.id !== id))
  }

  async function addCompany(e) {
    e.preventDefault()
    setAddError(null)
    try {
      const res = await companiesApi.add(form)
      setCompanies(prev => [...prev, res.data.company].sort((a, b) => a.company_name.localeCompare(b.company_name)))
      setForm({ company_name: '', ats_type: 'greenhouse', ats_slug: '', website_url: '' })
      setShowAdd(false)
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add company')
    }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Never'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-primary">Company Watchlist</h1>
          <p className="text-sm text-ink-muted mt-1">{companies.length} companies · daily auto-scan at 8 AM UTC</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowAdd(v => !v)}
            className="btn btn-ghost text-sm"
          >
            + Add
          </button>
          <button
            onClick={scanAll}
            disabled={scanning || companies.length === 0}
            className="btn btn-primary text-sm"
          >
            {scanning ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning…
              </span>
            ) : 'Scan All'}
          </button>
        </div>
      </div>

      {/* Scan result banner */}
      {scanResult && (
        <div className={`rounded-xl px-4 py-3 text-sm ${scanResult.error ? 'bg-signal/10 text-signal border border-signal/20' : 'bg-cobalt/10 text-cobalt border border-cobalt/20'}`}>
          {scanResult.error
            ? `Error: ${scanResult.error}`
            : `${scanResult.message} — ${scanResult.new_jobs} new job${scanResult.new_jobs !== 1 ? 's' : ''} added and queued for scoring`
          }
          {scanResult.summary?.filter(s => s.status === 'error').length > 0 && (
            <div className="mt-2 text-xs text-ink-muted">
              Failed: {scanResult.summary.filter(s => s.status === 'error').map(s => s.company).join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Add company form */}
      {showAdd && (
        <div className="card p-5 space-y-4">
          <h2 className="font-display font-semibold text-ink-primary">Add Company</h2>
          <form onSubmit={addCompany} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-ink-muted mb-1">Company Name</label>
              <input
                required
                value={form.company_name}
                onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))}
                placeholder="e.g. Stripe"
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">ATS Type</label>
              <select
                value={form.ats_type}
                onChange={e => setForm(p => ({ ...p, ats_type: e.target.value }))}
                className="input w-full"
              >
                {ATS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">ATS Slug</label>
              <input
                required
                value={form.ats_slug}
                onChange={e => setForm(p => ({ ...p, ats_slug: e.target.value }))}
                placeholder="e.g. stripe"
                className="input w-full"
              />
              <p className="text-xs text-ink-muted mt-1">
                {form.ats_type === 'greenhouse' && 'From boards.greenhouse.io/'}
                {form.ats_type === 'lever' && 'From jobs.lever.co/'}
                {form.ats_type === 'ashby' && 'From jobs.ashbyhq.com/'}
                {form.ats_type === 'wellfound' && 'From wellfound.com/company/'}
                <strong>{form.ats_slug || 'slug'}</strong>
              </p>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">Website (optional)</label>
              <input
                value={form.website_url}
                onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))}
                placeholder="https://stripe.com"
                className="input w-full"
              />
            </div>
            {addError && <p className="sm:col-span-2 text-xs text-signal">{addError}</p>}
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowAdd(false)} className="btn btn-ghost text-sm">Cancel</button>
              <button type="submit" className="btn btn-primary text-sm">Add Company</button>
            </div>
          </form>
        </div>
      )}

      {/* Company list */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-cobalt border-t-transparent rounded-full animate-spin" />
        </div>
      ) : companies.length === 0 ? (
        <div className="card p-10 text-center text-ink-muted">
          <p className="text-4xl mb-3">🏢</p>
          <p className="font-display font-semibold text-ink-primary mb-1">No companies yet</p>
          <p className="text-sm">Add companies to watch their job boards automatically.</p>
        </div>
      ) : (
        <div className="card divide-y divide-surface-700">
          {companies.map(company => (
            <div key={company.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-800/50 transition-colors">
              {/* Logo placeholder */}
              <div className="w-9 h-9 rounded-lg bg-surface-700 flex items-center justify-center text-sm font-bold text-ink-muted shrink-0 uppercase">
                {company.company_name[0]}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-ink-primary text-sm">{company.company_name}</span>
                  <AtsBadge type={company.ats_type} />
                  <span className="text-xs text-ink-muted font-mono">{company.ats_slug}</span>
                </div>
                <p className="text-xs text-ink-muted mt-0.5">Last scanned: {fmtDate(company.last_scanned_at)}</p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {company.website_url && (
                  <a
                    href={company.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 text-ink-muted hover:text-ink-primary rounded-lg hover:bg-surface-700 transition-colors"
                    title="Visit website"
                  >
                    <ExternalIcon className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  onClick={() => scanOne(company.id)}
                  className="p-1.5 text-ink-muted hover:text-cobalt rounded-lg hover:bg-surface-700 transition-colors"
                  title="Scan now"
                >
                  <RefreshIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => remove(company.id)}
                  className="p-1.5 text-ink-muted hover:text-signal rounded-lg hover:bg-surface-700 transition-colors"
                  title="Remove"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ExternalIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
}
function RefreshIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
}
function TrashIcon({ className }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
}
