import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { scoreJobFit, tailorResume, generateCoverLetter } from '../lib/claude.js'

export const jobRoutes = new Hono()
jobRoutes.use('*', requireAuth)

// POST /jobs/search — trigger a job search (enqueues async pipeline)
// Body: { keywords?, location?, source? }
jobRoutes.post('/search', async (c) => {
  const userId = c.get('userId')
  const { keywords, location, source = 'linkedin' } = await c.req.json()

  // Get user's target roles if no keywords specified
  let searchKeywords = keywords
  if (!searchKeywords) {
    const roles = await c.env.DB.prepare(
      'SELECT role_title FROM target_roles WHERE user_id = ? ORDER BY priority LIMIT 3'
    ).bind(userId).all()
    searchKeywords = roles.results.map(r => r.role_title).join(', ') || 'software engineer'
  }

  // Enqueue search job
  await c.env.JOB_QUEUE.send({
    type: 'SEARCH_JOBS',
    userId,
    keywords: searchKeywords,
    location: location || '',
    source,
  })

  return c.json({ queued: true, message: `Searching for "${searchKeywords}" — results will appear shortly.` })
})

// GET /jobs — list user's jobs with optional status filter
jobRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const status = c.req.query('status')        // filter by status
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let query = 'SELECT * FROM jobs WHERE user_id = ?'
  const bindings = [userId]

  if (status) {
    query += ' AND status = ?'
    bindings.push(status)
  }

  query += ' ORDER BY fit_score DESC, created_at DESC LIMIT ? OFFSET ?'
  bindings.push(limit, offset)

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()

  return c.json({
    jobs: results.map(j => ({
      ...j,
      fit_reasoning: j.fit_reasoning ? JSON.parse(j.fit_reasoning) : null,
    }))
  })
})

// GET /jobs/counts — dashboard lane counts
jobRoutes.get('/counts', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY status`
  ).bind(userId).all()

  const counts = { new: 0, scored: 0, ready: 0, applied: 0, needs_manual: 0, expired: 0, low_fit: 0 }
  results.forEach(r => { counts[r.status] = r.count })
  return c.json({ counts })
})

// GET /jobs/:id
jobRoutes.get('/:id', async (c) => {
  const userId = c.get('userId')
  const job = await c.env.DB.prepare(
    'SELECT * FROM jobs WHERE id = ? AND user_id = ?'
  ).bind(c.req.param('id'), userId).first()

  if (!job) return c.json({ error: 'Not found' }, 404)

  return c.json({
    job: {
      ...job,
      fit_reasoning: job.fit_reasoning ? JSON.parse(job.fit_reasoning) : null,
    }
  })
})

// POST /jobs/:id/prepare — generate tailored resume + cover letter for a specific job
jobRoutes.post('/:id/prepare', async (c) => {
  const userId = c.get('userId')
  const jobId = c.req.param('id')

  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').bind(jobId, userId).first()
  if (!job) return c.json({ error: 'Not found' }, 404)

  const resume = await c.env.DB.prepare(
    'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()
  if (!resume) return c.json({ error: 'Upload a resume first' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT first_name, last_name, email FROM users WHERE id = ?'
  ).bind(userId).first()

  const masterResume = resume.master_resume_text || ''
  const parsedData = resume.parsed_data ? JSON.parse(resume.parsed_data) : {}

  let tailoredResume = null
  let coverLetter = null

  try {
    tailoredResume = await tailorResume(c.env.ANTHROPIC_API_KEY, masterResume, job.description, job.title, job.company)
    coverLetter = await generateCoverLetter(c.env.ANTHROPIC_API_KEY, parsedData, job.description, job.title, job.company, user)
  } catch (e) {
    return c.json({ error: `AI generation failed: ${e.message}` }, 500)
  }

  // Save resume version
  const versionId = generateId()
  await c.env.DB.prepare(
    'INSERT INTO resume_versions (id, job_id, user_id, resume_text) VALUES (?, ?, ?, ?)'
  ).bind(versionId, jobId, userId, tailoredResume).run()

  // Update job status to ready
  await c.env.DB.prepare(
    "UPDATE jobs SET status = 'ready', updated_at = datetime('now') WHERE id = ?"
  ).bind(jobId).run()

  return c.json({ resume_version_id: versionId, tailored_resume: tailoredResume, cover_letter: coverLetter })
})

// PUT /jobs/:id/status
jobRoutes.put('/:id/status', async (c) => {
  const userId = c.get('userId')
  const { status } = await c.req.json()
  const valid = ['new', 'scored', 'ready', 'applied', 'needs_manual', 'expired', 'low_fit']
  if (!valid.includes(status)) return c.json({ error: 'Invalid status' }, 400)

  await c.env.DB.prepare(
    "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).bind(status, c.req.param('id'), userId).run()

  return c.json({ success: true })
})
