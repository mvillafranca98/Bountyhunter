// Claude API helpers for resume analysis, fit scoring, and content generation

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'

// Strip markdown code fences and attempt to recover truncated JSON
function parseJSON(text) {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    return JSON.parse(stripped)
  } catch {
    // JSON was truncated — trim to last complete top-level closing brace
    const lastBrace = stripped.lastIndexOf('}')
    if (lastBrace === -1) throw new Error('No valid JSON object found in response')
    return JSON.parse(stripped.slice(0, lastBrace + 1))
  }
}

async function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 2048) {
  const res = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Claude API error ${res.status}: ${err}`)
  }
  const data = await res.json()
  return data.content[0].text
}

// ─── Resume Parsing ────────────────────────────────────────────────────────────
export async function parseResume(apiKey, resumeText) {
  const system = `You are a resume parser. Extract structured data from the provided resume text.
Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "summary": "string",
  "skills": ["skill1", "skill2"],
  "experience": [
    {
      "title": "string",
      "company": "string",
      "start_date": "string",
      "end_date": "string or null",
      "description": "string",
      "achievements": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "graduation_year": "string"
    }
  ],
  "certifications": ["string"],
  "languages": ["string"],
  "years_of_experience": number
}`

  const result = await callClaude(apiKey, system, `Parse this resume:\n\n${resumeText}`, 4096)
  return parseJSON(result)
}

// ─── Master Resume Generation ──────────────────────────────────────────────────
export async function generateMasterResume(apiKey, parsedData, userProfile) {
  const system = `You are an expert resume writer who creates ATS-optimized resumes in Harvard Business School format.
Your resumes are concise, achievement-focused, and use consistent Harvard-style markdown formatting.
Return the resume in markdown format only — no preamble, no explanation.`

  const prompt = `Create a Harvard-style, ATS-optimized master resume for this candidate.

Profile: ${JSON.stringify(userProfile, null, 2)}
Parsed Resume Data: ${JSON.stringify(parsedData, null, 2)}

HARVARD FORMAT RULES — follow exactly:

1. HEADER (top of resume):
   # First Last
   email@example.com · (555) 555-5555 · City, State · linkedin.com/in/handle

2. SECTIONS in this order (use ## for section headers):
   ## Experience
   ## Education
   ## Skills
   ## Certifications  ← only if present

3. EXPERIENCE ENTRIES — each role formatted as:
   **Company Name** — City, State (or Remote)
   *Job Title* | Month Year – Month Year (or Present)
   - Action verb + achievement with quantified impact (e.g., "Led team of 8 engineers to reduce...")
   - 2–4 bullets per role, starting with strong action verbs
   - Quantify impact with %, $, headcount, or time saved wherever possible

4. EDUCATION ENTRIES:
   **University Name** — City, State
   *Degree, Major* | Graduation Year
   - Relevant coursework, honors, GPA (only if ≥ 3.5), or activities (optional)

5. SKILLS:
   Comma-separated by category on separate lines, e.g.:
   **Languages:** Python, JavaScript, SQL
   **Frameworks:** React, Node.js, FastAPI
   **Tools:** AWS, Docker, Kubernetes, Git

STRICT RULES:
- Use ONLY information from the provided parsed data — do NOT fabricate experience, dates, or companies
- No tables, no columns, no special symbols (ATS-safe plain markdown only)
- Keep total content to 1–2 pages equivalent
- Dates must be consistent format throughout`

  return callClaude(apiKey, system, prompt, 3000)
}

// ─── LinkedIn Copy Generation ──────────────────────────────────────────────────
export async function generateLinkedInCopy(apiKey, parsedData, masterResume) {
  const system = `You are a LinkedIn profile optimization expert.
Return ONLY valid JSON (no markdown wrapper):
{
  "about": "string (2-3 paragraphs, first-person, compelling)",
  "headline": "string (under 220 chars)",
  "experience_bullets": { "company_title_key": ["bullet1", "bullet2"] }
}`

  const prompt = `Generate LinkedIn profile copy for this candidate.

Resume Data: ${JSON.stringify(parsedData, null, 2)}
Master Resume: ${masterResume}

Make the About section tell a story. The headline should include role + value prop.
Experience bullets should be achievement-focused (not just responsibilities).`

  const result = await callClaude(apiKey, system, prompt, 2000)
  return parseJSON(result)
}

// ─── Job Fit Scoring ───────────────────────────────────────────────────────────
export async function scoreJobFit(apiKey, jobDescription, parsedResume, userPrefs) {
  const system = `You are a senior technical recruiter scoring candidate-job fit.
Return ONLY valid JSON:
{
  "score": number (0-100),
  "verdict": "strong_fit | good_fit | possible_fit | weak_fit",
  "highlights": ["string — why this is a good match"],
  "gaps": ["string — skills/experience missing"],
  "salary_match": true | false | null,
  "reasoning": "string (2-3 sentences)"
}`

  const prompt = `Score this candidate's fit for the job.

Job Description:
${jobDescription}

Candidate Resume Summary:
${JSON.stringify(parsedResume, null, 2)}

Candidate Preferences:
- Salary range: ${userPrefs.salary || 'not specified'}
- Location preference: ${userPrefs.location || 'flexible'}
- Employment type: ${userPrefs.employment_type || 'full-time'}

Be honest. A 90+ score means the candidate is nearly perfect for this role.`

  const result = await callClaude(apiKey, system, prompt)
  return parseJSON(result)
}

// ─── Tailored Resume ───────────────────────────────────────────────────────────
export async function tailorResume(apiKey, masterResume, jobDescription, jobTitle, company) {
  const system = `You are an expert resume writer. Tailor the provided master resume to match
a specific job description. Emphasize relevant experience, mirror keywords from the JD,
and reorder/rewrite bullets to maximize ATS score for this role.
Return the tailored resume in clean markdown format.`

  const prompt = `Tailor this master resume for the following role.

Role: ${jobTitle} at ${company}

Job Description:
${jobDescription}

Master Resume:
${masterResume}

Instructions:
- Mirror exact keywords from the job description (for ATS)
- Move the most relevant experience to the top of each section
- Rewrite 2-3 bullets per role to directly address JD requirements
- Keep the overall structure intact
- Do NOT fabricate experience`

  return callClaude(apiKey, system, prompt, 3000)
}

// ─── Cover Letter ──────────────────────────────────────────────────────────────
export async function generateCoverLetter(apiKey, parsedResume, jobDescription, jobTitle, company, userProfile) {
  const system = `You are an expert cover letter writer. Write compelling, personalized cover letters
that are concise (3-4 paragraphs), specific to the role, and avoid generic phrases like
"I am writing to express my interest". Return plain text only (no markdown).`

  const prompt = `Write a cover letter for this application.

Applicant: ${userProfile.first_name} ${userProfile.last_name}
Role: ${jobTitle} at ${company}

Job Description:
${jobDescription}

Candidate Background:
${JSON.stringify(parsedResume, null, 2)}

Make it:
- Conversational but professional
- Specific — reference the company/role details
- Achievement-focused — use 1-2 concrete examples
- Concise — under 350 words`

  return callClaude(apiKey, system, prompt, 1500)
}

// ─── Screening Question Answer ─────────────────────────────────────────────────
export async function answerScreeningQuestion(apiKey, question, parsedResume, userPrefs, jobContext) {
  const system = `You are helping a job applicant answer screening questions authentically and compellingly.
Return ONLY the answer text — no preamble, no quotes, no explanation.`

  const prompt = `Answer this job application screening question for the candidate.

Question: "${question}"

Job Context: ${jobContext}
Candidate Background: ${JSON.stringify(parsedResume, null, 2)}
Candidate Preferences: ${JSON.stringify(userPrefs, null, 2)}

Write a natural, honest, 1-3 sentence answer that reflects the candidate's experience
and positions them positively for this role.`

  return callClaude(apiKey, system, prompt, 300)
}

// ─── Sample Job Generation (for demo / seed) ──────────────────────────────────
export async function generateSampleJobs(apiKey, parsedResume, targetRoles, userPrefs) {
  const system = `You are a job board that generates realistic job postings and evaluates candidate fit.
Return ONLY valid JSON (no markdown wrapper):
{
  "jobs": [
    {
      "title": "string",
      "company": "string (real well-known company name)",
      "location": "string (e.g. San Francisco, CA or Remote)",
      "url": "string (fake but plausible URL like https://careers.company.com/jobs/12345)",
      "description": "string (200-280 words — realistic JD with responsibilities AND requirements)",
      "salary_min": number,
      "salary_max": number,
      "salary_type": "yearly",
      "fit_score": number (0-100, honest assessment),
      "fit_verdict": "strong_fit | good_fit | possible_fit | weak_fit",
      "fit_highlights": ["2-4 strings — why they match"],
      "fit_gaps": ["1-3 strings — missing skills or experience"],
      "fit_reasoning": "string (2 sentences explaining the score)"
    }
  ]
}`

  const roles = targetRoles.length ? targetRoles.join(', ') : 'software engineer'

  const prompt = `Generate exactly 5 realistic job postings for a candidate targeting: ${roles}

Candidate Background:
${JSON.stringify(parsedResume, null, 2)}

Preferences:
- Salary range: ${userPrefs.salary || 'not specified'}
- Location: ${userPrefs.location || 'flexible'}
- Employment type: ${userPrefs.employment_type || 'full-time'}

Requirements:
- Mix of scores: 2 strong fits (80-95), 2 good fits (65-79), 1 possible/weak fit (40-64)
- Use real company names (e.g., Google, Stripe, Airbnb, Meta, Shopify, Figma, OpenAI, Notion)
- Make descriptions specific to the candidate's actual skills and background
- Salary ranges should be realistic for 2025 US market
- Fit scores must honestly reflect how well the candidate's resume matches the JD`

  const result = await callClaude(apiKey, system, prompt, 4096)
  return parseJSON(result)
}

// ─── Skills Gap Analysis ───────────────────────────────────────────────────────
export async function analyzeSkillsGap(apiKey, jobs, parsedResume) {
  const system = `You are a career advisor analyzing skill gaps from job postings.
Return ONLY valid JSON:
{
  "missing_skills": [
    { "skill": "string", "frequency": number, "importance": "critical|nice-to-have" }
  ],
  "recommended_certifications": ["string"],
  "summary": "string"
}`

  const allRequirements = jobs.map(j => j.description).join('\n---\n').slice(0, 8000)

  const prompt = `Analyze skill gaps for this candidate based on ${jobs.length} job postings they're targeting.

Candidate's Current Skills: ${JSON.stringify(parsedResume.skills || [])}
Candidate's Experience: ${JSON.stringify((parsedResume.experience || []).map(e => e.title))}

Job Requirements (aggregated from postings):
${allRequirements}

Identify the top skills appearing in these job descriptions that the candidate lacks.`

  const result = await callClaude(apiKey, system, prompt, 1500)
  return parseJSON(result)
}
