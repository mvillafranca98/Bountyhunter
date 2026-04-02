import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'

export const profileRoutes = new Hono()
profileRoutes.use('*', requireAuth)

// GET /profile
profileRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const user = await c.env.DB.prepare(
    `SELECT id, email, first_name, last_name, phone, location, linkedin_url,
            work_authorization, start_date, employment_type, auto_apply, fit_threshold, onboarding_step
     FROM users WHERE id = ?`
  ).bind(userId).first()

  const salary = await c.env.DB.prepare(
    'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
  ).bind(userId).first()

  const roles = await c.env.DB.prepare(
    'SELECT * FROM target_roles WHERE user_id = ? ORDER BY priority'
  ).bind(userId).all()

  return c.json({ user, salary: salary || null, target_roles: roles.results })
})

// PUT /profile — update basic info + preferences
profileRoutes.put('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json()
  const {
    first_name, last_name, phone, location, linkedin_url,
    work_authorization, start_date, employment_type,
    auto_apply, fit_threshold, onboarding_step
  } = body

  await c.env.DB.prepare(
    `UPDATE users SET
       first_name = COALESCE(?, first_name),
       last_name = COALESCE(?, last_name),
       phone = COALESCE(?, phone),
       location = COALESCE(?, location),
       linkedin_url = COALESCE(?, linkedin_url),
       work_authorization = COALESCE(?, work_authorization),
       start_date = COALESCE(?, start_date),
       employment_type = COALESCE(?, employment_type),
       auto_apply = COALESCE(?, auto_apply),
       fit_threshold = COALESCE(?, fit_threshold),
       onboarding_step = COALESCE(?, onboarding_step),
       updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    first_name ?? null, last_name ?? null, phone ?? null, location ?? null, linkedin_url ?? null,
    work_authorization ?? null, start_date ?? null, employment_type ?? null,
    auto_apply !== undefined ? (auto_apply ? 1 : 0) : null,
    fit_threshold ?? null, onboarding_step ?? null, userId
  ).run()

  return c.json({ success: true })
})

// PUT /profile/salary
profileRoutes.put('/salary', async (c) => {
  const userId = c.get('userId')
  const { min_hourly, max_hourly, min_yearly, max_yearly, preferred_type, currency } = await c.req.json()

  const existing = await c.env.DB.prepare(
    'SELECT id FROM salary_preferences WHERE user_id = ?'
  ).bind(userId).first()

  if (existing) {
    await c.env.DB.prepare(
      `UPDATE salary_preferences SET
         min_hourly = ?, max_hourly = ?, min_yearly = ?, max_yearly = ?,
         preferred_type = COALESCE(?, preferred_type),
         currency = COALESCE(?, currency)
       WHERE user_id = ?`
    ).bind(min_hourly ?? null, max_hourly ?? null, min_yearly ?? null, max_yearly ?? null, preferred_type ?? null, currency ?? null, userId).run()
  } else {
    await c.env.DB.prepare(
      `INSERT INTO salary_preferences (id, user_id, min_hourly, max_hourly, min_yearly, max_yearly, preferred_type, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), userId, min_hourly, max_hourly, min_yearly, max_yearly, preferred_type || 'yearly', currency || 'USD').run()
  }

  return c.json({ success: true })
})

// PUT /profile/roles — replace target roles
profileRoutes.put('/roles', async (c) => {
  const userId = c.get('userId')
  const { roles } = await c.req.json() // [{ role_title, industry, priority }]

  await c.env.DB.prepare('DELETE FROM target_roles WHERE user_id = ?').bind(userId).run()

  const stmts = (roles || []).map((r, i) =>
    c.env.DB.prepare(
      'INSERT INTO target_roles (id, user_id, role_title, industry, priority) VALUES (?, ?, ?, ?, ?)'
    ).bind(generateId(), userId, r.role_title, r.industry || null, r.priority || i + 1)
  )

  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ success: true })
})
