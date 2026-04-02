import { chromium } from 'playwright'
import { fillLinkedInEasyApply } from './linkedin.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Saved LinkedIn session — populated once by `npm run setup-linkedin`
const SESSION_DIR = path.join(__dirname, '..', '.session')

/**
 * Main entry point — routes to the correct platform handler based on URL.
 */
export async function applyToJob({ jobUrl, resumeText, coverLetter, questionBank }) {
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: true,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  })

  const page = await context.newPage()
  let result = { success: false, blockerReason: 'other', blockerDetail: '' }

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

    const url = page.url()

    if (url.includes('linkedin.com')) {
      result = await fillLinkedInEasyApply({ page, context, resumeText, coverLetter, questionBank })
    } else {
      result = {
        success: false,
        blockerReason: 'external_ats',
        blockerDetail: `Unsupported platform: ${new URL(url).hostname} — only LinkedIn Easy Apply is supported`,
      }
    }

    try { result.screenshotBuffer = await page.screenshot({ fullPage: false }) } catch { /* ignore */ }

  } catch (err) {
    result = { success: false, blockerReason: 'other', blockerDetail: err.message }
    try { result.screenshotBuffer = await page.screenshot() } catch { /* ignore */ }
  } finally {
    await context.close()
  }

  return result
}
