import { useEffect, useState } from 'react'
import { resumeApi } from '../../lib/api'
import StepResume from '../onboarding/steps/StepResume'

export default function ResumeStudio() {
  const [resume, setResume] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('master')
  const [showReupload, setShowReupload] = useState(false)

  const load = () => {
    setLoading(true)
    resumeApi.get().then(r => setResume(r.data.resume)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="text-gray-500 text-sm text-center py-16">Loading…</div>

  if (!resume || showReupload) {
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="text-2xl font-bold text-white">Resume Studio</h1>
        <div className="card">
          <StepResume onComplete={() => { setShowReupload(false); load() }} />
        </div>
      </div>
    )
  }

  const linkedin = resume.linkedin_experience ? JSON.parse(resume.linkedin_experience) : null
  const parsed = resume.parsed_data

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Resume Studio</h1>
          <p className="text-gray-400 text-sm mt-1">{resume.original_filename} · uploaded {new Date(resume.created_at).toLocaleDateString()}</p>
        </div>
        <button onClick={() => setShowReupload(true)} className="btn-ghost text-sm">Replace resume</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-surface-600">
        {[
          { key: 'master',    label: 'Master Resume' },
          { key: 'linkedin',  label: 'LinkedIn Copy' },
          { key: 'parsed',    label: 'Parsed Data' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key ? 'border-brand text-white' : 'border-transparent text-gray-400 hover:text-white'
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
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">ATS-Optimized Master Resume</p>
            <button
              onClick={() => navigator.clipboard.writeText(resume.master_resume_text || '')}
              className="text-xs text-brand-light hover:underline"
            >
              Copy to clipboard
            </button>
          </div>
          <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
            {resume.master_resume_text || 'Master resume not yet generated — re-upload your resume.'}
          </pre>
        </div>
      )}

      {/* LinkedIn */}
      {tab === 'linkedin' && (
        <div className="space-y-4">
          {resume.linkedin_about && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">LinkedIn About Section</p>
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{resume.linkedin_about}</p>
              <button onClick={() => navigator.clipboard.writeText(resume.linkedin_about)} className="text-xs text-brand-light hover:underline mt-2">Copy</button>
            </div>
          )}
          {linkedin?.headline && (
            <div className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">LinkedIn Headline</p>
              <p className="text-sm text-gray-300">{linkedin.headline}</p>
              <button onClick={() => navigator.clipboard.writeText(linkedin.headline)} className="text-xs text-brand-light hover:underline mt-2">Copy</button>
            </div>
          )}
          {linkedin?.bullets && Object.entries(linkedin.bullets).map(([role, bullets]) => (
            <div key={role} className="card">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{role}</p>
              <ul className="space-y-1">
                {bullets.map((b, i) => <li key={i} className="text-sm text-gray-300 flex gap-2"><span className="text-brand-light shrink-0">•</span>{b}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Parsed data */}
      {tab === 'parsed' && parsed && (
        <div className="space-y-4">
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Skills ({parsed.skills?.length || 0})</p>
            <div className="flex flex-wrap gap-1.5">
              {(parsed.skills || []).map(s => (
                <span key={s} className="badge badge-purple">{s}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Experience</p>
            <div className="space-y-3">
              {(parsed.experience || []).map((exp, i) => (
                <div key={i}>
                  <p className="font-medium text-white text-sm">{exp.title}</p>
                  <p className="text-xs text-gray-400">{exp.company} · {exp.start_date} – {exp.end_date || 'Present'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
