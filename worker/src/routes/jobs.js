import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { scoreJobFit, tailorResume, generateCoverLetter, generateSampleJobs } from '../lib/claude.js'

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
  if (!c.env.JOB_QUEUE) {
    return c.json({ error: 'Job queue not available — re-enable queue binding in wrangler.toml and restart the worker.' }, 503)
  }

  await c.env.JOB_QUEUE.send({
    type: 'SEARCH_JOBS',
    userId,
    keywords: searchKeywords,
    location: location || '',
    source,
  })

  return c.json({ queued: true, message: `Searching for "${searchKeywords}" — results will appear shortly.` })
})

// POST /jobs/seed — generate 5 AI-scored sample jobs based on user's resume + target roles
jobRoutes.post('/seed', async (c) => {
  const userId = c.get('userId')

  if (!c.env.ANTHROPIC_API_KEY || c.env.ANTHROPIC_API_KEY.startsWith('REPLACE_')) {
    return c.json({ error: 'ANTHROPIC_API_KEY not set — add your key to worker/.dev.vars and restart the worker.' }, 503)
  }

  const resume = await c.env.DB.prepare(
    'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()

  const { results: roleRows } = await c.env.DB.prepare(
    'SELECT role_title FROM target_roles WHERE user_id = ? ORDER BY priority LIMIT 5'
  ).bind(userId).all()

  const salary = await c.env.DB.prepare(
    'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
  ).bind(userId).first()

  const user = await c.env.DB.prepare(
    'SELECT location, employment_type FROM users WHERE id = ?'
  ).bind(userId).first()

  const parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}
  const targetRoles = roleRows.map(r => r.role_title)
  const userPrefs = {
    salary: salary ? `$${salary.min_yearly}–$${salary.max_yearly}/yr` : null,
    location: user?.location || null,
    employment_type: user?.employment_type || 'full-time',
  }

  let generated
  try {
    generated = await generateSampleJobs(c.env.ANTHROPIC_API_KEY, parsedResume, targetRoles, userPrefs)
  } catch (e) {
    return c.json({ error: `Sample job generation failed: ${e.message}` }, 500)
  }

  const jobs = generated?.jobs || []
  if (!jobs.length) return c.json({ error: 'No jobs were generated — try again' }, 500)

  const stmts = []
  for (const job of jobs) {
    const id = generateId()
    const fitReasoning = {
      score: job.fit_score,
      verdict: job.fit_verdict,
      highlights: job.fit_highlights || [],
      gaps: job.fit_gaps || [],
      reasoning: job.fit_reasoning || '',
    }
    const status = (job.fit_score || 0) >= 75 ? 'scored' : 'low_fit'
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, salary_min, salary_max, salary_type, fit_score, fit_reasoning, status)
         VALUES (?, ?, 'demo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, userId, generateId(),
        job.title, job.company,
        job.location || '',
        job.url || `https://jobs.example.com/${id}`,
        job.description || '',
        job.salary_min || null,
        job.salary_max || null,
        job.salary_type || 'yearly',
        job.fit_score || null,
        JSON.stringify(fitReasoning),
        status
      )
    )
  }

  await c.env.DB.batch(stmts)
  return c.json({ seeded: jobs.length, message: `${jobs.length} sample jobs generated and scored!` })
})

// POST /jobs/real-search — fetch real jobs from Remotive API (free, no key needed)
jobRoutes.post('/real-search', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json().catch(() => ({}))
  let { keywords } = body

  // If no keywords provided, fall back to user's target roles
  if (!keywords) {
    const roles = await c.env.DB.prepare(
      'SELECT role_title FROM target_roles WHERE user_id = ? ORDER BY priority LIMIT 3'
    ).bind(userId).all()
    keywords = roles.results.map(r => r.role_title).join(', ') || 'software engineer'
  }

  // Fetch from Remotive API (100% free, no API key)
  let remoteJobs = []
  try {
    const res = await fetch(
      `https://remotive.com/api/remote-jobs?limit=5&search=${encodeURIComponent(keywords)}`
    )
    if (!res.ok) throw new Error(`Remotive API returned ${res.status}`)
    const json = await res.json()
    remoteJobs = (json.jobs || []).slice(0, 5)
  } catch (e) {
    return c.json({ error: `Failed to fetch jobs from Remotive: ${e.message}` }, 502)
  }

  if (!remoteJobs.length) {
    return c.json({ jobs: [], message: `No jobs found for "${keywords}"` })
  }

  // Optionally score with Claude if API key is available
  const hasAI = c.env.ANTHROPIC_API_KEY && !c.env.ANTHROPIC_API_KEY.startsWith('REPLACE_')
  let parsedResume = {}
  let userPrefs = {}

  if (hasAI) {
    const resume = await c.env.DB.prepare(
      'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
    ).bind(userId).first()
    parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}

    const salary = await c.env.DB.prepare(
      'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
    ).bind(userId).first()
    const user = await c.env.DB.prepare(
      'SELECT location, employment_type FROM users WHERE id = ?'
    ).bind(userId).first()

    userPrefs = {
      salary: salary ? `$${salary.min_yearly}–$${salary.max_yearly}/yr` : null,
      location: user?.location || null,
      employment_type: user?.employment_type || 'full-time',
    }
  }

  // Insert into D1 and optionally score
  const stmts = []
  const insertedJobs = []

  for (const job of remoteJobs) {
    const id = generateId()
    const externalId = String(job.id)

    // Strip HTML tags from description for clean storage
    const cleanDesc = (job.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    const truncatedDesc = cleanDesc.slice(0, 4000)

    let fitScore = null
    let fitReasoning = null
    let status = 'new'

    // Score with Claude if available
    if (hasAI) {
      try {
        const result = await scoreJobFit(c.env.ANTHROPIC_API_KEY, truncatedDesc || job.title, parsedResume, userPrefs)
        fitScore = result.score
        fitReasoning = JSON.stringify(result)
        status = result.score >= 75 ? 'scored' : 'low_fit'
      } catch (e) {
        // Scoring failed — insert without score
        console.error(`Scoring failed for job ${job.title}: ${e.message}`)
      }
    }

    stmts.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, fit_score, fit_reasoning, status)
         VALUES (?, ?, 'remotive', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, userId, externalId,
        job.title, job.company_name,
        job.candidate_required_location || '',
        job.url || `https://remotive.com/remote-jobs/${job.id}`,
        truncatedDesc,
        fitScore, fitReasoning, status
      )
    )

    insertedJobs.push({
      id,
      source: 'remotive',
      external_id: externalId,
      title: job.title,
      company: job.company_name,
      location: job.candidate_required_location || '',
      url: job.url,
      description: truncatedDesc,
      salary: job.salary || null,
      tags: job.tags || [],
      category: job.category || null,
      job_type: job.job_type || null,
      publication_date: job.publication_date || null,
      fit_score: fitScore,
      fit_reasoning: fitReasoning ? JSON.parse(fitReasoning) : null,
      status,
    })
  }

  if (stmts.length) await c.env.DB.batch(stmts)

  return c.json({
    jobs: insertedJobs,
    count: insertedJobs.length,
    scored: hasAI,
    message: `Found ${insertedJobs.length} real jobs for "${keywords}"${hasAI ? ' (AI-scored)' : ''}!`,
  })
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
