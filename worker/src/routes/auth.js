import { Hono } from 'hono'
import { hashPassword, verifyPassword, signJWT, generateId } from '../lib/crypto.js'

export const authRoutes = new Hono()

// POST /auth/register
authRoutes.post('/register', async (c) => {
  const { email, password, first_name, last_name } = await c.req.json()

  if (!email || !password || !first_name || !last_name) {
    return c.json({ error: 'email, password, first_name, last_name are required' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first()
  if (existing) return c.json({ error: 'Email already registered' }, 409)

  const id = generateId()
  const password_hash = await hashPassword(password)

  await c.env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, email.toLowerCase(), password_hash, first_name, last_name).run()

  const token = await signJWT(
    { sub: id, email: email.toLowerCase(), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET
  )

  return c.json({ token, user: { id, email: email.toLowerCase(), first_name, last_name, onboarding_step: 0 } }, 201)
})

// POST /auth/login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json()
  if (!email || !password) return c.json({ error: 'email and password required' }, 400)

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, first_name, last_name, onboarding_step FROM users WHERE email = ?'
  ).bind(email.toLowerCase()).first()

  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.password_hash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJWT(
    { sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 },
    c.env.JWT_SECRET
  )

  return c.json({
    token,
    user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, onboarding_step: user.onboarding_step }
  })
})

// GET /auth/me
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return c.json({ error: 'Unauthorized' }, 401)
  const { verifyJWT } = await import('../lib/crypto.js')
  try {
    const payload = await verifyJWT(authHeader.slice(7), c.env.JWT_SECRET)
    const user = await c.env.DB.prepare(
      'SELECT id, email, first_name, last_name, phone, location, linkedin_url, work_authorization, start_date, employment_type, auto_apply, fit_threshold, onboarding_step FROM users WHERE id = ?'
    ).bind(payload.sub).first()
    if (!user) return c.json({ error: 'User not found' }, 404)
    return c.json({ user })
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
