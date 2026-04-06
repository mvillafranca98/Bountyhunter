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

// GET /dashboard/analytics — application performance stats
dashboardRoutes.get('/analytics', async (c) => {
  const userId = c.get('userId')

  const [totalApplied, avgFitApplied, blockerReasons, sourceBreakdown] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM applications WHERE user_id = ?').bind(userId).first(),
    c.env.DB.prepare(
      `SELECT AVG(j.fit_score) as avg_fit FROM applications a JOIN jobs j ON a.job_id = j.id WHERE a.user_id = ?`
    ).bind(userId).first(),
    c.env.DB.prepare(
      'SELECT reason, COUNT(*) as count FROM blockers WHERE user_id = ? GROUP BY reason ORDER BY count DESC'
    ).bind(userId).all(),
    c.env.DB.prepare(
      `SELECT j.source, COUNT(*) as count FROM applications a JOIN jobs j ON a.job_id = j.id
       WHERE a.user_id = ? GROUP BY j.source`
    ).bind(userId).all(),
  ])

  return c.json({
    total_applied: totalApplied?.count || 0,
    avg_fit_score_on_applied: avgFitApplied?.avg_fit ? Math.round(avgFitApplied.avg_fit) : null,
    blocker_reasons: blockerReasons.results,
    applications_by_source: sourceBreakdown.results,
  })
})
