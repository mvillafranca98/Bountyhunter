import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { analyzeSkillsGap } from '../lib/claude.js'

export const dashboardRoutes = new Hono()
dashboardRoutes.use('*', requireAuth)

// GET /dashboard/summary — main dashboard data
dashboardRoutes.get('/summary', async (c) => {
  const userId = c.get('userId')

  const [statusCounts, recentApplications, recentBlockers, topJobs] = await Promise.all([
    // Job counts by status
    c.env.DB.prepare(
      'SELECT status, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY status'
    ).bind(userId).all(),

    // 5 most recent applications
    c.env.DB.prepare(
      `SELECT a.id, a.applied_at, a.method, j.title, j.company, j.url, j.fit_score, j.source
       FROM applications a JOIN jobs j ON a.job_id = j.id
       WHERE a.user_id = ? ORDER BY a.applied_at DESC LIMIT 5`
    ).bind(userId).all(),

    // 5 most recent blockers
    c.env.DB.prepare(
      `SELECT b.id, b.reason, b.reason_detail, b.created_at, j.title, j.company, j.url, j.fit_score
       FROM blockers b JOIN jobs j ON b.job_id = j.id
       WHERE b.user_id = ? ORDER BY b.created_at DESC LIMIT 5`
    ).bind(userId).all(),

    // Top 5 scored jobs ready to apply (newest first)
    c.env.DB.prepare(
      `SELECT id, title, company, location, url, fit_score, status, salary_min, salary_max, salary_type, posted_at, created_at
       FROM jobs WHERE user_id = ? AND status IN ('scored', 'ready') AND fit_score >= 70
       ORDER BY created_at DESC LIMIT 5`
    ).bind(userId).all(),
  ])

  const counts = { new: 0, scored: 0, ready: 0, applied: 0, needs_manual: 0, expired: 0, low_fit: 0, failed: 0 }
  statusCounts.results.forEach(r => { counts[r.status] = r.count })

  return c.json({
    counts,
    recent_applications: recentApplications.results,
    recent_blockers: recentBlockers.results,
    top_jobs: topJobs.results,
  })
})

// GET /dashboard/pipeline — full pipeline view (all statuses)
dashboardRoutes.get('/pipeline', async (c) => {
  const userId = c.get('userId')

  const statuses = ['ready', 'scored', 'applied', 'needs_manual', 'expired', 'low_fit']
  const results = {}

  await Promise.all(statuses.map(async (status) => {
    const { results: rows } = await c.env.DB.prepare(
      `SELECT id, title, company, location, url, fit_score, status, salary_min, salary_max,
              salary_type, posted_at, updated_at
       FROM jobs WHERE user_id = ? AND status = ?
       ORDER BY fit_score DESC, updated_at DESC LIMIT 25`
    ).bind(userId, status).all()
    results[status] = rows
  }))

  return c.json({ pipeline: results })
})

// GET /dashboard/skills-gap — AI analysis of missing skills
dashboardRoutes.get('/skills-gap', async (c) => {
  const userId = c.get('userId')

  const resume = await c.env.DB.prepare(
    'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()

  if (!resume?.parsed_data) {
    return c.json({ error: 'Upload a resume first to get skills gap analysis' }, 400)
  }

  const { results: jobs } = await c.env.DB.prepare(
    'SELECT description FROM jobs WHERE user_id = ? AND description IS NOT NULL LIMIT 30'
  ).bind(userId).all()

  if (jobs.length < 3) {
    return c.json({ error: 'Run at least one job search to get skills gap analysis' }, 400)
  }

  const parsedResume = JSON.parse(resume.parsed_data)
  const analysis = await analyzeSkillsGap(c.env.ANTHROPIC_API_KEY, jobs, parsedResume)

  return c.json({ analysis })
})

// GET /dashboard/analytics — job search analytics
dashboardRoutes.get('/analytics', async (c) => {
  const userId = c.get('userId')

  // Total jobs by status
  const statusCounts = await c.env.DB.prepare(
    'SELECT status, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY status'
  ).bind(userId).all()

  // Total jobs by source
  const sourceCounts = await c.env.DB.prepare(
    'SELECT source, COUNT(*) as count FROM jobs WHERE user_id = ? GROUP BY source'
  ).bind(userId).all()

  // Average fit score
  const avgScore = await c.env.DB.prepare(
    'SELECT AVG(fit_score) as avg_score, MAX(fit_score) as max_score, MIN(fit_score) as min_score FROM jobs WHERE user_id = ? AND fit_score IS NOT NULL'
  ).bind(userId).first()

  // Applications count
  const appCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as total FROM applications WHERE user_id = ?'
  ).bind(userId).first()

  // Jobs added per week (last 4 weeks)
  const weeklyJobs = await c.env.DB.prepare(
    `SELECT strftime('%Y-W%W', created_at) as week, COUNT(*) as count
     FROM jobs WHERE user_id = ? AND created_at > datetime('now', '-28 days')
     GROUP BY week ORDER BY week`
  ).bind(userId).all()

  // Score distribution (buckets: 0-25, 26-50, 51-75, 76-100)
  const scoreDist = await c.env.DB.prepare(
    `SELECT
       SUM(CASE WHEN fit_score BETWEEN 0 AND 25 THEN 1 ELSE 0 END) as low,
       SUM(CASE WHEN fit_score BETWEEN 26 AND 50 THEN 1 ELSE 0 END) as medium_low,
       SUM(CASE WHEN fit_score BETWEEN 51 AND 75 THEN 1 ELSE 0 END) as medium_high,
       SUM(CASE WHEN fit_score BETWEEN 76 AND 100 THEN 1 ELSE 0 END) as high
     FROM jobs WHERE user_id = ? AND fit_score IS NOT NULL`
  ).bind(userId).first()

  // Top companies (most jobs from)
  const topCompanies = await c.env.DB.prepare(
    'SELECT company, COUNT(*) as count, AVG(fit_score) as avg_score FROM jobs WHERE user_id = ? AND company IS NOT NULL GROUP BY company ORDER BY count DESC LIMIT 5'
  ).bind(userId).all()

  return c.json({
    status_breakdown: statusCounts.results,
    source_breakdown: sourceCounts.results,
    score_stats: {
      average: Math.round(avgScore?.avg_score || 0),
      highest: avgScore?.max_score || 0,
      lowest: avgScore?.min_score || 0,
    },
    applications_total: appCount?.total || 0,
    weekly_activity: weeklyJobs.results,
    score_distribution: {
      '0-25': scoreDist?.low || 0,
      '26-50': scoreDist?.medium_low || 0,
      '51-75': scoreDist?.medium_high || 0,
      '76-100': scoreDist?.high || 0,
    },
    top_companies: topCompanies.results,
  })
})
