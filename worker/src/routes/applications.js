import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'

export const applicationRoutes = new Hono()
applicationRoutes.use('*', requireAuth)

// POST /applications/:jobId — manually mark a job as applied (or trigger auto-apply)
applicationRoutes.post('/:jobId', async (c) => {
  const userId = c.get('userId')
  const jobId = c.req.param('jobId')
  const { resume_version_id, cover_letter, method = 'manual', auto_apply = false } = await c.req.json()

  const job = await c.env.DB.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').bind(jobId, userId).first()
  if (!job) return c.json({ error: 'Job not found' }, 404)

  if (auto_apply) {
    // Enqueue to Playwright service via Cloudflare Queue
    await c.env.JOB_QUEUE.send({
      type: 'AUTO_APPLY',
      userId,
      jobId,
      jobUrl: job.url,
      resume_version_id,
      cover_letter,
    })
    return c.json({ queued: true, message: 'Auto-apply queued — check back in a few minutes.' })
  }

  // Manual application record
  const appId = generateId()
  await c.env.DB.prepare(
    `INSERT INTO applications (id, job_id, user_id, resume_version_id, cover_letter, method)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(appId, jobId, userId, resume_version_id || null, cover_letter || null, method).run()

  await c.env.DB.prepare(
    "UPDATE jobs SET status = 'applied', updated_at = datetime('now') WHERE id = ?"
  ).bind(jobId).run()

  return c.json({ id: appId }, 201)
})

// GET /applications — list all submitted applications
applicationRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const limit = parseInt(c.req.query('limit') || '50')

  const { results } = await c.env.DB.prepare(
    `SELECT a.*, j.title, j.company, j.url, j.fit_score, j.source
     FROM applications a
     JOIN jobs j ON a.job_id = j.id
     WHERE a.user_id = ?
     ORDER BY a.applied_at DESC
     LIMIT ?`
  ).bind(userId, limit).all()

  return c.json({ applications: results })
})

// GET /applications/blockers — jobs that couldn't be auto-applied
applicationRoutes.get('/blockers', async (c) => {
  const userId = c.get('userId')

  const { results } = await c.env.DB.prepare(
    `SELECT b.*, j.title, j.company, j.url, j.fit_score
     FROM blockers b
     JOIN jobs j ON b.job_id = j.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`
  ).bind(userId).all()

  return c.json({ blockers: results })
})
