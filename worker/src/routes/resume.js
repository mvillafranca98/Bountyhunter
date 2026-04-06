import { Hono } from 'hono'
import { requireAuth } from '../middleware/auth.js'
import { generateId } from '../lib/crypto.js'
import { uploadToR2, resumeKey } from '../lib/r2.js'
import { parseResume, generateMasterResume, generateLinkedInCopy } from '../lib/claude.js'

export const resumeRoutes = new Hono()
resumeRoutes.use('*', requireAuth)

// POST /resume/upload — accepts multipart/form-data with { file, text? }
// The PDF bytes are stored in R2; text extracted client-side (via pdf.js) or sent directly
resumeRoutes.post('/upload', async (c) => {
  const userId = c.get('userId')
  const formData = await c.req.formData()
  const file = formData.get('file')           // File blob
  const resumeText = formData.get('text')     // Pre-extracted text from client

  if (!file && !resumeText) {
    return c.json({ error: 'Provide either a file or extracted text' }, 400)
  }

  const id = generateId()
  let r2Key = null
  let filename = 'resume.pdf'

  if (file) {
    filename = file.name || 'resume.pdf'
    r2Key = resumeKey(userId, filename)
    const bytes = await file.arrayBuffer()
    await uploadToR2(c.env, r2Key, bytes, file.type || 'application/pdf')
  }

  // Use provided text or a placeholder (text will be needed for AI parsing)
  const textToparse = resumeText || '(PDF uploaded — text extraction pending)'

  // Parse with Claude
  const apiKeyValid = c.env.ANTHROPIC_API_KEY && !c.env.ANTHROPIC_API_KEY.startsWith('REPLACE_')
  let parsed = null
  if (apiKeyValid) {
    try {
      parsed = await parseResume(c.env.ANTHROPIC_API_KEY, textToparse)
    } catch (e) {
      console.error('Resume parse error:', e.message)
      return c.json({ error: `Resume parsing failed: ${e.message}` }, 500)
    }
  } else {
    return c.json({ error: 'ANTHROPIC_API_KEY not set — add your key to worker/.dev.vars and restart the worker.' }, 503)
  }

  // Fetch user profile for master resume generation
  const user = await c.env.DB.prepare(
    'SELECT first_name, last_name, email, location FROM users WHERE id = ?'
  ).bind(userId).first()

  let masterResumeText = null
  let linkedInCopy = null

  if (parsed) {
    try {
      masterResumeText = await generateMasterResume(c.env.ANTHROPIC_API_KEY, parsed, user)
      linkedInCopy = await generateLinkedInCopy(c.env.ANTHROPIC_API_KEY, parsed, masterResumeText)
    } catch (e) {
      console.error('Master resume gen error:', e.message)
      return c.json({ error: `Master resume generation failed: ${e.message}` }, 500)
    }
  }

  // Deactivate previous resumes
  await c.env.DB.prepare('UPDATE resumes SET is_active = 0 WHERE user_id = ?').bind(userId).run()

  // Save new resume
  await c.env.DB.prepare(
    `INSERT INTO resumes (id, user_id, r2_key, original_filename, parsed_data, master_resume_text, linkedin_about, linkedin_experience)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, userId,
    r2Key || '',
    filename,
    parsed ? JSON.stringify(parsed) : null,
    masterResumeText,
    linkedInCopy?.about || null,
    linkedInCopy?.headline
      ? JSON.stringify({ headline: linkedInCopy.headline, bullets: linkedInCopy.experience_bullets })
      : null
  ).run()

  // Advance onboarding step if still on resume step
  await c.env.DB.prepare(
    "UPDATE users SET onboarding_step = MAX(onboarding_step, 3), updated_at = datetime('now') WHERE id = ?"
  ).bind(userId).run()

  return c.json({
    id,
    parsed,
    master_resume_text: masterResumeText,
    linkedin: linkedInCopy,
  }, 201)
})

// GET /resume — get active resume
resumeRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const resume = await c.env.DB.prepare(
    'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
  ).bind(userId).first()

  if (!resume) return c.json({ resume: null })

  return c.json({
    resume: {
      ...resume,
      parsed_data: resume.parsed_data ? JSON.parse(resume.parsed_data) : null,
      linkedin_experience: resume.linkedin_experience ? JSON.parse(resume.linkedin_experience) : null,
    }
  })
})

// GET /resume/all — list all resume versions uploaded
resumeRoutes.get('/all', async (c) => {
  const userId = c.get('userId')
  const { results } = await c.env.DB.prepare(
    'SELECT id, original_filename, is_active, created_at FROM resumes WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all()
  return c.json({ resumes: results })
})

// POST /resume/import-linkedin — import profile from LinkedIn URL or pasted text
resumeRoutes.post('/import-linkedin', async (c) => {
  const userId = c.get('userId')
  const { url, text } = await c.req.json()

  if (!url && !text) {
    return c.json({ error: 'Provide a LinkedIn URL or paste your profile text' }, 400)
  }

  const anthropicKey = c.env.ANTHROPIC_API_KEY
  if (!anthropicKey || anthropicKey.startsWith('REPLACE_')) {
    return c.json({ error: 'ANTHROPIC_API_KEY not set — add your key to worker/.dev.vars and restart the worker.' }, 503)
  }

  let profileText = text || ''

  // If URL provided, try to fetch public page
  if (url && !profileText) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; BountyHunter/1.0)',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      })
      if (res.ok) {
        const html = await res.text()
        profileText = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&[a-z]+;/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 10000)
      }
    } catch (e) {
      // Fetching failed — will ask user to paste text
    }

    if (profileText.length < 100 || profileText.includes('Sign in') || profileText.includes('authwall')) {
      return c.json({
        error: 'LinkedIn blocked access. Please copy your profile text manually:\n1. Go to your LinkedIn profile\n2. Select all text (Cmd+A / Ctrl+A)\n3. Copy (Cmd+C / Ctrl+C)\n4. Paste it in the text box below',
        needsManualPaste: true,
      }, 422)
    }
  }

  // Use Claude to parse the profile text into structured resume data
  const parsePrompt = `Parse this LinkedIn profile or resume text into structured JSON. Return ONLY valid JSON:
{
  "name": "Full Name",
  "headline": "Professional headline/title",
  "location": "City, Country",
  "summary": "Professional summary (2-3 sentences)",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "dates": "Start - End",
      "description": "Key responsibilities and achievements"
    }
  ],
  "education": [
    {
      "school": "School Name",
      "degree": "Degree",
      "dates": "Start - End"
    }
  ],
  "skills": ["skill1", "skill2", "skill3"],
  "certifications": ["cert1", "cert2"],
  "languages": ["Language1", "Language2"]
}

Profile text:
${profileText.slice(0, 8000)}`

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: parsePrompt }],
      }),
    })

    if (!aiRes.ok) {
      const errText = await aiRes.text()
      throw new Error(`Claude API error ${aiRes.status}: ${errText}`)
    }

    const aiJson = await aiRes.json()
    const responseText = aiJson.content?.[0]?.text || ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const parsed = JSON.parse(jsonMatch[0])

    // Convert to markdown resume format
    const markdown = linkedInToMarkdown(parsed)

    const id = generateId()

    // Deactivate existing resumes
    await c.env.DB.prepare(
      'UPDATE resumes SET is_active = 0 WHERE user_id = ?'
    ).bind(userId).run()

    // Insert new resume
    await c.env.DB.prepare(
      `INSERT INTO resumes (id, user_id, r2_key, original_filename, parsed_data, master_resume_text, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    ).bind(
      id, userId,
      '',
      'LinkedIn_Import.pdf',
      JSON.stringify(parsed),
      markdown
    ).run()

    // Update user profile with extracted info
    if (parsed.name) {
      const [firstName, ...lastParts] = parsed.name.split(' ')
      const lastName = lastParts.join(' ')
      await c.env.DB.prepare(
        'UPDATE users SET first_name = COALESCE(?, first_name), last_name = COALESCE(?, last_name), location = COALESCE(?, location) WHERE id = ?'
      ).bind(firstName || null, lastName || null, parsed.location || null, userId).run()
    }

    // Advance onboarding step if still on resume step
    await c.env.DB.prepare(
      "UPDATE users SET onboarding_step = MAX(onboarding_step, 3), updated_at = datetime('now') WHERE id = ?"
    ).bind(userId).run()

    return c.json({
      success: true,
      parsed,
      master_resume_text: markdown,
      message: `Imported LinkedIn profile for ${parsed.name || 'user'}`,
    })
  } catch (e) {
    return c.json({ error: `Failed to parse profile: ${e.message}` }, 500)
  }
})

function linkedInToMarkdown(data) {
  let md = ''
  md += `# ${data.name || 'Name'}\n`
  if (data.headline) md += `*${data.headline}*\n`
  if (data.location) md += `${data.location}\n`
  md += '\n---\n\n'

  if (data.summary) {
    md += `## Summary\n${data.summary}\n\n`
  }

  if (data.experience?.length) {
    md += `## Experience\n\n`
    for (const exp of data.experience) {
      md += `### ${exp.title} — ${exp.company}\n`
      if (exp.dates) md += `*${exp.dates}*\n\n`
      if (exp.description) md += `${exp.description}\n\n`
    }
  }

  if (data.education?.length) {
    md += `## Education\n\n`
    for (const edu of data.education) {
      md += `**${edu.school}** — ${edu.degree || ''}\n`
      if (edu.dates) md += `*${edu.dates}*\n\n`
    }
  }

  if (data.skills?.length) {
    md += `## Skills\n${data.skills.join(', ')}\n\n`
  }

  if (data.certifications?.length) {
    md += `## Certifications\n`
    for (const cert of data.certifications) md += `- ${cert}\n`
    md += '\n'
  }

  if (data.languages?.length) {
    md += `## Languages\n${data.languages.join(', ')}\n`
  }

  return md
}
