// Cloudflare Queue consumer — processes async job pipeline tasks
import { scoreJobFit } from './lib/claude.js'
import { generateId } from './lib/crypto.js'
import { fetchUserPreferences } from './lib/preferences.js'

// ─── Cosine Similarity (pure JS, no deps) ─────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export async function handleQueue(batch, env) {
  for (const msg of batch.messages) {
    try {
      await processMessage(msg.body, env)
      msg.ack()
    } catch (e) {
      console.error(`Queue message failed [${msg.body?.type}]:`, e.message)
      msg.retry()
    }
  }
}

async function processMessage(body, env) {
  switch (body.type) {
    case 'SEARCH_JOBS':
      await handleSearchJobs(body, env)
      break
    case 'SCORE_JOB':
      await handleScoreJob(body, env)
      break
    case 'SCORE_JOBS_BATCH':
      await handleScoreJobsBatch(body, env)
      break
    case 'SCAN_COMPANY':
      await handleScanCompany(body, env)
      break
    case 'AUTO_APPLY':
      await handleAutoApply(body, env)
      break
    default:
      console.warn('Unknown queue message type:', body.type)
  }
}

// ─── Search Jobs ───────────────────────────────────────────────────────────────
async function handleSearchJobs({ userId, keywords, location, source }, env) {
  // Call the job search MCP / API
  // In production this calls Indeed/LinkedIn APIs
  // For now, stub with a fetch to a configured job search API
  const searchUrl = env.JOB_SEARCH_API_URL
  if (!searchUrl) {
    console.warn('JOB_SEARCH_API_URL not configured — skipping search')
    return
  }

  const res = await fetch(`${searchUrl}/search?q=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}&source=${source}`, {
    headers: { Authorization: `Bearer ${env.JOB_SEARCH_API_KEY}` }
  })
  if (!res.ok) throw new Error(`Job search API error: ${res.status}`)

  const { jobs } = await res.json()

  // Upsert jobs into D1, then enqueue scoring for each
  const stmts = []
  const toScore = []

  for (const job of (jobs || [])) {
    const id = generateId()
    stmts.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, requirements, salary_min, salary_max, salary_type, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, userId, source, job.id,
        job.title, job.company, job.location || '',
        job.url, job.description || '',
        job.requirements ? JSON.stringify(job.requirements) : null,
        job.salary_min || null, job.salary_max || null, job.salary_type || null,
        job.posted_at || null
      )
    )
    toScore.push({ internalId: id, externalId: job.id })
  }

  if (stmts.length) await env.DB.batch(stmts)

  // Enqueue fit scoring for each new job
  for (const j of toScore) {
    await env.JOB_QUEUE.send({ type: 'SCORE_JOB', userId, jobId: j.internalId })
  }
}

// ─── Score Job Fit ─────────────────────────────────────────────────────────────
async function handleScoreJob({ userId, jobId }, env) {
  const job = await env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').bind(jobId, userId).first()
  if (!job) return

  const resume = await env.DB.prepare(
    'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()

  const salary = await env.DB.prepare(
    'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
  ).bind(userId).first()

  const user = await env.DB.prepare(
    'SELECT location, employment_type, work_authorization FROM users WHERE id = ?'
  ).bind(userId).first()

  const parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}
  const userPrefs = {
    salary: salary ? `$${salary.min_yearly}–$${salary.max_yearly}/yr` : null,
    location: user?.location,
    employment_type: user?.employment_type,
    work_authorization: user?.work_authorization,
  }

  // ─── Embedding pre-filter (Cloudflare Workers AI) ─────────────────────────────
  // If env.AI is available, compute cosine similarity first.
  // Below threshold → skip Claude entirely, save API cost.
  if (env.AI && Object.keys(parsedResume).length > 0) {
    try {
      const resumeText = [
        parsedResume.summary || '',
        (parsedResume.skills || []).join(' '),
        (parsedResume.experience || []).map(e => `${e.title} ${e.description || ''}`).join(' '),
      ].join(' ').slice(0, 1500)

      const jobText = (job.description || job.title).slice(0, 1500)

      const embeddings = await env.AI.run('@cf/baai/bge-small-en-v1.5', {
        text: [resumeText, jobText],
      })

      const similarity = cosineSimilarity(embeddings.data[0], embeddings.data[1])

      if (similarity < 0.25) {
        const lowFitResult = {
          score: 15,
          verdict: 'weak_fit',
          reasoning: 'Low semantic similarity with your resume — pre-filtered before full AI analysis.',
          highlights: [],
          gaps: ['Low overall relevance to your background'],
          deal_breakers: [],
          salary_match: null,
          dimensions: null,
          work_type_detected: 'unknown',
        }
        await env.DB.prepare(
          `UPDATE jobs SET fit_score = 15, fit_reasoning = ?, status = 'low_fit', updated_at = datetime('now') WHERE id = ?`
        ).bind(JSON.stringify(lowFitResult), jobId).run()
        return
      }
    } catch (e) {
      console.warn('Embedding pre-filter failed, falling back to Claude:', e.message)
    }
  }

  const jobSearchPrefs = await fetchUserPreferences(env.DB, userId)

  const result = await scoreJobFit(env.ANTHROPIC_API_KEY, job.description || job.title, parsedResume, userPrefs, jobSearchPrefs)

  const status = result.score >= 75 ? 'scored' : 'low_fit'

  await env.DB.prepare(
    `UPDATE jobs SET fit_score = ?, fit_reasoning = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(result.score, JSON.stringify(result), status, jobId).run()

  // Update work_type if Claude detected it
  if (result.work_type_detected && result.work_type_detected !== 'unknown') {
    await env.DB.prepare(
      `UPDATE jobs SET work_type = ?, updated_at = datetime('now') WHERE id = ?`
    ).bind(result.work_type_detected, jobId).run()
  }
}

// ─── Score Jobs Batch (parallel) ──────────────────────────────────────────────
async function handleScoreJobsBatch({ userId, jobIds }, env) {
  if (!jobIds?.length) return
  // Score up to 5 jobs in parallel
  const batch = jobIds.slice(0, 5)
  await Promise.allSettled(
    batch.map(jobId => handleScoreJob({ userId, jobId }, env).catch(e =>
      console.error(`Batch score failed for ${jobId}:`, e.message)
    ))
  )
}

// ─── Auto Apply ────────────────────────────────────────────────────────────────
async function handleAutoApply({ userId, jobId, jobUrl, resume_version_id, cover_letter }, env) {
  const playwrightUrl = env.PLAYWRIGHT_SERVICE_URL
  if (!playwrightUrl) {
    console.warn('PLAYWRIGHT_SERVICE_URL not configured')
    return
  }

  const resume = resume_version_id
    ? await env.DB.prepare('SELECT resume_text FROM resume_versions WHERE id = ?').bind(resume_version_id).first()
    : await env.DB.prepare('SELECT master_resume_text as resume_text FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1').bind(userId).first()

  // Get question bank answers for this user
  const { results: questions } = await env.DB.prepare(
    'SELECT question_template, answer FROM question_bank WHERE user_id = ?'
  ).bind(userId).all()

  const qBank = {}
  questions.forEach(q => { qBank[q.question_template] = q.answer })

  const res = await fetch(`${playwrightUrl}/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': env.PLAYWRIGHT_SERVICE_TOKEN || '',
    },
    body: JSON.stringify({
      jobUrl,
      resumeText: resume?.resume_text || '',
      coverLetter: cover_letter || '',
      questionBank: qBank,
    }),
  })

  const result = await res.json()

  if (result.success) {
    await env.DB.prepare(
      `INSERT INTO applications (id, job_id, user_id, resume_version_id, cover_letter, method)
       VALUES (?, ?, ?, ?, ?, 'auto')`
    ).bind(generateId(), jobId, userId, resume_version_id || null, cover_letter || null).run()

    await env.DB.prepare(
      "UPDATE jobs SET status = 'applied', updated_at = datetime('now') WHERE id = ?"
    ).bind(jobId).run()
  } else {
    // Save blocker
    await env.DB.prepare(
      `INSERT INTO blockers (id, job_id, user_id, reason, reason_detail, screenshot_r2_key)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), jobId, userId, result.blockerReason || 'other', result.blockerDetail || null, result.screenshotKey || null).run()

    await env.DB.prepare(
      "UPDATE jobs SET status = 'needs_manual', updated_at = datetime('now') WHERE id = ?"
    ).bind(jobId).run()
  }
}

// ─── Scan Company Watchlist (cron-triggered) ──────────────────────────────────
async function handleScanCompany({ userId, companyId }, env) {
  const company = await env.DB.prepare(
    'SELECT * FROM company_watchlist WHERE id = ? AND user_id = ? AND is_active = 1'
  ).bind(companyId, userId).first()
  if (!company) return

  const atsUrls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(company.ats_slug)}/jobs?content=true`,
    lever:      `https://api.lever.co/v0/postings/${encodeURIComponent(company.ats_slug)}?mode=json`,
    ashby:      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(company.ats_slug)}`,
  }
  const url = atsUrls[company.ats_type]
  if (!url) return

  let jobs = []
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BountyHunter/1.0' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()

    const raw = company.ats_type === 'greenhouse' ? (json.jobs || [])
              : company.ats_type === 'lever'      ? (Array.isArray(json) ? json : [])
              : (json.jobPostings || [])

    jobs = raw.map(job => {
      const location = (company.ats_type === 'greenhouse' ? job.location?.name
                      : company.ats_type === 'lever'      ? job.categories?.location
                      : job.locationName) || ''
      const rawDesc  = (company.ats_type === 'greenhouse' ? job.content
                      : company.ats_type === 'lever'      ? (job.descriptionPlain || job.description)
                      : (job.descriptionHtml || job.description)) || ''
      const description = rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
      const jobUrl  = (company.ats_type === 'greenhouse' ? job.absolute_url
                     : company.ats_type === 'lever'      ? job.hostedUrl
                     : job.jobUrl) || ''
      const text = `${location} ${description}`.toLowerCase()
      const work_type = /\bhybrid\b/.test(text) ? 'hybrid'
                      : /\bon.?site\b|\bin.?office\b/.test(text) ? 'onsite'
                      : /\bremote\b|\bwfh\b/.test(text) ? 'remote'
                      : 'unknown'
      return { title: job.title || job.text, company: company.company_name, location, url: jobUrl, description, external_id: String(job.id), source: company.ats_type, work_type }
    })
  } catch (e) {
    console.error(`SCAN_COMPANY ${company.company_name}:`, e.message)
    return
  }

  for (const job of jobs) {
    const id = generateId()
    await env.DB.prepare(
      `INSERT OR IGNORE INTO jobs (id, user_id, source, external_id, title, company, location, url, description, work_type, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`
    ).bind(id, userId, job.source, job.external_id, job.title, job.company, job.location, job.url, job.description, job.work_type).run()
  }

  await env.DB.prepare(
    "UPDATE company_watchlist SET last_scanned_at = datetime('now') WHERE id = ?"
  ).bind(companyId).run()
}
