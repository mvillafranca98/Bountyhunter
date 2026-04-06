import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { ensureSavedSearchesTable } from '../lib/savedSearches.js'

export const alertRoutes = new Hono()
alertRoutes.use('*', requireAuth)

// GET /alerts — list user's saved searches
alertRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  await ensureSavedSearchesTable(c.env.DB)
  const results = await c.env.DB.prepare(
    'SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json({ alerts: results.results })
})

// POST /alerts — create a new saved search / job alert
alertRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const { keywords, frequency } = await c.req.json()
  if (!keywords?.trim()) return c.json({ error: 'Keywords are required' }, 400)

  await ensureSavedSearchesTable(c.env.DB)
  const id = crypto.randomUUID()

  try {
    await c.env.DB.prepare(
      'INSERT INTO saved_searches (id, user_id, keywords, frequency) VALUES (?, ?, ?, ?)'
    ).bind(id, userId, keywords.trim(), frequency || 'daily').run()
  } catch (e) {
    if (e.message?.includes('UNIQUE')) {
      return c.json({ error: 'You already have an alert for these keywords' }, 409)
    }
    throw e
  }

  return c.json({ success: true, id, message: `Alert created for "${keywords}"` })
})

// DELETE /alerts/:id — remove a saved search
alertRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await ensureSavedSearchesTable(c.env.DB)
  await c.env.DB.prepare(
    'DELETE FROM saved_searches WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  return c.json({ success: true })
})

// PUT /alerts/:id/toggle — enable/disable an alert
alertRoutes.put('/:id/toggle', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  await ensureSavedSearchesTable(c.env.DB)
  await c.env.DB.prepare(
    'UPDATE saved_searches SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ? AND user_id = ?'
  ).bind(id, userId).run()
  return c.json({ success: true })
})
