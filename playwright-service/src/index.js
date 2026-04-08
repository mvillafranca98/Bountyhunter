import 'dotenv/config'
import express from 'express'
import { applyToJob } from './apply.js'
import { scrapeLinkedInProfile } from './linkedin.js'

const app = express()
app.use(express.json({ limit: '10mb' }))

const SERVICE_TOKEN = process.env.SERVICE_TOKEN || ''

// Simple token auth middleware
app.use((req, res, next) => {
  if (SERVICE_TOKEN && req.headers['x-service-token'] !== SERVICE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// POST /apply — attempt to auto-fill and submit a job application
// Body: { jobUrl, resumeText, coverLetter, questionBank: { [question]: answer } }
app.post('/apply', async (req, res) => {
  const { jobUrl, resumeText, coverLetter, questionBank = {} } = req.body

  if (!jobUrl) return res.status(400).json({ error: 'jobUrl is required' })

  console.log(`[apply] Starting: ${jobUrl}`)

  try {
    const result = await applyToJob({ jobUrl, resumeText, coverLetter, questionBank })
    console.log(`[apply] Result: ${result.success ? 'SUCCESS' : 'BLOCKED'} — ${result.blockerReason || ''}`)
    res.json(result)
  } catch (err) {
    console.error(`[apply] Unexpected error:`, err)
    res.status(500).json({ success: false, blockerReason: 'other', blockerDetail: err.message })
  }
})

// POST /scrape-profile — scrape a LinkedIn profile URL using saved session + stealth
app.post('/scrape-profile', async (req, res) => {
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'url is required' })
  console.log(`[scrape-profile] Starting: ${url}`)
  try {
    const profileText = await scrapeLinkedInProfile(url)
    console.log(`[scrape-profile] Success: ${profileText.slice(0, 100)}...`)
    res.json({ profileText })
  } catch (err) {
    console.error(`[scrape-profile] Error:`, err.message)
    res.status(500).json({ error: err.message, needsManualPaste: true })
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`Playwright service running on :${PORT}`))
