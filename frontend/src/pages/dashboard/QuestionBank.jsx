import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { questionsApi } from '../../lib/api'

const CATEGORY_LABELS = {
  availability: 'Availability',
  salary: 'Salary',
  authorization: 'Work Authorization',
  work_style: 'Work Style',
  work_experience: 'Experience',
  custom: 'Custom',
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editAnswer, setEditAnswer] = useState('')
  const [newQ, setNewQ] = useState({ question_template: '', answer: '', category: 'custom' })
  const [showAdd, setShowAdd] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await questionsApi.list()
      setQuestions(data.questions)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const seedQuestions = async () => {
    setSeeding(true)
    try {
      await questionsApi.seed()
      toast.success('Question bank seeded with AI-generated answers!')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Seeding failed')
    } finally {
      setSeeding(false)
    }
  }

  const startEdit = (q) => {
    setEditingId(q.id)
    setEditAnswer(q.answer)
  }

  const saveEdit = async (id) => {
    try {
      await questionsApi.update(id, editAnswer)
      setQuestions(qs => qs.map(q => q.id === id ? { ...q, answer: editAnswer } : q))
      setEditingId(null)
    } catch {
      toast.error('Failed to save')
    }
  }

  const deleteQ = async (id) => {
    try {
      await questionsApi.delete(id)
      setQuestions(qs => qs.filter(q => q.id !== id))
    } catch {
      toast.error('Failed to delete')
    }
  }

  const addQuestion = async (e) => {
    e.preventDefault()
    try {
      const { data } = await questionsApi.add(newQ)
      setQuestions(qs => [...qs, { ...newQ, id: data.id }])
      setNewQ({ question_template: '', answer: '', category: 'custom' })
      setShowAdd(false)
      toast.success('Question added!')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed')
    }
  }

  const generateAnswer = async () => {
    if (!newQ.question_template) { toast.error('Enter a question first'); return }
    setGenerating(true)
    try {
      const { data } = await questionsApi.generate(newQ.question_template)
      setNewQ(p => ({ ...p, answer: data.answer }))
    } catch {
      toast.error('Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const grouped = questions.reduce((acc, q) => {
    const cat = q.category || 'custom'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(q)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Bank</h1>
          <p className="text-gray-400 text-sm mt-1">Pre-generated answers for screening questions</p>
        </div>
        <div className="flex gap-2">
          {questions.length === 0 && (
            <button onClick={seedQuestions} disabled={seeding} className="btn-primary text-sm">
              {seeding ? 'Generating…' : 'Seed with AI answers'}
            </button>
          )}
          <button onClick={() => setShowAdd(s => !s)} className="btn-ghost text-sm">+ Add</button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={addQuestion} className="card space-y-3">
          <p className="font-medium text-white">New question</p>
          <div>
            <label className="label">Question</label>
            <div className="flex gap-2">
              <input
                type="text" required
                className="input flex-1"
                placeholder="e.g. Are you comfortable working on weekends?"
                value={newQ.question_template}
                onChange={e => setNewQ(p => ({ ...p, question_template: e.target.value }))}
              />
              <button type="button" onClick={generateAnswer} disabled={generating} className="btn-ghost text-xs whitespace-nowrap">
                {generating ? '…' : 'AI answer'}
              </button>
            </div>
          </div>
          <div>
            <label className="label">Your answer</label>
            <textarea
              required rows={3}
              className="input"
              placeholder="Write your answer here, or click 'AI answer' to generate one"
              value={newQ.answer}
              onChange={e => setNewQ(p => ({ ...p, answer: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select className="input" value={newQ.category} onChange={e => setNewQ(p => ({ ...p, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Save</button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading && <div className="text-gray-500 text-sm text-center py-8">Loading…</div>}

      {!loading && questions.length === 0 && !showAdd && (
        <div className="card text-center py-16 space-y-3">
          <p className="text-gray-500">No questions yet</p>
          <p className="text-sm text-gray-600">Click "Seed with AI answers" to auto-generate responses based on your profile.</p>
        </div>
      )}

      {/* Questions by category */}
      {Object.entries(grouped).map(([cat, qs]) => (
        <div key={cat}>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {CATEGORY_LABELS[cat] || cat}
          </h2>
          <div className="space-y-2">
            {qs.map(q => (
              <div key={q.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm font-medium text-white flex-1">{q.question_template}</p>
                  <div className="flex gap-2 shrink-0">
                    {editingId !== q.id && (
                      <>
                        <button onClick={() => startEdit(q)} className="text-xs text-gray-500 hover:text-brand-light">Edit</button>
                        <button onClick={() => deleteQ(q.id)} className="text-xs text-gray-500 hover:text-danger">Delete</button>
                      </>
                    )}
                  </div>
                </div>

                {editingId === q.id ? (
                  <div className="mt-3 space-y-2">
                    <textarea
                      rows={3} className="input text-sm"
                      value={editAnswer}
                      onChange={e => setEditAnswer(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(q.id)} className="btn-primary text-xs">Save</button>
                      <button onClick={() => setEditingId(null)} className="btn-ghost text-xs">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 mt-2 leading-relaxed">{q.answer}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
