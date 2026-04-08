import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { authRoutes } from './routes/auth.js'
import { profileRoutes } from './routes/profile.js'
import { resumeRoutes } from './routes/resume.js'
import { jobRoutes } from './routes/jobs.js'
import { applicationRoutes } from './routes/applications.js'
import { questionRoutes } from './routes/questions.js'
import { dashboardRoutes } from './routes/dashboard.js'
import { storageRoutes } from './routes/storage.js'
import { alertRoutes } from './routes/alerts.js'
import { companyRoutes } from './routes/companies.js'
import { handleQueue } from './queue.js'
import { ensureSavedSearchesTable } from './lib/savedSearches.js'

const app = new Hono()

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: (origin, c) => {
    const allowed = [
      'http://localhost:5173',
      'http://localhost:5175',
      'https://bountyhunter.pages.dev',
      'https://bountyhunter-18j.pages.dev',
      'https://bountyhunter-app.a-mencias99.workers.dev',
      c.env?.CORS_ORIGIN,
    ].filter(Boolean)
    return allowed.includes(origin) ? origin : allowed[0]
  },
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 86400,
}))

// ─── Routes ────────────────────────────────────────────────────────────────────
app.route('/auth', authRoutes)
app.route('/profile', profileRoutes)
app.route('/resume', resumeRoutes)
app.route('/jobs', jobRoutes)
app.route('/applications', applicationRoutes)
app.route('/questions', questionRoutes)
app.route('/dashboard', dashboardRoutes)
app.route('/storage', storageRoutes)
app.route('/alerts', alertRoutes)
app.route('/companies', companyRoutes)

app.get('/health', (c) => c.json({ status: 'ok', env: c.env?.ENVIRONMENT || 'unknown' }))

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message || 'Internal server error' }, 500)
})

// ─── Export ────────────────────────────────────────────────────────────────────
export default {
  fetch: app.fetch,
  queue: handleQueue,
  async scheduled(event, env, ctx) {
    const db = env.DB
    await ensureSavedSearchesTable(db)

    // ── Saved search alerts ────────────────────────────────────────────────────
    const alerts = await db.prepare(
      'SELECT * FROM saved_searches WHERE is_active = 1'
    ).all()

    for (const alert of alerts.results || []) {
      await env.JOB_QUEUE.send({
        type: 'SEARCH_JOBS',
        userId: alert.user_id,
        keywords: alert.keywords,
        source: 'all',
      })
      await db.prepare(
        "UPDATE saved_searches SET last_run_at = datetime('now') WHERE id = ?"
      ).bind(alert.id).run()
    }

    // ── Company watchlist scan (Greenhouse / Lever / Ashby) ───────────────────
    try {
      const { results: watchlistRows } = await db.prepare(
        `SELECT DISTINCT user_id FROM company_watchlist WHERE is_active = 1`
      ).all()

      for (const row of watchlistRows || []) {
        const { results: companies } = await db.prepare(
          'SELECT * FROM company_watchlist WHERE user_id = ? AND is_active = 1'
        ).bind(row.user_id).all()

        for (const company of companies) {
          // Enqueue per-company scan so slow fetches don't block the cron
          await env.JOB_QUEUE.send({
            type: 'SCAN_COMPANY',
            userId: row.user_id,
            companyId: company.id,
          }).catch(() => {})
        }
      }
      console.log(`Cron: queued watchlist scans for ${(watchlistRows || []).length} users`)
    } catch (e) {
      // Table may not exist yet on first deploy — non-fatal
      console.warn('Cron watchlist scan skipped:', e.message)
    }

    console.log(`Cron: processed ${(alerts.results || []).length} job alerts`)
  },
}
