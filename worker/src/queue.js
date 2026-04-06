// Cloudflare Queue consumer — processes async job pipeline tasks
import { scoreJobFit } from './lib/claude.js'
import { generateId } from './lib/crypto.js'
import { fetchUserPreferences } from './lib/preferences.js'

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

  const jobSearchPrefs = await fetchUserPreferences(env.DB, userId)

  const result = await scoreJobFit(env.ANTHROPIC_API_KEY, job.description || job.title, parsedResume, userPrefs, jobSearchPrefs)

  const status = result.score >= 75 ? 'scored' : 'low_fit'

  await env.DB.prepare(
    `UPDATE jobs SET fit_score = ?, fit_reasoning = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(result.score, JSON.stringify(result), status, jobId).run()
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
