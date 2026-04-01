import { useState } from 'react'
import { toast } from 'react-toastify'
import { profileApi } from '../../../lib/api'

export default function StepProfile({ onComplete }) {
  const [form, setForm] = useState({
    phone: '', location: '', linkedin_url: '',
    work_authorization: 'authorized', start_date: '', employment_type: 'full-time',
  })
  const [loading, setLoading] = useState(false)
  const set = (f) => (e) => setForm(p => ({ ...p, [f]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await profileApi.update({ ...form, onboarding_step: 1 })
      onComplete(form)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Phone <span className="text-gray-600">(optional)</span></label>
          <input type="tel" className="input" placeholder="+1 555-000-0000" value={form.phone} onChange={set('phone')} />
        </div>
        <div>
          <label className="label">Location</label>
          <input type="text" required className="input" placeholder="New York, NY" value={form.location} onChange={set('location')} />
        </div>
      </div>

      <div>
        <label className="label">LinkedIn URL <span className="text-gray-600">(optional)</span></label>
        <input type="url" className="input" placeholder="https://linkedin.com/in/yourprofile" value={form.linkedin_url} onChange={set('linkedin_url')} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Work authorization</label>
          <select className="input" value={form.work_authorization} onChange={set('work_authorization')}>
            <option value="authorized">Authorized (no sponsorship)</option>
            <option value="visa_required">Needs visa sponsorship</option>
            <option value="citizen">US Citizen / PR</option>
          </select>
        </div>
        <div>
          <label className="label">Employment type</label>
          <select className="input" value={form.employment_type} onChange={set('employment_type')}>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="any">Any</option>
          </select>
        </div>
      </div>

      <div>
        <label className="label">Earliest start date</label>
        <input type="date" className="input" value={form.start_date} onChange={set('start_date')} />
      </div>

      <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
        {loading ? 'Saving…' : 'Continue →'}
      </button>
    </form>
  )
}
