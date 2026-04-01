import { useState, useRef } from 'react'
import { toast } from 'react-toastify'
import { resumeApi } from '../../../lib/api'

// Extract text from PDF using pdf.js (loaded dynamically)
async function extractPdfText(file) {
  const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
  GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(item => item.str).join(' ') + '\n'
  }
  return text.trim()
}

export default function StepResume({ onComplete }) {
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [stage, setStage] = useState('')   // 'parsing' | 'generating' | ''
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    if (f.type !== 'application/pdf') { toast.error('Please upload a PDF file'); return }
    if (f.size > 5 * 1024 * 1024) { toast.error('File must be under 5MB'); return }
    setFile(f)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) { toast.error('Please select a PDF resume'); return }

    setLoading(true)
    setStage('parsing')

    try {
      let resumeText = ''
      try {
        resumeText = await extractPdfText(file)
      } catch {
        toast.warn('Could not extract PDF text — AI will do its best with what it sees')
      }

      setStage('generating')

      const formData = new FormData()
      formData.append('file', file)
      if (resumeText) formData.append('text', resumeText)

      const { data } = await resumeApi.upload(formData)

      toast.success('Resume uploaded and master resume generated!')
      onComplete({ resume_id: data.id })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed')
    } finally {
      setLoading(false)
      setStage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-brand bg-brand/5' :
          file ? 'border-success bg-success/5' :
          'border-surface-600 hover:border-brand/50'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => handleFile(e.target.files[0])} />

        {file ? (
          <div>
            <div className="text-2xl mb-2">📄</div>
            <p className="font-medium text-white">{file.name}</p>
            <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(0)} KB · PDF</p>
            <button type="button" onClick={(e) => { e.stopPropagation(); setFile(null) }}
              className="text-xs text-gray-500 hover:text-danger mt-2 underline">
              Remove
            </button>
          </div>
        ) : (
          <div>
            <div className="text-3xl mb-3">📤</div>
            <p className="text-white font-medium">Drop your resume here</p>
            <p className="text-gray-500 text-sm mt-1">or click to browse · PDF only · max 5MB</p>
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-surface-900 rounded-lg p-3 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-sm text-gray-300">
            {stage === 'parsing' ? 'Extracting resume text…' : 'Claude is building your master resume and LinkedIn copy…'}
          </p>
        </div>
      )}

      <div className="text-xs text-gray-500 bg-surface-900 rounded-lg p-3">
        <p className="font-medium text-gray-400 mb-1">What happens next:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>Claude parses your skills, experience, and education</li>
          <li>Generates a polished ATS-optimized master resume</li>
          <li>Creates LinkedIn About section and experience bullets</li>
        </ul>
      </div>

      <button type="submit" disabled={loading || !file} className="btn-primary w-full justify-center">
        {loading ? 'Processing…' : 'Upload & generate →'}
      </button>
    </form>
  )
}
