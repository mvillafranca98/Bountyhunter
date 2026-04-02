import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { answerScreeningQuestion } from '../lib/claude.js'

export const questionRoutes = new Hono()
questionRoutes.use('*', requireAuth)

// Default question templates seeded during onboarding
const DEFAULT_QUESTIONS = [
  { template: 'When can you start?', category: 'availability' },
  { template: 'What is your expected salary?', category: 'salary' },
  { template: 'Are you authorized to work in the United States?', category: 'authorization' },
  { template: 'Are you willing to relocate?', category: 'availability' },
  { template: 'Can you work in a fast-paced environment?', category: 'work_style' },
  { template: 'Do you have experience with remote work?', category: 'work_style' },
  { template: 'Are you comfortable with travel requirements?', category: 'availability' },
  { template: 'Do you require visa sponsorship?', category: 'authorization' },
]

// GET /questions — list all saved answers
questionRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM question_bank WHERE user_id = ? ORDER BY category, created_at'
  ).bind(userId).all()
  return c.json({ questions: results })
})

// POST /questions/seed — generate default answers from user profile (called after onboarding)
questionRoutes.post('/seed', async (c) => {
  const userId = c.get('userId')

  if (!c.env.ANTHROPIC_API_KEY || c.env.ANTHROPIC_API_KEY.startsWith('REPLACE_')) {
    return c.json({ error: 'ANTHROPIC_API_KEY not set — add your key to worker/.dev.vars and restart the worker.' }, 503)
  }

  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ?'
  ).bind(userId).first()

  const salary = await c.env.DB.prepare(
    'SELECT * FROM salary_preferences WHERE user_id = ? LIMIT 1'
  ).bind(userId).first()

  const resume = await c.env.DB.prepare(
    'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()

  const parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}
  const userPrefs = { salary, work_authorization: user?.work_authorization, start_date: user?.start_date }

  // Delete existing default questions to re-seed
  await c.env.DB.prepare(
    'DELETE FROM question_bank WHERE user_id = ? AND is_default = 1'
  ).bind(userId).run()

  const stmts = []
  for (const q of DEFAULT_QUESTIONS) {
    let answer = ''
    try {
      answer = await answerScreeningQuestion(
        c.env.ANTHROPIC_API_KEY,
        q.template,
        parsedResume,
        userPrefs,
        'General job application'
      )
    } catch {
      answer = '(Set your answer here)'
    }

    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO question_bank (id, user_id, question_template, answer, category, is_default)
         VALUES (?, ?, ?, ?, ?, 1)`
      ).bind(generateId(), userId, q.template, answer, q.category)
    )
  }

  if (stmts.length) await c.env.DB.batch(stmts)
  return c.json({ seeded: stmts.length })
})

// POST /questions — add a custom question/answer
questionRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const { question_template, answer, category = 'custom' } = await c.req.json()

  if (!question_template || !answer) {
    return c.json({ error: 'question_template and answer are required' }, 400)
  }

  const id = generateId()
  await c.env.DB.prepare(
    `INSERT INTO question_bank (id, user_id, question_template, answer, category)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(id, userId, question_template, answer, category).run()

  return c.json({ id }, 201)
})

// PUT /questions/:id — update an answer
questionRoutes.put('/:id', async (c) => {
  const userId = c.get('userId')
  const { answer } = await c.req.json()
  if (!answer) return c.json({ error: 'answer is required' }, 400)

  await c.env.DB.prepare(
    "UPDATE question_bank SET answer = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).bind(answer, c.req.param('id'), userId).run()

  return c.json({ success: true })
})

// DELETE /questions/:id
questionRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  await c.env.DB.prepare(
    'DELETE FROM question_bank WHERE id = ? AND user_id = ?'
  ).bind(c.req.param('id'), userId).run()
  return c.json({ success: true })
})

// POST /questions/generate — AI-generate an answer for a new question
questionRoutes.post('/generate', async (c) => {
  const userId = c.get('userId')
  const { question, job_context = '' } = await c.req.json()
  if (!question) return c.json({ error: 'question is required' }, 400)

  if (!c.env.ANTHROPIC_API_KEY || c.env.ANTHROPIC_API_KEY.startsWith('REPLACE_')) {
    return c.json({ error: 'ANTHROPIC_API_KEY not set — add your key to worker/.dev.vars and restart the worker.' }, 503)
  }

  const resume = await c.env.DB.prepare(
    'SELECT parsed_data FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
  ).bind(userId).first()

  const parsedResume = resume?.parsed_data ? JSON.parse(resume.parsed_data) : {}

  const user = await c.env.DB.prepare(
    'SELECT work_authorization, start_date FROM users WHERE id = ?'
  ).bind(userId).first()

  try {
    const answer = await answerScreeningQuestion(
      c.env.ANTHROPIC_API_KEY, question, parsedResume, user, job_context
    )
    return c.json({ answer })
  } catch (e) {
    return c.json({ error: `AI generation failed: ${e.message}` }, 500)
  }
})
