import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { uploadToR2, resumeKey } from '../lib/r2.js'
import { parseResume, generateMasterResume, generateLinkedInCopy } from '../lib/claude.js'

export const resumeRoutes = new Hono()
resumeRoutes.use('*', requireAuth)

// POST /resume/upload — accepts multipart/form-data with { file, text? }
// The PDF bytes are stored in R2; text extracted client-side (via pdf.js) or sent directly
resumeRoutes.post('/upload', async (c) => {
  const userId = c.get('userId')
  const formData = await c.req.formData()
  const file = formData.get('file')           // File blob
  const resumeText = formData.get('text')     // Pre-extracted text from client

  if (!file && !resumeText) {
    return c.json({ error: 'Provide either a file or extracted text' }, 400)
  }

  const id = generateId()
  let r2Key = null
  let filename = 'resume.pdf'

  if (file) {
    filename = file.name || 'resume.pdf'
    r2Key = resumeKey(userId, filename)
    const bytes = await file.arrayBuffer()
    await uploadToR2(c.env, r2Key, bytes, file.type || 'application/pdf')
  }

  // Use provided text or a placeholder (text will be needed for AI parsing)
  const textToparse = resumeText || '(PDF uploaded — text extraction pending)'

  // Parse with Claude
  let parsed = null
  try {
    parsed = await parseResume(c.env.ANTHROPIC_API_KEY, textToparse)
  } catch (e) {
    console.error('Resume parse error:', e.message)
  }

  // Fetch user profile for master resume generation
  const user = await c.env.DB.prepare(
    'SELECT first_name, last_name, email, location FROM users WHERE id = ?'
  ).bind(userId).first()

  let masterResumeText = null
  let linkedInCopy = null

  if (parsed) {
    try {
      masterResumeText = await generateMasterResume(c.env.ANTHROPIC_API_KEY, parsed, user)
      linkedInCopy = await generateLinkedInCopy(c.env.ANTHROPIC_API_KEY, parsed, masterResumeText)
    } catch (e) {
      console.error('Master resume gen error:', e.message)
    }
  }

  // Deactivate previous resumes
  await c.env.DB.prepare('UPDATE resumes SET is_active = 0 WHERE user_id = ?').bind(userId).run()

  // Save new resume
  await c.env.DB.prepare(
    `INSERT INTO resumes (id, user_id, r2_key, original_filename, parsed_data, master_resume_text, linkedin_about, linkedin_experience)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId,
    r2Key || '',
    filename,
    parsed ? JSON.stringify(parsed) : null,
    masterResumeText,
    linkedInCopy?.about || null,
    linkedInCopy?.headline
      ? JSON.stringify({ headline: linkedInCopy.headline, bullets: linkedInCopy.experience_bullets })
      : null
  ).run()

  // Advance onboarding step if still on resume step
  await c.env.DB.prepare(
    "UPDATE users SET onboarding_step = MAX(onboarding_step, 3), updated_at = datetime('now') WHERE id = ?"
  ).bind(userId).run()

  return c.json({
    id,
    parsed,
    master_resume_text: masterResumeText,
    linkedin: linkedInCopy,
  }, 201)
})

// GET /resume — get active resume
resumeRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const resume = await c.env.DB.prepare(
    'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first()

  if (!resume) return c.json({ resume: null })

  return c.json({
    resume: {
      ...resume,
      parsed_data: resume.parsed_data ? JSON.parse(resume.parsed_data) : null,
      linkedin_experience: resume.linkedin_experience ? JSON.parse(resume.linkedin_experience) : null,
    }
  })
})

// GET /resume/all — list all resume versions uploaded
resumeRoutes.get('/all', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, original_filename, is_active, created_at FROM resumes WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json({ resumes: results })
})
