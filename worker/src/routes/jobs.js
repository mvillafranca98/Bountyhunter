import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { scoreJobFit, tailorResume, generateCoverLetter, generateSampleJobs } from '../lib/claude.js'
import { fetchUserPreferences } from '../lib/preferences.js'
import { markdownToOOXML, buildDocx } from '../lib/docx.js'

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

// ─── Helper: strip HTML and truncate description ──────────────────────────────
function cleanDescription(raw) {
  const cleaned = (raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned.slice(0, 4000)
}

// ─── Helper: fetch from Remotive (free, no key) ──────────────────────────────
async function fetchRemotive(keywords) {
  const res = await fetch(
    `https://remotive.com/api/remote-jobs?limit=5&search=${encodeURIComponent(keywords)}`
  )
  if (!res.ok) throw new Error(`Remotive API returned ${res.status}`)
  const json = await res.json()
  return (json.jobs || []).slice(0, 5).map(job => ({
    title: job.title,
    company: job.company_name,
    location: job.candidate_required_location || '',
    url: job.url || `https://remotive.com/remote-jobs/${job.id}`,
    description: cleanDescription(job.description),
    source: 'remotive',
    external_id: String(job.id),
    salary: job.salary || null,
    posted_at: job.publication_date || null,
  }))
}

// ─── Helper: fetch from JSearch / RapidAPI (covers Indeed, LinkedIn, etc.) ────
async function fetchJSearch(keywords, rapidApiKey) {
  const res = await fetch(
    `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(keywords)}&num_pages=1&page=1`,
    {
      headers: {
        'x-rapidapi-key': rapidApiKey,
        'x-rapidapi-host': 'jsearch.p.rapidapi.com',
      },
    }
  )
  if (!res.ok) throw new Error(`JSearch API returned ${res.status}`)
  const json = await res.json()
  return (json.data || []).slice(0, 5).map(job => {
    const parts = [job.job_city, job.job_state, job.job_country].filter(Boolean)
    return {
      title: job.job_title,
      company: job.employer_name,
      location: parts.join(', '),
      url: job.job_apply_link,
      description: cleanDescription(job.job_description),
      source: 'jsearch',
      external_id: job.job_id,
      salary: job.job_min_salary && job.job_max_salary
        ? `${job.job_min_salary}-${job.job_max_salary}`
        : null,
      posted_at: job.job_posted_at_datetime_utc || null,
    }
  })
}

// ─── Helper: fetch from Arbeitnow (free, no key) ─────────────────────────────
async function fetchArbeitnow(keywords) {
  const res = await fetch('https://www.arbeitnow.com/api/job-board-api')
  if (!res.ok) throw new Error(`Arbeitnow API returned ${res.status}`)
  const json = await res.json()
  const lowerKeywords = keywords.toLowerCase().split(/[\s,]+/).filter(Boolean)
  const filtered = (json.data || []).filter(job => {
    const text = `${job.title} ${job.description} ${(job.tags || []).join(' ')}`.toLowerCase()
    return lowerKeywords.some(kw => text.includes(kw))
  })
  return filtered.slice(0, 5).map(job => ({
    title: job.title,
    company: job.company_name,
    location: job.location || '',
    url: job.url || `https://www.arbeitnow.com/view/${job.slug}`,
    description: cleanDescription(job.description),
    source: 'arbeitnow',
    external_id: job.slug,
    salary: null,
    posted_at: job.created_at || null,
  }))
}

// ─── Helper: fetch from RemoteOK (free, no key) ─────────────────────────────
async function fetchRemoteOK(keywords) {
  const res = await fetch('https://remoteok.com/api', {
    headers: { 'User-Agent': 'BountyHunter/1.0' }
  })
  if (!res.ok) throw new Error(`RemoteOK API returned ${res.status}`)
  const json = await res.json()
  // First element is metadata, skip it. Filter by keywords in title/description
  const kw = keywords.toLowerCase()
  return json
    .filter(job => job.id && (
      (job.position || '').toLowerCase().includes(kw) ||
      (job.description || '').toLowerCase().includes(kw) ||
      (job.tags || []).some(t => t.toLowerCase().includes(kw))
    ))
    .slice(0, 5)
    .map(job => ({
      title: job.position,
      company: job.company,
      location: job.location || 'Remote',
      url: job.url || `https://remoteok.com/l/${job.id}`,
      description: cleanDescription(job.description),
      source: 'remoteok',
      external_id: String(job.id),
      salary: job.salary_min && job.salary_max ? `$${job.salary_min}-$${job.salary_max}` : null,
      posted_at: job.date || null,
    }))
}

// ─── Helper: fetch from The Muse (free, no key) ─────────────────────────────
async function fetchTheMuse(keywords) {
  const res = await fetch(
    `https://www.themuse.com/api/public/jobs?page=1&descending=true&category=${encodeURIComponent(keywords)}`
  )
  if (!res.ok) throw new Error(`The Muse API returned ${res.status}`)
  const json = await res.json()
  return (json.results || []).slice(0, 5).map(job => ({
    title: job.name,
    company: job.company?.name || '',
    location: (job.locations || []).map(l => l.name).join(', ') || 'Various',
    url: job.refs?.landing_page || `https://www.themuse.com/jobs/${job.id}`,
    description: cleanDescription(job.contents),
    source: 'themuse',
    external_id: String(job.id),
    salary: null,
    posted_at: job.publication_date || null,
  }))
}

// ─── Helper: fetch from Jobicy (free, no key) ───────────────────────────────
async function fetchJobicy(keywords) {
  const res = await fetch(
    `https://jobicy.com/api/v2/remote-jobs?count=5&tag=${encodeURIComponent(keywords)}`
  )
  if (!res.ok) throw new Error(`Jobicy API returned ${res.status}`)
  const json = await res.json()
  return (json.jobs || []).slice(0, 5).map(job => ({
    title: job.jobTitle,
    company: job.companyName,
    location: job.jobGeo || 'Remote',
    url: job.url,
    description: cleanDescription(job.jobDescription),
    source: 'jobicy',
    external_id: String(job.id),
    salary: job.annualSalaryMin && job.annualSalaryMax
      ? `$${job.annualSalaryMin}-$${job.annualSalaryMax}`
      : null,
    posted_at: job.pubDate || null,
  }))
}

// ─── Helper: deduplicate jobs by title+company ────────────────────────────────
function deduplicateJobs(jobs) {
  const seen = new Set()
  return jobs.filter(job => {
    const key = `${(job.title || '').toLowerCase().trim()}|${(job.company || '').toLowerCase().trim()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// POST /jobs/real-search — fetch real jobs from multiple sources in parallel
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

  // Build source fetchers — always include free sources, add JSearch if key available
  const hasRapidApi = c.env.RAPIDAPI_KEY && !c.env.RAPIDAPI_KEY.startsWith('REPLACE_')
  const sourceFetchers = [
    { name: 'remotive', fn: () => fetchRemotive(keywords) },
    { name: 'arbeitnow', fn: () => fetchArbeitnow(keywords) },
    { name: 'remoteok', fn: () => fetchRemoteOK(keywords) },
    { name: 'themuse', fn: () => fetchTheMuse(keywords) },
    { name: 'jobicy', fn: () => fetchJobicy(keywords) },
  ]
  if (hasRapidApi) {
    sourceFetchers.push({ name: 'jsearch', fn: () => fetchJSearch(keywords, c.env.RAPIDAPI_KEY) })
  }

  // Query all sources in parallel
  const results = await Promise.allSettled(sourceFetchers.map(s => s.fn()))

  // Collect results and track source statuses
  let allJobs = []
  const sources = sourceFetchers.map((s, i) => {
    const result = results[i]
    if (result.status === 'fulfilled') {
      allJobs = allJobs.concat(result.value)
      return { name: s.name, status: 'ok', count: result.value.length }
    } else {
      console.error(`Source ${s.name} failed:`, result.reason?.message)
      return { name: s.name, status: 'error', error: result.reason?.message }
    }
  })

  // Deduplicate and limit
  allJobs = deduplicateJobs(allJobs).slice(0, 15)

  if (!allJobs.length) {
    return c.json({ jobs: [], sources, message: `No jobs found for "${keywords}"` })
  }

  // Optionally score top 5 with Claude if API key is available
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
      'SELECT location, employment_type, work_authorization FROM users WHERE id = ?'
    ).bind(userId).first()

    userPrefs = {
      salary: salary ? `$${salary.min_yearly}–$${salary.max_yearly}/yr` : null,
      location: user?.location || null,
      employment_type: user?.employment_type || 'full-time',
      work_authorization: user?.work_authorization || null,
    }
  }

  // Fetch job search preferences for enhanced scoring
  let jobSearchPrefs = null
  if (hasAI) {
    jobSearchPrefs = await fetchUserPreferences(c.env.DB, userId)
  }

  // Insert into D1 and optionally score top 5
  const stmts = []
  const insertedJobs = []

  for (let i = 0; i < allJobs.length; i++) {
    const job = allJobs[i]
    const id = generateId()

    let fitScore = null
    let fitReasoning = null
    let status = 'new'

    // Score only top 5 with Claude to save API calls
    if (hasAI && i < 5) {
      try {
        const result = await scoreJobFit(c.env.ANTHROPIC_API_KEY, job.description || job.title, parsedResume, userPrefs, jobSearchPrefs)
        fitScore = result.score
        fitReasoning = JSON.stringify(result)
        status = result.score >= 75 ? 'scored' : 'low_fit'
      } catch (e) {
        console.error(`Scoring failed for job ${job.title}: ${e.message}`)
      }
    }

    stmts.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, fit_score, fit_reasoning, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, userId, job.source, job.external_id,
        job.title, job.company,
        job.location,
        job.url,
        job.description,
        fitScore, fitReasoning, status
      )
    )

    insertedJobs.push({
      id,
      source: job.source,
      external_id: job.external_id,
      title: job.title,
      company: job.company,
      location: job.location,
      url: job.url,
      description: job.description,
      salary: job.salary,
      posted_at: job.posted_at,
      fit_score: fitScore,
      fit_reasoning: fitReasoning ? JSON.parse(fitReasoning) : null,
      status,
    })
  }

  if (stmts.length) await c.env.DB.batch(stmts)

  // Build summary message
  const okSources = sources.filter(s => s.status === 'ok' && s.count > 0)
  const displayNames = { jsearch: 'Indeed/LinkedIn', remoteok: 'RemoteOK', themuse: 'The Muse', jobicy: 'Jobicy' }
  const sourceNames = okSources.map(s => displayNames[s.name] || s.name.charAt(0).toUpperCase() + s.name.slice(1))
  const sourceMsg = sourceNames.length ? ` from ${sourceNames.join(', ')}` : ''

  return c.json({
    jobs: insertedJobs,
    count: insertedJobs.length,
    scored: hasAI,
    sources,
    message: `Found ${insertedJobs.length} jobs${sourceMsg} for "${keywords}"${hasAI ? ' (top 5 AI-scored)' : ''}!`,
  })
})

// PUT /jobs/:id/flag — flag a job as not interested
jobRoutes.put('/:id/flag', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await c.env.DB.prepare(
    "UPDATE jobs SET status = 'flagged' WHERE id = ? AND user_id = ?"
  ).bind(id, userId).run()
  return c.json({ success: true })
})

// GET /jobs — list user's jobs with optional status filter and sort
jobRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const status = c.req.query('status')        // filter by status
  const sort = c.req.query('sort') || 'newest' // newest | oldest | score
  const limit = parseInt(c.req.query('limit') || '50')
  const offset = parseInt(c.req.query('offset') || '0')

  let query = 'SELECT * FROM jobs WHERE user_id = ?'
  const bindings = [userId]

  if (status) {
    query += ' AND status = ?'
    bindings.push(status)
  }

  // Sort order
  if (sort === 'oldest') {
    query += ' ORDER BY created_at ASC'
  } else if (sort === 'score') {
    query += ' ORDER BY fit_score DESC NULLS LAST, created_at DESC'
  } else {
    // newest (default)
    query += ' ORDER BY created_at DESC'
  }

  query += ' LIMIT ? OFFSET ?'
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

// GET /jobs/:id/resume-docx — download tailored resume as .docx
jobRoutes.get('/:id/resume-docx', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  // Get the tailored resume for this job
  const version = await c.env.DB.prepare(
    'SELECT * FROM resume_versions WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(id, userId).first()

  if (!version) {
    return c.json({ error: 'No tailored resume found. Click "Prepare" first.' }, 404)
  }

  const resumeText = version.resume_text || ''

  // Get user info for the header
  const user = await c.env.DB.prepare(
    'SELECT first_name, last_name, email, location FROM users WHERE id = ?'
  ).bind(userId).first()

  const fullName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Candidate'
  const email = user?.email || ''
  const location = user?.location || ''

  // Convert markdown to OOXML paragraphs
  const paragraphs = markdownToOOXML(resumeText, fullName, email, location)

  // Build minimal .docx (OOXML in a ZIP container)
  const docxBuffer = await buildDocx(paragraphs)

  const fileName = `${fullName.replace(/\s+/g, '_')}_Resume.docx`

  return new Response(docxBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
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

// POST /jobs/import-url — import a job from any URL
jobRoutes.post('/import-url', async (c) => {
  const userId = c.get('userId')
  const { url } = await c.req.json()

  if (!url) return c.json({ error: 'URL is required' }, 400)

  // 1. Fetch the page HTML
  let html
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BountyHunter/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e) {
    return c.json({ error: `Could not fetch URL: ${e.message}` }, 400)
  }

  // 2. Extract text content from HTML (strip tags, scripts, styles)
  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000) // Limit to 8k chars for Claude

  if (textContent.length < 50) {
    return c.json({ error: 'Could not extract job content from this URL. The page may require JavaScript or login.' }, 400)
  }

  // 3. Use Claude to extract structured job data from the raw text
  const anthropicKey = c.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return c.json({ error: 'AI service not configured. Please set ANTHROPIC_API_KEY.' }, 500)
  }

  const extractionPrompt = `Extract the job posting information from this web page text. Return ONLY valid JSON with these fields:
{
  "title": "job title",
  "company": "company name",
  "location": "job location (city, state, country) or 'Remote'",
  "description": "full job description (responsibilities, requirements, etc.) - max 3000 chars",
  "salary": "salary range if mentioned, or null",
  "employment_type": "full-time, part-time, contract, or freelance",
  "remote": true/false,
  "requirements": "key requirements listed as a short summary"
}

If you cannot find job posting content, return: {"error": "No job posting found on this page"}

Web page text:
${textContent}`

  let jobData
  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
    })
    const aiJson = await aiRes.json()
    const text = aiJson.content?.[0]?.text || ''
    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')
    jobData = JSON.parse(jsonMatch[0])
    if (jobData.error) {
      return c.json({ error: jobData.error }, 400)
    }
  } catch (e) {
    return c.json({ error: `Failed to parse job posting: ${e.message}` }, 500)
  }

  // 4. Score fit against user's resume
  let fitScore = null
  let fitReasoning = null
  let status = 'new'

  try {
    const resume = await c.env.DB.prepare(
      'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
    ).bind(userId).first()
    const parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}

    const salary = await c.env.DB.prepare(
      'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
    ).bind(userId).first()
    const user = await c.env.DB.prepare(
      'SELECT location, employment_type, work_authorization FROM users WHERE id = ?'
    ).bind(userId).first()

    const userPrefs = {
      salary: salary ? `$${salary.min_yearly}–$${salary.max_yearly}/yr` : null,
      location: user?.location || null,
      employment_type: user?.employment_type || 'full-time',
      work_authorization: user?.work_authorization || null,
    }

    const jobSearchPrefs = await fetchUserPreferences(c.env.DB, userId)

    const result = await scoreJobFit(anthropicKey, jobData.description || textContent.slice(0, 4000), parsedResume, userPrefs, jobSearchPrefs)
    fitScore = result.score
    fitReasoning = JSON.stringify(result)
    status = result.score >= 75 ? 'scored' : 'low_fit'
  } catch (e) {
    console.error('Scoring failed:', e.message)
    // Continue without scoring
  }

  // 5. Insert into database
  const id = generateId()
  const externalId = 'url_' + url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 100)

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO jobs
     (id, user_id, source, external_id, title, company, location, url, description, fit_score, fit_reasoning, status)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId, externalId,
    jobData.title || 'Untitled Position',
    jobData.company || 'Unknown Company',
    jobData.location || '',
    url,
    (jobData.description || '').slice(0, 4000),
    fitScore, fitReasoning, status
  ).run()

  return c.json({
    success: true,
    job: {
      id,
      title: jobData.title,
      company: jobData.company,
      location: jobData.location,
      url,
      salary: jobData.salary,
      employment_type: jobData.employment_type,
      remote: jobData.remote,
      fit_score: fitScore,
      fit_reasoning: fitReasoning ? JSON.parse(fitReasoning) : null,
      status,
    },
    message: `Imported "${jobData.title}" at ${jobData.company}${fitScore ? ` — ${fitScore}% fit` : ''}`
  })
})

// PUT /jobs/:id/status
jobRoutes.put('/:id/status', async (c) => {
  const userId = c.get('userId')
  const { status } = await c.req.json()
  const valid = ['new', 'scored', 'ready', 'applied', 'needs_manual', 'expired', 'low_fit', 'flagged']
  if (!valid.includes(status)) return c.json({ error: 'Invalid status' }, 400)

  await c.env.DB.prepare(
    "UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).bind(status, c.req.param('id'), userId).run()

  return c.json({ success: true })
})
