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
   # [candidate's full name]
   [MUST USE THIS EXACT EMAIL: ${userProfile.email}] · [phone from parsed data] · [location from parsed data or userProfile.location]
   IMPORTANT: The email in the header MUST be exactly: ${userProfile.email} — ignore any other email in the parsed resume

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
- EMAIL: The header MUST show ${userProfile.email} exactly — this is the user's account email, not any email from their old resume
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

// ─── Job Fit Scoring (10-dimension + reference job learning) ─────────────────
// referenceJobs: array of { title, company, fit_score } from user's starred/applied jobs
export async function scoreJobFit(apiKey, jobDescription, parsedResume, userPrefs, jobSearchPrefs, referenceJobs) {
  const prefs = jobSearchPrefs || {}
  const refs = referenceJobs || []

  const system = `You are an expert job-fit analyst. Score how well this candidate matches a job posting across 10 dimensions.
Return ONLY valid JSON — no markdown, no explanation:
{
  "score": number (0-100, weighted average of dimensions),
  "verdict": "strong_fit | good_fit | possible_fit | weak_fit",
  "dimensions": {
    "skills_match":       number (0-10),
    "experience_level":   number (0-10),
    "industry_relevance": number (0-10),
    "work_type_fit":      number (0-10),
    "salary_alignment":   number (0-10),
    "location_fit":       number (0-10),
    "employment_type":    number (0-10),
    "growth_potential":   number (0-10),
    "culture_signals":    number (0-10),
    "deal_breaker_check": number (0-10, 0 if any deal-breaker triggered),
    "preference_signal":  number (0-10)
  },
  "work_type_detected": "remote | hybrid | onsite | unknown",
  "highlights": ["string — specific skills/experiences that match"],
  "gaps": ["string — specific requirements the candidate doesn't meet"],
  "deal_breakers": ["string — any hard deal-breakers (empty array if none)"],
  "salary_match": true | false | null,
  "reasoning": "string (2-3 sentences explaining the overall score)"
}

OVERALL SCORE: Weighted average:
${refs.length > 0
  ? '- skills_match (20%), experience_level (15%), preference_signal (15%), industry_relevance (10%), work_type_fit (10%), salary_alignment (10%), location_fit (5%), employment_type (5%), growth_potential (5%), culture_signals (3%), deal_breaker_check (2%).'
  : '- skills_match (25%), experience_level (20%), industry_relevance (10%), work_type_fit (10%), salary_alignment (10%), location_fit (5%), employment_type (5%), growth_potential (5%), culture_signals (5%), deal_breaker_check (5%). preference_signal: set to 5 (neutral — no reference data).'}

DIMENSION RUBRICS:
- skills_match: 9-10=exact stack match, 7-8=mostly matches with minor gaps, 5-6=50% overlap, 3-4=adjacent skills only, 0-2=wrong field
- experience_level: 9-10=perfect seniority match, 7-8=1 level difference, 5-6=2 levels difference, 0-4=major mismatch
- industry_relevance: how relevant is the candidate's industry background to this company/role
- work_type_fit: 10=preference matches detected work type, 5=unknown/flexible, 0=direct conflict (remote-only candidate for onsite role)
- salary_alignment: 10=ranges overlap well, 5=unknown, 0=no overlap
- location_fit: 10=remote or matching city, 7=same country, 5=unknown, 0=different country with no remote option
- employment_type: 10=exact match, 5=compatible (e.g. full-time candidate for contract role), 0=incompatible
- growth_potential: does this role offer career progression relative to candidate's current level?
- culture_signals: infer from job description — team size, values, autonomy, startup vs enterprise
- deal_breaker_check: 0 if any hard deal-breaker triggered, 10 if none
- preference_signal: how similar is this job to the Reference Jobs the user has previously starred/applied to? 9-10=very similar role/industry/company type, 7-8=related field, 5-6=some overlap, 3-4=loosely related, 0-2=completely different direction

DEAL-BREAKERS (set deal_breaker_check=0 and cap overall score at 30 if any):
- Job requires on-site and candidate is remote-only AND in different city/country
- Degree "required" (not "preferred") and candidate lacks it
- Job requires 5+ more years than candidate has
- Work authorization mismatch

WORK_TYPE DETECTION: Read the job description and location carefully:
- "Remote", "fully remote", "work from home", "WFH", "distributed" → remote
- "Hybrid", "2-3 days in office", "flexible" → hybrid
- "On-site", "in-office", "in-person required", specific city with no remote mention → onsite
- Can't determine → unknown`

  // Build reference jobs section
  let referenceSection = ''
  if (refs.length > 0) {
    referenceSection = `\n\nReference Jobs (previously starred/applied by this user — use these to gauge preferences):
${refs.map((r, i) => `${i + 1}. "${r.title}" at ${r.company} (score: ${r.fit_score ?? 'unscored'})`).join('\n')}

Use these reference jobs to calibrate the preference_signal dimension. Jobs similar in role type, industry, company stage, or skill requirements to these references should score higher on preference_signal.`
  }

  const prompt = `Score this candidate for the job across ${refs.length > 0 ? '11' : '10'} dimensions.

Job Description:
${jobDescription}

Candidate Resume:
${JSON.stringify(parsedResume, null, 2)}

Candidate Preferences:
- Salary: ${userPrefs.salary || 'not specified'}
- Location: ${userPrefs.location || 'flexible'}
- Employment type: ${userPrefs.employment_type || 'full-time'}
- Work authorization: ${userPrefs.work_authorization || 'not specified'}

Job Search Preferences:
- Preferred work style: ${prefs.work_style || 'any'}
- Experience level target: ${prefs.experience_level || 'not specified'}
- Deal-breakers: ${prefs.deal_breakers?.length ? prefs.deal_breakers.join(', ') : 'none'}
- Target industries: ${prefs.target_industries?.length ? prefs.target_industries.join(', ') : 'any'}
- Languages: ${prefs.languages?.length ? prefs.languages.join(', ') : 'not specified'}
- Target regions: ${prefs.target_regions?.length ? prefs.target_regions.join(', ') : 'no preference'}
${referenceSection}

NOTE: If target_regions is set, factor regional fit into location_fit score. A job in a non-preferred region should score 3-5 on location_fit (not 0 unless truly incompatible). Remote jobs with 'remote_any' region preference always score 10.

Be honest. 90+ means near-perfect. Detect work_type from the job description text.`

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

// ─── Interview Prep (STAR format, per-job) ────────────────────────────────────
export async function generateInterviewPrep(apiKey, job, parsedResume, questionBankAnswers = []) {
  const system = `You are an expert interview coach helping a candidate prepare for a specific job.
Return ONLY valid JSON — no markdown, no explanation:
{
  "questions": [
    {
      "question": "string",
      "type": "behavioral | technical | situational | company_specific",
      "answer": "string (STAR format for behavioral, direct answer for technical/situational)",
      "star_situation": "string | null",
      "star_task": "string | null",
      "star_action": "string | null",
      "star_result": "string | null"
    }
  ]
}`

  const existingAnswers = questionBankAnswers.length
    ? `\nCandidate's existing question bank answers (use as context for their communication style):\n${questionBankAnswers.map(q => `Q: ${q.question}\nA: ${q.answer}`).join('\n\n')}`
    : ''

  const prompt = `Generate 7 interview questions and personalized answers for this candidate applying to this role.

Role: ${job.title} at ${job.company}
Job Description:
${(job.description || '').slice(0, 3000)}

Candidate Background:
${JSON.stringify(parsedResume, null, 2)}
${existingAnswers}

Requirements:
- 3 behavioral questions (STAR format answers using candidate's real experience)
- 2 technical/role-specific questions with direct answers
- 1 situational question ("Tell me about a time...")
- 1 company-specific question (reference something from the job description)
- For behavioral questions, fill in star_situation/task/action/result with candidate-specific details from their resume
- Do NOT fabricate experience — only use what's in the resume
- Answers should be 100-200 words each, specific and compelling`

  const result = await callClaude(apiKey, system, prompt, 4096)
  return parseJSON(result)
}

