import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { resumeApi } from '../../lib/api'
import StepResume from '../onboarding/steps/StepResume'

function IconLinkedIn() {
  return <svg className="w-4 h-4 text-cobalt-light" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
}

// ─── Minimal markdown renderer (no dependencies) ───────────────────────────────
function renderInline(str) {
  // Split on **bold**, *italic*, `code`
  const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="italic text-gray-200">{part.slice(1, -1)}</em>
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="text-cobalt-light bg-surface-900 px-1 rounded text-xs font-mono">{part.slice(1, -1)}</code>
    return part
  })
}

function MarkdownResume({ text }) {
  const lines = text.split('\n')
  const elements = []
  const listItems = []
  let k = 0

  const flush = () => {
    if (listItems.length) {
      elements.push(
        <ul key={k++} className="list-none space-y-0.5 ml-3 my-1">
          {listItems.splice(0).map((li, i) => (
            <li key={i} className="text-sm text-gray-300 flex gap-2">
              <span className="text-cobalt-light shrink-0 mt-0.5">•</span>
              <span>{li}</span>
            </li>
          ))}
        </ul>
      )
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (line.startsWith('# ')) {
      flush()
      elements.push(
        <h1 key={k++} className="text-2xl font-bold text-white mt-2 mb-0.5 tracking-tight">
          {renderInline(line.slice(2))}
        </h1>
      )
    } else if (line.startsWith('## ')) {
      flush()
      elements.push(
        <h2 key={k++} className="text-sm font-bold text-cobalt-light uppercase tracking-widest mt-5 mb-1 border-b border-surface-600 pb-1">
          {line.slice(3)}
        </h2>
      )
    } else if (line.startsWith('### ')) {
      flush()
      elements.push(
        <h3 key={k++} className="text-sm font-semibold text-white mt-3 mb-0.5">
          {renderInline(line.slice(4))}
        </h3>
      )
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(renderInline(line.slice(2)))
    } else if (line.trim() === '') {
      flush()
      elements.push(<div key={k++} className="h-1" />)
    } else {
      flush()
      elements.push(
        <p key={k++} className="text-sm text-gray-300 leading-relaxed">
          {renderInline(line)}
        </p>
      )
    }
  }
  flush()

  return <div className="space-y-0">{elements}</div>
}

export default function ResumeStudio() {
  const [resume, setResume] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('master')
  const [showReupload, setShowReupload] = useState(false)
  const [linkedInUrl, setLinkedInUrl] = useState('')
  const [linkedInText, setLinkedInText] = useState('')
  const [showPasteArea, setShowPasteArea] = useState(false)
  const [importingLI, setImportingLI] = useState(false)
  const [linkedInMode, setLinkedInMode] = useState('url')
  const [exportFiles, setExportFiles] = useState([])

  const load = () => {
    setLoading(true)
    resumeApi.get().then(r => setResume(r.data.resume)).finally(() => setLoading(false))
  }

  const importLinkedIn = async () => {
    setImportingLI(true)
    try {
      const { data } = await resumeApi.importLinkedIn({
        url: linkedInUrl.trim() || undefined,
        text: linkedInText.trim() || undefined,
      })
      toast.success(data.message || 'Profile imported!')
      setLinkedInUrl('')
      setLinkedInText('')
      setShowPasteArea(false)
      load()
    } catch (err) {
      if (err.response?.data?.needsManualPaste) {
        setShowPasteArea(true)
        toast.warn('Please paste your LinkedIn profile text manually')
      } else {
        toast.error(err.response?.data?.error || 'Import failed')
      }
    } finally {
      setImportingLI(false)
    }
  }

  const importLinkedInExport = async () => {
    if (!exportFiles.length) return
    setImportingLI(true)
    try {
      const fileContents = await Promise.all(
        exportFiles.map(f => f.text().then(content => ({ name: f.name, content })))
      )
      const { data } = await resumeApi.importLinkedInExport(fileContents)
      toast.success(data.message || 'LinkedIn export imported!')
      setExportFiles([])
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Export import failed')
    } finally {
      setImportingLI(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="text-ink-muted text-sm text-center py-16">Loading…</div>

  if (!resume || showReupload) {
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="font-display text-3xl font-bold text-ink-primary">Resume Studio</h1>
        <div className="card">
          <StepResume onComplete={() => { setShowReupload(false); load() }} />
        </div>
        <div className="relative flex items-center gap-3">
          <div className="flex-1 border-t border-surface-600" />
          <span className="text-xs text-ink-muted uppercase">or</span>
          <div className="flex-1 border-t border-surface-600" />
        </div>

        {/* LinkedIn Import card */}
        <div className="card p-4 space-y-4">
          <h3 className="font-display text-sm font-semibold text-ink-primary flex items-center gap-2">
            <IconLinkedIn />
            Import from LinkedIn
          </h3>

          {/* Tab toggle */}
          <div className="flex gap-1 bg-surface-800 rounded-lg p-1">
            {['url', 'export'].map(mode => (
              <button
                key={mode}
                onClick={() => setLinkedInMode(mode)}
                className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                  linkedInMode === mode ? 'bg-cobalt text-white' : 'text-ink-muted hover:text-ink-primary'
                }`}
              >
                {mode === 'url' ? '🔗 Profile URL' : '📁 Data Export'}
              </button>
            ))}
          </div>

          {linkedInMode === 'url' && (
            <div className="space-y-2">
              <input
                type="url"
                className="input text-sm"
                placeholder="https://linkedin.com/in/your-profile"
                value={linkedInUrl}
                onChange={e => setLinkedInUrl(e.target.value)}
              />
              {showPasteArea && (
                <>
                  <p className="text-xs text-warning">LinkedIn blocked direct access. Please copy-paste your profile text:</p>
                  <textarea
                    className="input text-sm h-32"
                    placeholder="Go to your LinkedIn profile → Select All (Cmd+A) → Copy (Cmd+C) → Paste here"
                    value={linkedInText}
                    onChange={e => setLinkedInText(e.target.value)}
                  />
                </>
              )}
              <button
                onClick={importLinkedIn}
                disabled={importingLI || (!linkedInUrl.trim() && !linkedInText.trim())}
                className="btn-primary text-sm w-full"
              >
                {importingLI ? 'Importing...' : 'Import from LinkedIn'}
              </button>
              <p className="text-xs text-ink-muted">Uses your saved LinkedIn session via the Playwright service for best results.</p>
            </div>
          )}

          {linkedInMode === 'export' && (
            <div className="space-y-3">
              <div className="bg-surface-800 rounded-lg p-3 text-xs text-ink-muted space-y-1">
                <p className="font-medium text-ink-secondary">How to get your LinkedIn export:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>LinkedIn → Settings → Data Privacy</li>
                  <li>Get a copy of your data → Request archive</li>
                  <li>Download ZIP → Extract → Upload CSV files below</li>
                </ol>
                <p className="text-cobalt-light mt-1">Upload: Profile.csv, Positions.csv, Skills.csv, Education.csv</p>
              </div>
              <input
                type="file"
                accept=".csv"
                multiple
                onChange={e => setExportFiles(Array.from(e.target.files))}
                className="text-sm text-ink-muted file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-cobalt/15 file:text-cobalt-light file:text-xs file:font-medium hover:file:bg-cobalt/25 cursor-pointer"
              />
              {exportFiles.length > 0 && (
                <p className="text-xs text-ink-muted">{exportFiles.length} file(s) selected: {exportFiles.map(f => f.name).join(', ')}</p>
              )}
              <button
                onClick={importLinkedInExport}
                disabled={importingLI || exportFiles.length === 0}
                className="btn-primary text-sm w-full"
              >
                {importingLI ? 'Parsing export...' : 'Parse LinkedIn Export'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  const linkedin = resume.linkedin_experience || null
  const parsed = resume.parsed_data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink-primary">Resume Studio</h1>
          <p className="text-ink-muted text-sm mt-1">{resume.original_filename} · uploaded {new Date(resume.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={() => setShowReupload(true)} className="btn-ghost text-sm">Replace resume</button>
      </div>

      {/* LinkedIn Import card */}
      <div className="card p-4 space-y-4">
        <h3 className="font-display text-sm font-semibold text-ink-primary flex items-center gap-2">
          <IconLinkedIn />
          Import from LinkedIn
        </h3>

        {/* Tab toggle */}
        <div className="flex gap-1 bg-surface-800 rounded-lg p-1">
          {['url', 'export'].map(mode => (
            <button
              key={mode}
              onClick={() => setLinkedInMode(mode)}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors font-medium ${
                linkedInMode === mode ? 'bg-cobalt text-white' : 'text-ink-muted hover:text-ink-primary'
              }`}
            >
              {mode === 'url' ? '🔗 Profile URL' : '📁 Data Export'}
            </button>
          ))}
        </div>

        {linkedInMode === 'url' && (
          <div className="space-y-2">
            <input
              type="url"
              className="input text-sm"
              placeholder="https://linkedin.com/in/your-profile"
              value={linkedInUrl}
              onChange={e => setLinkedInUrl(e.target.value)}
            />
            {showPasteArea && (
              <>
                <p className="text-xs text-warning">LinkedIn blocked direct access. Please copy-paste your profile text:</p>
                <textarea
                  className="input text-sm h-32"
                  placeholder="Go to your LinkedIn profile → Select All (Cmd+A) → Copy (Cmd+C) → Paste here"
                  value={linkedInText}
                  onChange={e => setLinkedInText(e.target.value)}
                />
              </>
            )}
            <button
              onClick={importLinkedIn}
              disabled={importingLI || (!linkedInUrl.trim() && !linkedInText.trim())}
              className="btn-primary text-sm w-full"
            >
              {importingLI ? 'Importing...' : 'Import from LinkedIn'}
            </button>
            <p className="text-xs text-ink-muted">Uses your saved LinkedIn session via the Playwright service for best results.</p>
          </div>
        )}

        {linkedInMode === 'export' && (
          <div className="space-y-3">
            <div className="bg-surface-800 rounded-lg p-3 text-xs text-ink-muted space-y-1">
              <p className="font-medium text-ink-secondary">How to get your LinkedIn export:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>LinkedIn → Settings → Data Privacy</li>
                <li>Get a copy of your data → Request archive</li>
                <li>Download ZIP → Extract → Upload CSV files below</li>
              </ol>
              <p className="text-cobalt-light mt-1">Upload: Profile.csv, Positions.csv, Skills.csv, Education.csv</p>
            </div>
            <input
              type="file"
              accept=".csv"
              multiple
              onChange={e => setExportFiles(Array.from(e.target.files))}
              className="text-sm text-ink-muted file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-cobalt/15 file:text-cobalt-light file:text-xs file:font-medium hover:file:bg-cobalt/25 cursor-pointer"
            />
            {exportFiles.length > 0 && (
              <p className="text-xs text-ink-muted">{exportFiles.length} file(s) selected: {exportFiles.map(f => f.name).join(', ')}</p>
            )}
            <button
              onClick={importLinkedInExport}
              disabled={importingLI || exportFiles.length === 0}
              className="btn-primary text-sm w-full"
            >
              {importingLI ? 'Parsing export...' : 'Parse LinkedIn Export'}
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-surface-600">
        {[
          { key: 'master',    label: 'Master Resume' },
          { key: 'linkedin',  label: 'LinkedIn Copy' },
          { key: 'parsed',    label: 'Parsed Data' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-cobalt text-ink-primary font-semibold font-display'
                : 'border-transparent text-ink-muted hover:text-ink-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Master resume */}
      {tab === 'master' && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <p className="section-label">ATS-Optimized Master Resume</p>
            <button
              onClick={() => navigator.clipboard.writeText(resume.master_resume_text || '')}
              className="text-xs text-cobalt-light hover:underline"
            >
              Copy to clipboard
            </button>
          </div>
          {resume.master_resume_text ? (
            <div className="py-1">
              <MarkdownResume text={resume.master_resume_text} />
            </div>
          ) : (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-ink-muted">Master resume not yet generated.</p>
              <p className="text-xs text-ink-muted">
                Add your <code className="text-cobalt-light bg-surface-900 px-1 rounded text-xs font-mono">ANTHROPIC_API_KEY</code> to <code className="text-cobalt-light bg-surface-900 px-1 rounded text-xs font-mono">worker/.dev.vars</code>, restart the worker, then click <strong className="text-ink-primary">Replace resume</strong> to re-upload.
              </p>
            </div>
          )}
        </div>
      )}

      {/* LinkedIn */}
      {tab === 'linkedin' && (
        <div className="space-y-4">
          {resume.linkedin_about && (
            <div className="card">
              <p className="section-label mb-2">LinkedIn About Section</p>
              <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{resume.linkedin_about}</p>
              <button onClick={() => navigator.clipboard.writeText(resume.linkedin_about)} className="text-xs text-cobalt-light hover:underline mt-2">Copy</button>
            </div>
          )}
          {linkedin?.headline && (
            <div className="card">
              <p className="section-label mb-2">LinkedIn Headline</p>
              <p className="text-sm text-ink-secondary leading-relaxed whitespace-pre-wrap">{linkedin.headline}</p>
              <button onClick={() => navigator.clipboard.writeText(linkedin.headline)} className="text-xs text-cobalt-light hover:underline mt-2">Copy</button>
            </div>
          )}
          {linkedin?.bullets && Object.entries(linkedin.bullets).map(([role, bullets]) => (
            <div key={role} className="card">
              <p className="section-label mb-2">{role}</p>
              <ul className="space-y-1">
                {bullets.map((b, i) => (
                  <li key={i} className="text-sm text-ink-secondary leading-relaxed flex gap-2">
                    <span className="text-cobalt-light shrink-0">•</span>{b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Parsed data */}
      {tab === 'parsed' && parsed && (
        <div className="space-y-4">
          <div className="card">
            <p className="section-label mb-2">Skills ({parsed.skills?.length || 0})</p>
            <div className="flex flex-wrap gap-1.5">
              {(parsed.skills || []).map(s => (
                <span key={s} className="badge-cobalt">{s}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <p className="section-label mb-3">Experience</p>
            <div className="space-y-3">
              {(parsed.experience || []).map((exp, i) => (
                <div key={i}>
                  <p className="font-semibold text-ink-primary text-sm">{exp.title}</p>
                  <p className="text-xs text-ink-muted">{exp.company} · {exp.start_date} – {exp.end_date || 'Present'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
