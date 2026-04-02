/**
 * One-time LinkedIn session setup.
 * Opens a REAL browser window — log in manually (including 2FA/SSO).
 * Session is saved to .session/ and reused by the service automatically.
 * Run with: npm run setup-linkedin
 */

import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SESSION_DIR = path.join(__dirname, '..', '.session')

console.log('\n🔐 BountyHunter — LinkedIn Session Setup')
console.log('─────────────────────────────────────────')
console.log('A browser window will open. Log into LinkedIn normally.')
console.log('2FA, SSO, and phone verification all work — just complete them.')
console.log('The window closes automatically once you are logged in.\n')

const context = await chromium.launchPersistentContext(SESSION_DIR, {
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
})

const page = await context.newPage()
await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded' })

console.log('⏳ Waiting for you to log in (up to 3 minutes)…')

try {
  // Wait until we land on the feed (logged in)
  await page.waitForURL('**/feed**', { timeout: 180000 })
  console.log('\n✅ Logged in! Session saved to playwright-service/.session/')
  console.log('👉 You can now run: npm run dev (from the project root)\n')
} catch {
  const current = page.url()
  if (current.includes('linkedin.com') && !current.includes('/login')) {
    console.log('\n✅ LinkedIn session saved!')
  } else {
    console.log('\n⏱  Timed out — please run setup-linkedin again and log in within 3 minutes.')
  }
}

await context.close()
process.exit(0)
