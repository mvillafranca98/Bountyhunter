import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'

export const companyRoutes = new Hono()
companyRoutes.use('*', requireAuth)

// ─── ATS Scraper Helpers ──────────────────────────────────────────────────────

// Greenhouse: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true
async function fetchGreenhouseJobs(slug) {
  const res = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`,
    { headers: { 'User-Agent': 'BountyHunter/1.0' } }
  )
  if (!res.ok) throw new Error(`Greenhouse ${slug}: HTTP ${res.status}`)
  const json = await res.json()
  return (json.jobs || []).map(job => {
    const location = (job.location?.name || '').trim()
    const description = (job.content || '')
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    return {
      title: job.title,
      company: slug,
      location,
      url: job.absolute_url || `https://boards.greenhouse.io/${slug}/jobs/${job.id}`,
      description,
      source: 'greenhouse',
      external_id: String(job.id),
      salary: null,
      posted_at: job.updated_at || null,
      work_type: inferWorkType(location, description),
      requires_subscription: 0,
      subscription_hint: null,
    }
  })
}

// Lever: https://api.lever.co/v0/postings/{slug}?mode=json
async function fetchLeverJobs(slug) {
  const res = await fetch(
    `https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`,
    { headers: { 'User-Agent': 'BountyHunter/1.0' } }
  )
  if (!res.ok) throw new Error(`Lever ${slug}: HTTP ${res.status}`)
  const json = await res.json()
  return (Array.isArray(json) ? json : []).map(job => {
    const location = job.categories?.location || job.workplaceType || ''
    const description = [
      job.descriptionPlain || job.description || '',
      (job.lists || []).map(l => `${l.text}: ${(l.content || '').replace(/<[^>]*>/g, ' ')}`).join('\n'),
    ].join('\n').trim().slice(0, 4000)
    return {
      title: job.text,
      company: slug,
      location,
      url: job.hostedUrl || `https://jobs.lever.co/${slug}/${job.id}`,
      description,
      source: 'lever',
      external_id: job.id,
      salary: null,
      posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      work_type: job.workplaceType === 'remote' ? 'remote' : inferWorkType(location, description),
      requires_subscription: 0,
      subscription_hint: null,
    }
  })
}

// Ashby: https://api.ashbyhq.com/posting-api/job-board/{slug}
async function fetchAshbyJobs(slug) {
  const res = await fetch(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`,
    { headers: { 'User-Agent': 'BountyHunter/1.0' } }
  )
  if (!res.ok) throw new Error(`Ashby ${slug}: HTTP ${res.status}`)
  const json = await res.json()
  return (json.jobPostings || []).map(job => {
    const location = job.locationName || job.location || ''
    const description = (job.descriptionHtml || job.description || '')
      .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    return {
      title: job.title,
      company: slug,
      location,
      url: job.jobUrl || `https://jobs.ashbyhq.com/${slug}/${job.id}`,
      description,
      source: 'ashby',
      external_id: job.id,
      salary: null,
      posted_at: job.publishedAt || null,
      work_type: job.isRemote ? 'remote' : inferWorkType(location, description),
      requires_subscription: 0,
      subscription_hint: null,
    }
  })
}

// Wellfound (Angellist) — public JSON endpoint
async function fetchWellfoundJobs(slug) {
  // Wellfound doesn't have a clean public API — scrape the JSON endpoint
  const res = await fetch(
    `https://api.wellfound.com/company/${encodeURIComponent(slug)}/jobs`,
    { headers: { 'User-Agent': 'BountyHunter/1.0', 'Accept': 'application/json' } }
  )
  if (!res.ok) throw new Error(`Wellfound ${slug}: HTTP ${res.status}`)
  const json = await res.json()
  return (json.jobs || json.data || []).map(job => {
    const location = job.location || job.locationNames?.[0] || ''
    const description = (job.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
    return {
      title: job.title,
      company: slug,
      location,
      url: job.url || job.applyUrl || `https://wellfound.com/company/${slug}/jobs/${job.id}`,
      description,
      source: 'wellfound',
      external_id: String(job.id),
      salary: job.compensation || null,
      posted_at: job.liveStartAt || null,
      work_type: job.remote ? 'remote' : inferWorkType(location, description),
      requires_subscription: 0,
      subscription_hint: null,
    }
  })
}

// Shared work type inference (duplicated from jobs.js for independence)
function inferWorkType(location, description) {
  const text = `${location || ''} ${description || ''}`.toLowerCase()
  if (/\bhybrid\b/.test(text)) return 'hybrid'
  if (/\bon.?site\b|\bin.?office\b|\bin.?person\b|\boffice.?based\b/.test(text)) return 'onsite'
  if (/\bremote\b|\bwork.?from.?home\b|\bwfh\b|\bfully.?distributed\b/.test(text)) return 'remote'
  return 'unknown'
}

// Dispatch to correct ATS fetcher
async function fetchJobsForCompany(company) {
  switch (company.ats_type) {
    case 'greenhouse': return fetchGreenhouseJobs(company.ats_slug)
    case 'lever':      return fetchLeverJobs(company.ats_slug)
    case 'ashby':      return fetchAshbyJobs(company.ats_slug)
    case 'wellfound':  return fetchWellfoundJobs(company.ats_slug)
    default:           throw new Error(`Unknown ATS type: ${company.ats_type}`)
  }
}

// ─── Ensure table exists ──────────────────────────────────────────────────────
async function ensureTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS company_watchlist (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      company_name    TEXT NOT NULL,
      ats_type        TEXT DEFAULT 'greenhouse',
      ats_slug        TEXT NOT NULL,
      website_url     TEXT,
      last_scanned_at TEXT,
      is_active       INTEGER DEFAULT 1,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, ats_type, ats_slug)
    )
  `).run()
}

// ─── GET /companies/watchlist ─────────────────────────────────────────────────
companyRoutes.get('/watchlist', async (c) => {
  const userId = c.get('userId')
  await ensureTable(c.env.DB)
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM company_watchlist WHERE user_id = ? AND is_active = 1 ORDER BY company_name ASC'
  ).bind(userId).all()
  return c.json({ companies: results })
})

// ─── POST /companies/watchlist ────────────────────────────────────────────────
companyRoutes.post('/watchlist', async (c) => {
  const userId = c.get('userId')
  const { company_name, ats_type = 'greenhouse', ats_slug, website_url } = await c.req.json()

  if (!company_name || !ats_slug) {
    return c.json({ error: 'company_name and ats_slug are required' }, 400)
  }

  await ensureTable(c.env.DB)

  const id = generateId()
  try {
    await c.env.DB.prepare(
      `INSERT INTO company_watchlist (id, user_id, company_name, ats_type, ats_slug, website_url)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, company_name, ats_type, ats_slug, website_url || null).run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'This company is already in your watchlist' }, 409)
    }
    throw e
  }

  return c.json({ success: true, company: { id, company_name, ats_type, ats_slug, website_url } })
})

// ─── DELETE /companies/watchlist/:id ─────────────────────────────────────────
companyRoutes.delete('/watchlist/:id', async (c) => {
  const userId = c.get('userId')
  await c.env.DB.prepare(
    'UPDATE company_watchlist SET is_active = 0 WHERE id = ? AND user_id = ?'
  ).bind(c.req.param('id'), userId).run()
  return c.json({ success: true })
})

// ─── POST /companies/scan ─────────────────────────────────────────────────────
// Scan all companies in user's watchlist and insert new jobs
companyRoutes.post('/scan', async (c) => {
  const userId = c.get('userId')
  await ensureTable(c.env.DB)

  const { results: companies } = await c.env.DB.prepare(
    'SELECT * FROM company_watchlist WHERE user_id = ? AND is_active = 1'
  ).bind(userId).all()

  if (!companies.length) {
    return c.json({ message: 'No companies in watchlist. Add some first!', new_jobs: 0 })
  }

  const results = await Promise.allSettled(
    companies.map(company => fetchJobsForCompany(company))
  )

  let totalNew = 0
  const summary = []

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i]
    const result = results[i]

    if (result.status === 'rejected') {
      summary.push({ company: company.company_name, status: 'error', error: result.reason?.message })
      continue
    }

    const jobs = result.value || []
    let newCount = 0

    for (const job of jobs) {
      // Override company name with the user-provided name (slug may differ)
      job.company = company.company_name

      const id = generateId()
      const insert = await c.env.DB.prepare(
        `INSERT OR IGNORE INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, work_type, requires_subscription, subscription_hint, status, posted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
      ).bind(
        id, userId, job.source, job.external_id,
        job.title, job.company, job.location, job.url, job.description,
        job.work_type || 'unknown', job.requires_subscription || 0, job.subscription_hint || null,
        job.posted_at || null
      ).run()

      if (insert.meta?.changes > 0) newCount++
    }

    totalNew += newCount

    // Update last_scanned_at
    await c.env.DB.prepare(
      "UPDATE company_watchlist SET last_scanned_at = datetime('now') WHERE id = ?"
    ).bind(company.id).run()

    summary.push({ company: company.company_name, status: 'ok', total: jobs.length, new: newCount })
  }

  // Enqueue scoring for new jobs (up to 10)
  if (totalNew > 0 && c.env.JOB_QUEUE) {
    const { results: unscoredJobs } = await c.env.DB.prepare(
      `SELECT id FROM jobs WHERE user_id = ? AND status = 'new' AND fit_score IS NULL ORDER BY created_at DESC LIMIT 10`
    ).bind(userId).all()

    for (const job of unscoredJobs) {
      await c.env.JOB_QUEUE.send({ type: 'SCORE_JOB', userId, jobId: job.id }).catch(() => {})
    }
  }

  return c.json({
    new_jobs: totalNew,
    summary,
    message: `Scanned ${companies.length} companies — found ${totalNew} new job${totalNew !== 1 ? 's' : ''}`,
  })
})

// ─── POST /companies/scan/:id ─────────────────────────────────────────────────
// Scan a single company
companyRoutes.post('/scan/:id', async (c) => {
  const userId = c.get('userId')
  const company = await c.env.DB.prepare(
    'SELECT * FROM company_watchlist WHERE id = ? AND user_id = ? AND is_active = 1'
  ).bind(c.req.param('id'), userId).first()

  if (!company) return c.json({ error: 'Company not found' }, 404)

  let jobs
  try {
    jobs = await fetchJobsForCompany(company)
  } catch (e) {
    return c.json({ error: `Scan failed: ${e.message}` }, 500)
  }

  let newCount = 0
  for (const job of jobs) {
    job.company = company.company_name
    const id = generateId()
    const insert = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO jobs
       (id, user_id, source, external_id, title, company, location, url, description, work_type, requires_subscription, subscription_hint, status, posted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
    ).bind(
      id, userId, job.source, job.external_id,
      job.title, job.company, job.location, job.url, job.description,
      job.work_type || 'unknown', 0, null, job.posted_at || null
    ).run()
    if (insert.meta?.changes > 0) newCount++
  }

  await c.env.DB.prepare(
    "UPDATE company_watchlist SET last_scanned_at = datetime('now') WHERE id = ?"
  ).bind(company.id).run()

  return c.json({
    new_jobs: newCount,
    total_found: jobs.length,
    message: `Found ${jobs.length} jobs at ${company.company_name} (${newCount} new)`,
  })
})

// ─── GET /companies/ats-types ─────────────────────────────────────────────────
// Returns known ATS types and example slugs for the UI
companyRoutes.get('/ats-types', async (c) => {
  return c.json({
    types: [
      { value: 'greenhouse', label: 'Greenhouse', example: 'stripe, airbnb, figma, notion' },
      { value: 'lever',      label: 'Lever',      example: 'netflix, coinbase, duolingo' },
      { value: 'ashby',      label: 'Ashby',      example: 'vercel, linear, loom, retool' },
      { value: 'wellfound',  label: 'Wellfound',  example: 'company URL slug' },
    ]
  })
})
