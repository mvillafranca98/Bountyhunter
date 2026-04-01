import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import StepProfile from './steps/StepProfile'
import StepPreferences from './steps/StepPreferences'
import StepResume from './steps/StepResume'

const STEPS = [
  { label: 'Profile',      subtitle: 'Tell us about yourself' },
  { label: 'Preferences',  subtitle: 'What are you looking for?' },
  { label: 'Resume',       subtitle: 'Upload your resume' },
]

export default function Onboarding() {
  const { user, updateUser } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(user?.onboarding_step || 0)

  useEffect(() => {
    if (user?.onboarding_step >= 3) navigate('/', { replace: true })
  }, [user, navigate])

  const advance = (updates = {}) => {
    const nextStep = step + 1
    updateUser({ ...updates, onboarding_step: nextStep })
    if (nextStep >= 3) {
      navigate('/')
    } else {
      setStep(nextStep)
    }
  }

  return (
    <div className="min-h-screen bg-surface-800 flex items-center justify-center p-4">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-10 h-10 bg-brand rounded-lg flex items-center justify-center text-white font-bold mx-auto mb-4">B</div>
          <h1 className="text-2xl font-bold text-white">{STEPS[step]?.label}</h1>
          <p className="text-gray-400 text-sm mt-1">{STEPS[step]?.subtitle}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                i < step ? 'bg-success text-white' :
                i === step ? 'bg-brand text-white' :
                'bg-surface-700 text-gray-500'
              }`}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-10 h-0.5 ${i < step ? 'bg-success' : 'bg-surface-600'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="card">
          {step === 0 && <StepProfile onComplete={advance} />}
          {step === 1 && <StepPreferences onComplete={advance} />}
          {step === 2 && <StepResume onComplete={advance} />}
        </div>
      </div>
    </div>
  )
}
