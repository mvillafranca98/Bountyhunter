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
    const status = (job.fit_score || 0) >= 60 ? 'scored' : 'low_fit'
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
  return (json.jobs || []).slice(0, 5).map(job => {
    const location = job.candidate_required_location || ''
    const description = cleanDescription(job.description)
    const { requires_subscription, subscription_hint } = detectSubscription('remotive', job.url, description)
    return {
      title: job.title,
      company: job.company_name,
      location,
      url: job.url || `https://remotive.com/remote-jobs/${job.id}`,
      description,
      source: 'remotive',
      external_id: String(job.id),
      salary: job.salary || null,
      posted_at: job.publication_date || null,
      work_type: inferWorkType(location, description),
      requires_subscription,
      subscription_hint,
    }
  })
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
    const location = parts.join(', ')
    const description = cleanDescription(job.job_description)
    const { requires_subscription, subscription_hint } = detectSubscription('jsearch', job.job_apply_link, description)
    return {
      title: job.job_title,
      company: job.employer_name,
      location,
      url: job.job_apply_link,
      description,
      source: 'jsearch',
      external_id: job.job_id,
      salary: job.job_min_salary && job.job_max_salary
        ? `${job.job_min_salary}-${job.job_max_salary}`
        : null,
      posted_at: job.job_posted_at_datetime_utc || null,
      work_type: inferWorkType(location, description),
      requires_subscription,
      subscription_hint,
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
  return filtered.slice(0, 5).map(job => {
    const location = job.location || ''
    const description = cleanDescription(job.description)
    const { requires_subscription, subscription_hint } = detectSubscription('arbeitnow', job.url, description)
    return {
      title: job.title,
      company: job.company_name,
      location,
      url: job.url || `https://www.arbeitnow.com/view/${job.slug}`,
      description,
      source: 'arbeitnow',
      external_id: job.slug,
      salary: null,
      posted_at: job.created_at || null,
      work_type: inferWorkType(location, description),
      requires_subscription,
      subscription_hint,
    }
  })
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
    .map(job => {
      const location = job.location || 'Remote'
      const description = cleanDescription(job.description)
      const { requires_subscription, subscription_hint } = detectSubscription('remoteok', job.url, description)
      return {
        title: job.position,
        company: job.company,
        location,
        url: job.url || `https://remoteok.com/l/${job.id}`,
        description,
        source: 'remoteok',
        external_id: String(job.id),
        salary: job.salary_min && job.salary_max ? `$${job.salary_min}-$${job.salary_max}` : null,
        posted_at: job.date || null,
        work_type: 'remote',
        requires_subscription,
        subscription_hint,
      }
    })
}

// ─── Helper: fetch from The Muse (free, no key) ─────────────────────────────
async function fetchTheMuse(keywords) {
  const res = await fetch(
    `https://www.themuse.com/api/public/jobs?page=1&descending=true&category=${encodeURIComponent(keywords)}`
  )
  if (!res.ok) throw new Error(`The Muse API returned ${res.status}`)
  const json = await res.json()
  return (json.results || []).slice(0, 5).map(job => {
    const location = (job.locations || []).map(l => l.name).join(', ') || 'Various'
    const description = cleanDescription(job.contents)
    const jobUrl = job.refs?.landing_page || `https://www.themuse.com/jobs/${job.id}`
    const { requires_subscription, subscription_hint } = detectSubscription('themuse', jobUrl, description)
    return {
      title: job.name,
      company: job.company?.name || '',
      location,
      url: jobUrl,
      description,
      source: 'themuse',
      external_id: String(job.id),
      salary: null,
      posted_at: job.publication_date || null,
      work_type: inferWorkType(location, description),
      requires_subscription,
      subscription_hint,
    }
  })
}

// ─── Helper: fetch from Jobicy (free, no key) ───────────────────────────────
async function fetchJobicy(keywords) {
  const res = await fetch(
    `https://jobicy.com/api/v2/remote-jobs?count=5&tag=${encodeURIComponent(keywords)}`
  )
  if (!res.ok) throw new Error(`Jobicy API returned ${res.status}`)
  const json = await res.json()
  return (json.jobs || []).slice(0, 5).map(job => {
    const location = job.jobGeo || 'Remote'
    const description = cleanDescription(job.jobDescription)
    const { requires_subscription, subscription_hint } = detectSubscription('jobicy', job.url, description)
    return {
      title: job.jobTitle,
      company: job.companyName,
      location,
      url: job.url,
      description,
      source: 'jobicy',
      external_id: String(job.id),
      salary: job.annualSalaryMin && job.annualSalaryMax
        ? `$${job.annualSalaryMin}-$${job.annualSalaryMax}`
        : null,
      posted_at: job.pubDate || null,
      work_type: inferWorkType(location, description),
      requires_subscription,
      subscription_hint,
    }
  })
}

// ─── Helper: fetch from HackerNews "Who's Hiring" ──────────────────────────
async function fetchHackerNews(keywords) {
  try {
    // Find the latest "Who is hiring" thread
    const threadRes = await fetch(
      'https://hn.algolia.com/api/v1/search?tags=ask_hn&query=who+is+hiring&hitsPerPage=1'
    )
    if (!threadRes.ok) throw new Error(`HN thread search returned ${threadRes.status}`)
    const threadJson = await threadRes.json()
    const objectID = threadJson.hits?.[0]?.objectID
    if (!objectID) return []

    // Fetch comments from that thread
    const commentsRes = await fetch(
      `https://hn.algolia.com/api/v1/search?tags=comment,story_${objectID}&hitsPerPage=100`
    )
    if (!commentsRes.ok) throw new Error(`HN comments returned ${commentsRes.status}`)
    const commentsJson = await commentsRes.json()

    const lowerKeywords = keywords.toLowerCase().split(/[\s,]+/).filter(Boolean)

    const matched = (commentsJson.hits || []).filter(hit => {
      const text = (hit.comment_text || '').toLowerCase()
      return lowerKeywords.some(kw => text.includes(kw))
    })

    return matched.slice(0, 10).map(hit => {
      const text = hit.comment_text || ''
      const parts = text.split(/\n/)[0].split('|').map(s => s.replace(/<[^>]*>/g, '').trim())
      const company = parts[0] || 'Unknown'
      const title = parts.length > 2 ? parts[1] : 'See posting'
      const locationPart = parts.find(p => /remote/i.test(p)) || (parts.length > 2 ? parts[2] : '')
      const urlMatch = text.match(/href="([^"]+)"/) || text.match(/(https?:\/\/[^\s<"]+)/)
      const url = urlMatch ? urlMatch[1] : `https://news.ycombinator.com/item?id=${hit.objectID}`
      const location = locationPart || ''
      const description = cleanDescription(text).slice(0, 2000)
      const { requires_subscription, subscription_hint } = detectSubscription('hackernews', url, description)

      return {
        title,
        company,
        location,
        url,
        description,
        source: 'hackernews',
        external_id: String(hit.objectID),
        salary: null,
        posted_at: hit.created_at,
        work_type: inferWorkType(location, description),
        requires_subscription,
        subscription_hint,
      }
    })
  } catch (err) {
    console.error('HackerNews fetch failed:', err.message)
    return []
  }
}

// ─── Helper: fetch from Himalayas (free, no key) ───────────────────────────
async function fetchHimalayas(keywords) {
  try {
    const res = await fetch(
      `https://himalayas.app/jobs/api?limit=10&q=${encodeURIComponent(keywords)}`
    )
    if (!res.ok) throw new Error(`Himalayas API returned ${res.status}`)
    const json = await res.json()
    return (json.jobs || []).map(job => {
      const location = job.locationRestrictions?.join(', ') || 'Remote'
      const description = cleanDescription(job.description)
      const jobUrl = `https://himalayas.app/jobs/${job.slug}`
      const { requires_subscription, subscription_hint } = detectSubscription('himalayas', jobUrl, description)
      return {
        title: job.title,
        company: job.companyName,
        location,
        url: jobUrl,
        description,
        source: 'himalayas',
        external_id: String(job.id),
        salary: job.minSalary && job.maxSalary ? `$${job.minSalary}-${job.maxSalary}` : null,
        posted_at: job.pubDate || null,
        work_type: inferWorkType(location, description),
        requires_subscription,
        subscription_hint,
      }
    })
  } catch (err) {
    console.error('Himalayas fetch failed:', err.message)
    return []
  }
}

// ─── Helper: fetch from SerpAPI Google Jobs ──────────────────────────────────
async function fetchGoogleJobs(keywords, serpApiKey) {
  try {
    const res = await fetch(
      `https://serpapi.com/search.json?engine=google_jobs&q=${encodeURIComponent(keywords)}&api_key=${serpApiKey}`
    )
    if (!res.ok) throw new Error(`SerpAPI returned ${res.status}`)
    const json = await res.json()
    return (json.jobs_results || []).slice(0, 10).map(job => {
      const location = job.location
      const description = cleanDescription(job.description)
      const jobUrl = job.apply_options?.[0]?.link || job.share_link || job.related_links?.[0]?.link
      const { requires_subscription, subscription_hint } = detectSubscription('google_jobs', jobUrl, description)
      return {
        title: job.title,
        company: job.company_name,
        location,
        url: jobUrl,
        description,
        source: 'google_jobs',
        external_id: job.job_id,
        salary: job.detected_extensions?.salary || null,
        posted_at: job.detected_extensions?.posted_at || null,
        work_type: inferWorkType(location, description),
        requires_subscription,
        subscription_hint,
      }
    })
  } catch (err) {
    console.error('Google Jobs fetch failed:', err.message)
    return []
  }
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

// ─── Helper: infer work type from location + description ─────────────────────
function inferWorkType(location, description) {
  const text = `${location || ''} ${description || ''}`.toLowerCase()
  if (/\bhybrid\b/.test(text)) return 'hybrid'
  if (/\bon.?site\b|\bin.?office\b|\bin.?person\b|\boffice.?based\b|\bco.?located\b/.test(text)) return 'onsite'
  if (/\bremote\b|\bwork.?from.?home\b|\bwfh\b|\bfully.?distributed\b|\btelework\b/.test(text)) return 'remote'
  return 'unknown'
}

// ─── Helper: detect subscription/paywall requirement ─────────────────────────
function detectSubscription(source, url, description) {
  const desc = (description || '').toLowerCase()
  const urlStr = (url || '').toLowerCase()
  if (/requires.*subscription|premium.*members.*only|subscribe.*to.*view|sign up.*to.*apply|members.*only/i.test(desc)) {
    return { requires_subscription: 1, subscription_hint: 'Subscription required to apply' }
  }
  if (source === 'jsearch' && urlStr.includes('linkedin.com')) {
    if (/easy apply|apply with linkedin/i.test(desc)) {
      return { requires_subscription: 0, subscription_hint: null }
    }
    return { requires_subscription: 1, subscription_hint: 'LinkedIn account required to apply' }
  }
  return { requires_subscription: 0, subscription_hint: null }
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

  // Build source fetchers — always include free sources, add premium sources if keys available
  const hasRapidApi = c.env.RAPIDAPI_KEY && !c.env.RAPIDAPI_KEY.startsWith('REPLACE_')
  const hasSerpApi = c.env.SERPAPI_KEY && !c.env.SERPAPI_KEY.startsWith('REPLACE_')
  // Fetch user's disabled sources
  const disabledSourcesRow = await c.env.DB.prepare(
    'SELECT disabled_sources FROM user_preferences WHERE user_id = ?'
  ).bind(userId).first().catch(() => null)
  const disabledSources = disabledSourcesRow?.disabled_sources
    ? JSON.parse(disabledSourcesRow.disabled_sources)
    : []
  const isEnabled = (name) => !disabledSources.includes(name)

  const allSourceFetchers = [
    ...(hasSerpApi ? [{ name: 'google_jobs', fn: () => fetchGoogleJobs(keywords, c.env.SERPAPI_KEY) }] : []),
    { name: 'remotive', fn: () => fetchRemotive(keywords) },
    { name: 'arbeitnow', fn: () => fetchArbeitnow(keywords) },
    { name: 'remoteok', fn: () => fetchRemoteOK(keywords) },
    { name: 'themuse', fn: () => fetchTheMuse(keywords) },
    { name: 'jobicy', fn: () => fetchJobicy(keywords) },
    { name: 'hackernews', fn: () => fetchHackerNews(keywords) },
    { name: 'himalayas', fn: () => fetchHimalayas(keywords) },
    ...(hasRapidApi ? [{ name: 'jsearch', fn: () => fetchJSearch(keywords, c.env.RAPIDAPI_KEY) }] : []),
  ]
  const sourceFetchers = allSourceFetchers.filter(s => isEnabled(s.name))

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

  // Pre-filter by work type if user has a strict remote preference
  if (jobSearchPrefs?.work_style === 'remote') {
    const beforeFilter = allJobs.length
    allJobs = allJobs.filter(job => job.work_type === 'remote' || job.work_type === 'unknown')
    if (allJobs.length < beforeFilter) {
      console.log(`Work type filter: removed ${beforeFilter - allJobs.length} non-remote jobs`)
    }
  }

  // Filter out subscription jobs by default unless user has opted in
  const subscriptionFilter = body.subscriptionFilter || 'exclude'
  if (subscriptionFilter === 'exclude') {
    allJobs = allJobs.filter(job => !job.requires_subscription)
  }

  // Keyword relevance pre-filter: score each job by how many resume/search keywords appear
  // in the title + description. Keep jobs with at least 1 match to improve relevance.
  if (hasAI && parsedResume) {
    const resumeSkills = (parsedResume.skills || []).flatMap(s =>
      typeof s === 'string' ? s.toLowerCase().split(/[,/\s]+/) : []
    ).filter(s => s.length > 2)
    const resumeTitles = (parsedResume.experience || []).map(e => (e.title || '').toLowerCase())
    const searchTerms = keywords.toLowerCase().split(/[\s,]+/).filter(k => k.length > 2)
    const keywordSet = [...new Set([...resumeSkills, ...searchTerms])]

    if (keywordSet.length > 0) {
      allJobs = allJobs
        .map(job => {
          const haystack = `${job.title} ${job.description || ''}`.toLowerCase()
          const matches = keywordSet.filter(k => haystack.includes(k)).length
          return { ...job, _kwScore: matches }
        })
        .filter(job => job._kwScore > 0)
        .sort((a, b) => b._kwScore - a._kwScore)
        .slice(0, 20) // take top 20 keyword-relevant jobs for AI scoring
    }
  }

  if (!allJobs.length) {
    return c.json({ jobs: [], sources, message: `No jobs found for "${keywords}"` })
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

    // Score top 10 with Claude for better relevance filtering
    if (hasAI && i < 10) {
      try {
        const result = await scoreJobFit(c.env.ANTHROPIC_API_KEY, job.description || job.title, parsedResume, userPrefs, jobSearchPrefs)
        fitScore = result.score
        fitReasoning = JSON.stringify(result)
        status = result.score >= 60 ? 'scored' : 'low_fit'
      } catch (e) {
        console.error(`Scoring failed for job ${job.title}: ${e.message}`)
      }
    }

    // Skip low_fit jobs from AI scoring — only insert relevant results
    if (status === 'low_fit') continue

    stmts.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO jobs
         (id, user_id, source, external_id, title, company, location, url, description, fit_score, fit_reasoning, status, work_type, requires_subscription, subscription_hint)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, userId, job.source, job.external_id,
        job.title, job.company,
        job.location,
        job.url,
        job.description,
        fitScore, fitReasoning, status,
        job.work_type || 'unknown',
        job.requires_subscription || 0,
        job.subscription_hint || null
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
      work_type: job.work_type || 'unknown',
      requires_subscription: job.requires_subscription || 0,
      subscription_hint: job.subscription_hint || null,
    })
  }

  if (stmts.length) await c.env.DB.batch(stmts)

  // Build summary message
  const okSources = sources.filter(s => s.status === 'ok' && s.count > 0)
  const displayNames = { google_jobs: 'Google Jobs', jsearch: 'Indeed/LinkedIn', remoteok: 'RemoteOK', themuse: 'The Muse', jobicy: 'Jobicy', hackernews: 'HackerNews', himalayas: 'Himalayas' }
  const sourceNames = okSources.map(s => displayNames[s.name] || s.name.charAt(0).toUpperCase() + s.name.slice(1))
  const sourceMsg = sourceNames.length ? ` from ${sourceNames.join(', ')}` : ''

  return c.json({
    jobs: insertedJobs,
    count: insertedJobs.length,
    scored: hasAI,
    sources,
    message: `Found ${insertedJobs.length} relevant jobs${sourceMsg} for "${keywords}"${hasAI ? ' (AI-scored, low-fit filtered)' : ''}!`,
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

  const workType = c.req.query('work_type')       // remote | hybrid | onsite
  const showSubscription = c.req.query('subscription') // 'include' or undefined (default: exclude)

  if (workType) {
    query += ' AND work_type = ?'
    bindings.push(workType)
  }

  if (showSubscription !== 'include') {
    query += ' AND (requires_subscription = 0 OR requires_subscription IS NULL)'
  }

  const createdAfter = c.req.query('created_after')
  if (createdAfter) {
    query += ' AND created_at >= ?'
    bindings.push(createdAfter)
  }

  const postedAfter = c.req.query('posted_after')
  if (postedAfter) {
    query += ' AND posted_at >= ?'
    bindings.push(postedAfter)
  }

  const search = c.req.query('search')
  if (search) {
    query += ' AND (LOWER(title) LIKE ? OR LOWER(company) LIKE ?)'
    const term = `%${search.toLowerCase()}%`
    bindings.push(term, term)
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

  // Count total matching rows for pagination
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
  const countResult = await c.env.DB.prepare(countQuery).bind(...bindings).first()
  const total = countResult?.total ?? 0

  query += ' LIMIT ? OFFSET ?'
  bindings.push(limit, offset)

  const { results } = await c.env.DB.prepare(query).bind(...bindings).all()

  return c.json({
    total,
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
    status = result.score >= 60 ? 'scored' : 'low_fit'
  } catch (e) {
    console.error('Scoring failed:', e.message)
    // Continue without scoring
  }

  // 5. Insert into database
  const id = generateId()
  const externalId = 'url_' + url.replace(/[^a-zA-Z0-9]/g, '').slice(0, 100)
  const importedWorkType = jobData.remote === true ? 'remote' : inferWorkType(jobData.location, jobData.description)

  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO jobs
     (id, user_id, source, external_id, title, company, location, url, description, fit_score, fit_reasoning, status, work_type)
     VALUES (?, ?, 'manual', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId, externalId,
    jobData.title || 'Untitled Position',
    jobData.company || 'Unknown Company',
    jobData.location || '',
    url,
    (jobData.description || '').slice(0, 4000),
    fitScore, fitReasoning, status, importedWorkType
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
      work_type: importedWorkType,
    },
    message: `Imported "${jobData.title}" at ${jobData.company}${fitScore ? ` — ${fitScore}% fit` : ''}`
  })
})

// GET /jobs/:id/notes — get notes for a job
jobRoutes.get('/:id/notes', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await c.env.DB.exec(`CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY,
    job_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`)
  const notes = await c.env.DB.prepare(
    'SELECT * FROM job_notes WHERE job_id = ? AND user_id = ? ORDER BY created_at DESC'
  ).bind(id, userId).all()
  return c.json({ notes: notes.results })
})

// POST /jobs/:id/notes — add a note
jobRoutes.post('/:id/notes', async (c) => {
  const userId = c.get('userId')
  const jobId = c.req.param('id')
  const { content } = await c.req.json()
  if (!content?.trim()) return c.json({ error: 'Note content is required' }, 400)

  await c.env.DB.exec(`CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY, job_id TEXT NOT NULL, user_id TEXT NOT NULL,
    content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  )`)

  const id = crypto.randomUUID()
  await c.env.DB.prepare(
    'INSERT INTO job_notes (id, job_id, user_id, content) VALUES (?, ?, ?, ?)'
  ).bind(id, jobId, userId, content.trim()).run()

  return c.json({ success: true, note: { id, job_id: jobId, content: content.trim(), created_at: new Date().toISOString() } })
})

// DELETE /jobs/:id/notes/:noteId — delete a note
jobRoutes.delete('/:id/notes/:noteId', async (c) => {
  const userId = c.get('userId')
  const noteId = c.req.param('noteId')
  await c.env.DB.prepare(
    'DELETE FROM job_notes WHERE id = ? AND user_id = ?'
  ).bind(noteId, userId).run()
  return c.json({ success: true })
})

// GET /jobs/:id/timeline — get status history
jobRoutes.get('/:id/timeline', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  // Build timeline from multiple sources
  const timeline = []

  // Job creation
  const job = await c.env.DB.prepare(
    'SELECT created_at, status, title FROM jobs WHERE id = ? AND user_id = ?'
  ).bind(id, userId).first()
  if (job) {
    timeline.push({ type: 'created', date: job.created_at, detail: `Found: ${job.title}` })
  }

  // Resume versions (prepare events)
  const versions = await c.env.DB.prepare(
    'SELECT created_at FROM resume_versions WHERE job_id = ? AND user_id = ? ORDER BY created_at'
  ).bind(id, userId).all()
  for (const v of versions.results || []) {
    timeline.push({ type: 'prepared', date: v.created_at, detail: 'Resume tailored' })
  }

  // Applications
  const apps = await c.env.DB.prepare(
    'SELECT created_at, status FROM applications WHERE job_id = ? AND user_id = ? ORDER BY created_at'
  ).bind(id, userId).all()
  for (const a of apps.results || []) {
    timeline.push({ type: 'applied', date: a.created_at, detail: `Applied (${a.status})` })
  }

  // Notes
  await c.env.DB.exec(`CREATE TABLE IF NOT EXISTS job_notes (
    id TEXT PRIMARY KEY, job_id TEXT NOT NULL, user_id TEXT NOT NULL,
    content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
  )`)
  const notes = await c.env.DB.prepare(
    'SELECT created_at, content FROM job_notes WHERE job_id = ? AND user_id = ? ORDER BY created_at'
  ).bind(id, userId).all()
  for (const n of notes.results || []) {
    timeline.push({ type: 'note', date: n.created_at, detail: n.content.slice(0, 100) })
  }

  // Sort by date descending
  timeline.sort((a, b) => new Date(b.date) - new Date(a.date))

  return c.json({ timeline })
})

// DELETE /jobs?filter=flagged  — bulk delete all flagged jobs for the user
// DELETE /jobs?created_before=DATE — bulk delete jobs created on or before DATE
jobRoutes.delete('/', async (c) => {
  const userId = c.get('userId')
  const filter = c.req.query('filter')
  const createdBefore = c.req.query('created_before')

  if (filter === 'flagged') {
    const result = await c.env.DB.prepare(
      "DELETE FROM jobs WHERE user_id = ? AND status = 'flagged'"
    ).bind(userId).run()
    return c.json({ deleted: result.meta?.changes ?? 0 })
  }

  if (createdBefore) {
    const result = await c.env.DB.prepare(
      'DELETE FROM jobs WHERE user_id = ? AND created_at <= ?'
    ).bind(userId, createdBefore).run()
    return c.json({ deleted: result.meta?.changes ?? 0 })
  }

  return c.json({ error: 'Provide filter=flagged or created_before=DATE' }, 400)
})

// DELETE /jobs/:id — hard delete a single job
jobRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')

  const result = await c.env.DB.prepare(
    'DELETE FROM jobs WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()

  if (!result.meta?.changes) return c.json({ error: 'Not found' }, 404)
  return c.json({ success: true })
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
