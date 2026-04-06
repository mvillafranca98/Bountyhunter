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
import { handleQueue } from './queue.js'

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
}
