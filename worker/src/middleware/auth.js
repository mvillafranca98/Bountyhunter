import { verifyJWT } from '../lib/crypto.js'

export async function requireAuth(c, next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const payload = await verifyJWT(token, c.env.JWT_SECRET)
    c.set('userId', payload.sub)
    c.set('userEmail', payload.email)
    await next()
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401)
  }
}
