/**
 * Verify the saved session is still logged in.
 * If not, throw a helpful error pointing to the setup command.
 */
async function ensureLoggedIn(page) {
  await page.goto('https://www.linkedin.com/feed', { waitUntil: 'domcontentloaded', timeout: 20000 })

  const loggedIn = await page.locator('.global-nav__me-photo, .feed-identity-module__actor-meta, nav[aria-label="Global Navigation"]')
    .first().isVisible({ timeout: 6000 }).catch(() => false)

  if (!loggedIn) {
    throw new Error(
      'LinkedIn session not found or expired.\n' +
      'Run: npm run setup-linkedin  (from the project root)\n' +
      'This opens a browser so you can log in once — no password storage needed.'
    )
  }
}

/**
 * LinkedIn Easy Apply handler
 * Navigates through multi-step Easy Apply modal, fills all form fields,
 * and submits. Detects and reports blockers at each step.
 */
export async function fillLinkedInEasyApply({ page, context, resumeText, coverLetter, questionBank }) {
  try {
    // Save the job URL before ensureLoggedIn navigates away
    const jobUrl = page.url()

    // Ensure we're logged in (may navigate to /feed or /login)
    await ensureLoggedIn(page)

    // Navigate back to the job posting
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })

    // Look for Easy Apply button
    const easyApplyBtn = page.locator('button:has-text("Easy Apply"), .jobs-apply-button--top-card button').first()
    const btnVisible = await easyApplyBtn.isVisible({ timeout: 8000 }).catch(() => false)

    if (!btnVisible) {
      return { success: false, blockerReason: 'external_ats', blockerDetail: 'No Easy Apply button found — requires external application' }
    }

    await easyApplyBtn.click()
    await page.waitForSelector('.jobs-easy-apply-modal', { timeout: 8000 })

    let stepCount = 0
    const MAX_STEPS = 15

    while (stepCount < MAX_STEPS) {
      stepCount++

      // Check for blockers on this step
      const blockerResult = await detectStepBlockers(page)
      if (blockerResult) return blockerResult

      // Fill all visible form fields
      await fillFormFields(page, questionBank, coverLetter, resumeText)

      // Determine next action
      const nextBtn = page.locator('button[aria-label="Continue to next step"], button:has-text("Next"), button:has-text("Review")').first()
      const submitBtn = page.locator('button[aria-label="Submit application"], button:has-text("Submit application")').first()
      const doneBtn = page.locator('button:has-text("Done")').first()

      if (await submitBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitBtn.click()
        await page.waitForTimeout(2000)

        // Check for success confirmation
        const confirmed = await page.locator('.artdeco-inline-feedback--success, :has-text("Application submitted")').isVisible({ timeout: 5000 }).catch(() => false)
        if (confirmed) {
          // Click done if visible
          await doneBtn.click().catch(() => {})
          return { success: true }
        }
        return { success: false, blockerReason: 'other', blockerDetail: 'Submit button clicked but no confirmation found' }
      }

      if (await nextBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nextBtn.click()
        await page.waitForTimeout(1500)
        continue
      }

      // No next or submit found
      return { success: false, blockerReason: 'other', blockerDetail: 'Could not find navigation buttons in Easy Apply modal' }
    }

    return { success: false, blockerReason: 'other', blockerDetail: 'Exceeded maximum steps in Easy Apply flow' }

  } catch (err) {
    return { success: false, blockerReason: 'other', blockerDetail: `LinkedIn apply error: ${err.message}` }
  }
}

async function detectStepBlockers(page) {
  // Video/voice questions
  const videoEl = await page.locator('video, [data-test-form-element-id*="video"], button:has-text("Record video")').first().isVisible({ timeout: 1000 }).catch(() => false)
  if (videoEl) return { success: false, blockerReason: 'video_required', blockerDetail: 'Step requires video recording' }

  const voiceEl = await page.locator('[data-test-form-element-id*="audio"], button:has-text("Record audio")').first().isVisible({ timeout: 1000 }).catch(() => false)
  if (voiceEl) return { success: false, blockerReason: 'voice_required', blockerDetail: 'Step requires voice recording' }

  // Assessment link (redirects out of the modal)
  const assessEl = await page.locator('a:has-text("Take assessment"), button:has-text("Take test")').first().isVisible({ timeout: 1000 }).catch(() => false)
  if (assessEl) return { success: false, blockerReason: 'assessment', blockerDetail: 'Step requires external assessment test' }

  return null
}

async function fillFormFields(page, questionBank, coverLetter, resumeText) {
  // ── Text inputs and textareas ──────────────────────────────────────────────
  const inputs = await page.locator('.jobs-easy-apply-form-element input[type="text"], .jobs-easy-apply-form-element input[type="number"]').all()
  for (const input of inputs) {
    const isVisible = await input.isVisible().catch(() => false)
    if (!isVisible) continue
    const currentVal = await input.inputValue().catch(() => '')
    if (currentVal) continue // already filled

    const label = await getFieldLabel(page, input)
    const answer = findBestAnswer(label, questionBank)
    if (answer) {
      await input.fill(answer)
      await page.waitForTimeout(300)
    }
  }

  // ── Textareas (cover letter, work experience descriptions) ─────────────────
  const textareas = await page.locator('.jobs-easy-apply-form-element textarea').all()
  for (const ta of textareas) {
    const isVisible = await ta.isVisible().catch(() => false)
    if (!isVisible) continue
    const currentVal = await ta.inputValue().catch(() => '')
    if (currentVal) continue

    const label = await getFieldLabel(page, ta)
    const isCoverLetter = /cover letter|letter of interest/i.test(label)

    if (isCoverLetter && coverLetter) {
      await ta.fill(coverLetter)
    } else {
      const answer = findBestAnswer(label, questionBank)
      if (answer) await ta.fill(answer)
    }
    await page.waitForTimeout(300)
  }

  // ── Select dropdowns ────────────────────────────────────────────────────────
  const selects = await page.locator('.jobs-easy-apply-form-element select').all()
  for (const sel of selects) {
    const isVisible = await sel.isVisible().catch(() => false)
    if (!isVisible) continue
    const currentVal = await sel.inputValue().catch(() => '')
    if (currentVal && currentVal !== '') continue

    const label = await getFieldLabel(page, sel)
    const answer = findBestAnswer(label, questionBank)
    if (answer) {
      // Try to select matching option
      const options = await sel.locator('option').all()
      for (const opt of options) {
        const text = await opt.textContent()
        if (text?.toLowerCase().includes(answer.toLowerCase())) {
          const val = await opt.getAttribute('value')
          if (val) await sel.selectOption(val)
          break
        }
      }
    }
  }

  // ── Radio buttons (Yes/No style) ────────────────────────────────────────────
  const radioGroups = await page.locator('.jobs-easy-apply-form-element fieldset').all()
  for (const group of radioGroups) {
    const label = await group.locator('legend, label').first().textContent().catch(() => '')
    const answer = findBestAnswer(label, questionBank)
    if (!answer) continue

    const radios = await group.locator('input[type="radio"]').all()
    for (const radio of radios) {
      const radioLabel = await getFieldLabel(page, radio)
      if (radioLabel.toLowerCase().includes(answer.toLowerCase())) {
        await radio.check()
        break
      }
    }
  }
}

async function getFieldLabel(page, element) {
  try {
    const id = await element.getAttribute('id')
    if (id) {
      const label = await page.locator(`label[for="${id}"]`).textContent({ timeout: 500 }).catch(() => '')
      if (label) return label.trim()
    }
    // Walk up DOM to find closest label
    const parentLabel = await element.locator('xpath=ancestor::*[.//label][1]//label').first().textContent({ timeout: 500 }).catch(() => '')
    return parentLabel.trim()
  } catch {
    return ''
  }
}

function findBestAnswer(question, questionBank) {
  if (!question) return null
  const q = question.toLowerCase()

  // Direct match
  for (const [template, answer] of Object.entries(questionBank)) {
    if (q.includes(template.toLowerCase()) || template.toLowerCase().includes(q)) {
      return answer
    }
  }

  // Keyword-based fuzzy match
  const keywords = {
    'start': 'start_date',
    'salary': 'salary',
    'authorized': 'work_authorization',
    'sponsorship': 'work_authorization',
    'relocat': 'relocate',
    'remote': 'work_style',
    'fast.pac': 'work_style',
    'travel': 'travel',
  }

  for (const [kw, category] of Object.entries(keywords)) {
    if (new RegExp(kw, 'i').test(q)) {
      const match = Object.entries(questionBank).find(([t]) => t.toLowerCase().includes(category))
      if (match) return match[1]
    }
  }

  return null
}
