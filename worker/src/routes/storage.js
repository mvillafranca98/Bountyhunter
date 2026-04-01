import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'

export const storageRoutes = new Hono()
storageRoutes.use('*', requireAuth)

// GET /storage/:key — proxy R2 file download (auth-gated)
storageRoutes.get('/:key{.+}', async (c) => {
  const userId = c.get('userId')
  const key = decodeURIComponent(c.req.param('key'))

  // Ensure the key belongs to this user (keys are prefixed with userId)
  if (!key.includes(userId)) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const obj = await c.env.STORAGE.get(key)
  if (!obj) return c.json({ error: 'Not found' }, 404)

  const headers = new Headers()
  obj.writeHttpMetadata(headers)
  headers.set('etag', obj.httpEtag)

  return new Response(obj.body, { headers })
})
