import { chromium } from 'playwright'
import { fillLinkedInEasyApply } from './linkedin.js'

/**
 * Main entry point — routes to the correct platform handler based on URL
 */
export async function applyToJob({ jobUrl, resumeText, coverLetter, questionBank }) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  let result = { success: false, blockerReason: 'other', blockerDetail: '' }

  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Platform detection
    const url = page.url()

    if (url.includes('linkedin.com')) {
      result = await fillLinkedInEasyApply({ page, context, resumeText, coverLetter, questionBank })
    } else {
      // For non-LinkedIn platforms, check for common blockers immediately
      result = { success: false, blockerReason: 'external_ats', blockerDetail: `Unsupported platform: ${new URL(url).hostname}` }
    }

    // Take screenshot regardless of outcome
    const screenshotBuffer = await page.screenshot({ fullPage: false })
    result.screenshotBuffer = screenshotBuffer

  } catch (err) {
    // Timeout, navigation error, etc.
    result = { success: false, blockerReason: 'other', blockerDetail: err.message }
    try {
      result.screenshotBuffer = await page.screenshot()
    } catch { /* ignore */ }
  } finally {
    await browser.close()
  }

  return result
}
