# BountyHunter 🎯
**AI-powered job application copilot** — searches jobs, scores fit, tailors your resume, writes cover letters, and auto-fills applications.

---

## What it does

1. You upload your resume → Claude parses it, builds a polished ATS-optimized master resume + LinkedIn copy
2. You set target roles, salary range, and preferences
3. Hit "Hunt jobs" → jobs are fetched, scored against your profile (0–100% fit)
4. For high-fit jobs: Claude tailors your resume + writes a cover letter
5. Auto-apply (LinkedIn Easy Apply via Playwright) or approve manually
6. Dashboard shows: Applied / Needs Manual Attention / Expired / Low Fit

---

## Architecture

```
frontend/           React 18 + Vite + Tailwind → Cloudflare Pages
worker/             Cloudflare Workers (Hono) + D1 + R2 + Queues
playwright-service/ Express + Playwright (runs on a VPS)
```

---

## Prerequisites

Make sure you have these installed before starting:

| Tool | Version | Install |
|---|---|---|
| Node.js | v18+ | [nodejs.org](https://nodejs.org) |
| npm | v9+ | comes with Node |
| Wrangler CLI | v4+ | `npm install -g wrangler` |
| Cloudflare account | free tier works | [dash.cloudflare.com](https://dash.cloudflare.com) |
| Anthropic API key | required | [console.anthropic.com](https://console.anthropic.com) |

---

## Step-by-Step Setup

### Step 1 — Log in to Cloudflare

```bash
npx wrangler login
```

This opens your browser. Approve access. You only need to do this once.

---

### Step 2 — Create Cloudflare Resources

Run these commands one at a time from inside the `worker/` folder:

```bash
cd worker
```

**Create the D1 database:**
```bash
npm run db:create
```
> It will print something like:
> ```
> ✅ Successfully created DB 'bountyhunter-db'
> Created your database using D1's new storage backend
> database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
> ```
> **Copy that `database_id`** — you need it in the next step.

**Paste the database_id into `wrangler.toml`:**

Open `worker/wrangler.toml` and replace `PLACEHOLDER_REPLACE_AFTER_db:create` with your actual ID:
```toml
[[d1_databases]]
binding = "DB"
database_name = "bountyhunter-db"
database_id = "abc123-xxxx-xxxx-xxxx-xxxxxxxxxxxx"   # ← paste here
```

**Create the R2 storage bucket:**
```bash
npm run r2:create
```

**Create the job queue:**
```bash
npm run queue:create
```

---

### Step 3 — Set Secrets

These are environment variables that are never stored in code.

```bash
# A random secret string (32+ characters) for signing JWTs
# You can generate one at: https://generate-secret.vercel.app/32
npx wrangler secret put JWT_SECRET

# Your Anthropic API key (starts with sk-ant-)
npx wrangler secret put ANTHROPIC_API_KEY
```

> For each command, Wrangler will prompt: `Enter a secret value:` — paste your value and press Enter.

---

### Step 4 — Create Local Secrets File

For **local development**, Wrangler reads secrets from a `.dev.vars` file (not from the cloud):

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

Now open `worker/.dev.vars` and fill in the values:

```ini
JWT_SECRET=any-random-string-at-least-32-chars
ANTHROPIC_API_KEY=sk-ant-your-key-here
PLAYWRIGHT_SERVICE_URL=http://localhost:3001
PLAYWRIGHT_SERVICE_TOKEN=local-dev-token
```

> ⚠️ `.dev.vars` is in `.gitignore` — it will never be committed.

---

### Step 5 — Run Database Migrations

This creates all the tables in your local D1 database:

```bash
# Still inside worker/
npm run db:migrate:local
```

You should see output confirming each table was created (users, jobs, resumes, etc.).

---

### Step 6 — Start the Worker (Backend)

```bash
# Still inside worker/
npm run dev
```

You should see:
```
⛅️ wrangler 4.x.x
[wrangler:inf] Ready on http://localhost:8787
```

Leave this terminal running.

---

### Step 7 — Start the Frontend

Open a **new terminal tab/window**:

```bash
cd frontend
npm run dev
```

You should see:
```
  VITE v6.x.x  ready in 400ms
  ➜  Local:   http://localhost:5173/
```

---

### Step 8 — Open the App

Go to **http://localhost:5173** in your browser.

---

## Testing the Full Flow

### Test 1 — Register & Onboarding

1. Click **"Create one"** on the login page
2. Fill in name, email, password → **Create account**
3. You'll be sent to the 3-step onboarding:
   - **Step 1 — Profile**: Fill location, work authorization, start date
   - **Step 2 — Preferences**: Add a target role (e.g. "Software Engineer"), set salary range, configure auto-apply toggle
   - **Step 3 — Resume**: Upload a PDF resume → Claude will parse it (~30–60 seconds)
4. After upload, you'll land on the Dashboard

---

### Test 2 — Check Your Resume Studio

1. Click **"Resume"** in the sidebar
2. You'll see three tabs:
   - **Master Resume** — Claude's ATS-optimized version (copy and use this)
   - **LinkedIn Copy** — Ready-to-paste About section, headline, experience bullets
   - **Parsed Data** — All extracted skills, job history, education

---

### Test 3 — Search for Jobs

1. Click **"Dashboard"** in the sidebar
2. In the search bar, type a role (e.g. "Product Manager") or leave blank to use your target roles
3. Click **"Hunt jobs"**
4. You'll see a toast: *"Searching for… results will appear shortly"*
5. Go to **"Job Queue"** in the sidebar — jobs will appear with fit scores once processed

> ⚠️ Note: The job search pipeline requires a `JOB_SEARCH_API_URL` secret to be configured (see [Connecting Job Sources](#connecting-job-sources) below). Without it, the queue worker logs a warning and skips. Job scoring via Claude works once jobs are in the DB.

---

### Test 4 — Prepare + Apply to a Job

1. In **Job Queue**, click any job card to expand it
2. Click **"Prepare"** → Claude tailors your resume + writes a cover letter (~20–40 seconds)
3. Review the tailored resume preview and cover letter
4. Click:
   - **"Auto-apply"** → queues the job for Playwright automation (requires playwright-service running)
   - **"Mark as applied (manual)"** → records it immediately

---

### Test 5 — Question Bank

1. Click **"Question Bank"** in the sidebar
2. Click **"Seed with AI answers"** → Claude generates personalized answers to 8 common screening questions based on your profile
3. Review and edit any answers
4. Click **"+ Add"** to add custom questions (e.g. "Do you have a non-compete agreement?") and click "AI answer" to auto-generate

---

### Test 6 — Applications Dashboard

Click **"Applications"** in the sidebar to see three lanes:
- **Applied** — all submitted applications
- **Needs You** — blocked auto-applies (video required, CAPTCHA, etc.) with reason labels
- **Expired** — postings that were no longer available

---

## Connecting Job Sources

The job search queue currently expects a REST API at `JOB_SEARCH_API_URL`. You have two options:

### Option A — Use the RapidAPI LinkedIn Jobs Scraper (easiest)
1. Sign up at [rapidapi.com](https://rapidapi.com) and subscribe to **"JSearch"** (free tier: 500 req/month)
2. Add to `.dev.vars`:
   ```ini
   JOB_SEARCH_API_URL=https://jsearch.p.rapidapi.com
   JOB_SEARCH_API_KEY=your-rapidapi-key
   ```
3. Update `worker/src/queue.js` → `handleSearchJobs()` to match JSearch's API shape (the function is clearly marked)

### Option B — Mock jobs for testing
Insert test jobs directly into the local D1 database:
```bash
npx wrangler d1 execute bountyhunter-db --local --command \
  "INSERT INTO jobs (id, user_id, source, external_id, title, company, location, url, description, status)
   VALUES ('test-job-1', 'YOUR_USER_ID', 'linkedin', 'ext-1', 'Senior Software Engineer',
   'Acme Corp', 'Remote', 'https://linkedin.com/jobs/view/123',
   'We are looking for a senior engineer with 5+ years of React and Node.js experience.
   You will lead architecture decisions and mentor junior engineers.
   Requirements: TypeScript, AWS, CI/CD, system design experience.', 'new')"
```
Then trigger scoring from the Job Queue UI.

> Your `user_id` is the UUID created when you registered. Find it in the database:
> ```bash
> npx wrangler d1 execute bountyhunter-db --local --command "SELECT id, email FROM users"
> ```

---

## Optional — Run the Playwright Auto-Apply Service

This runs locally for dev/testing. For production, deploy it to a VPS.

```bash
# New terminal tab
cd playwright-service

# Install Chromium (one-time, ~200MB)
npm run install-browsers

# Start the service
npm run dev
```

The service starts on **http://localhost:3001**.

Test it's alive:
```bash
curl http://localhost:3001/health
# → {"status":"ok"}
```

Now when you click "Auto-apply" on a job in the UI, the worker queue will call this service.

---

## Deploying to Production

### Deploy the Worker
```bash
cd worker
npx wrangler deploy
```

### Deploy the Frontend (Cloudflare Pages)
```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name bountyhunter
```

### Deploy the Playwright Service (VPS)
1. SSH into your VPS (DigitalOcean / Hetzner / Linode)
2. `git clone` the repo, `cd playwright-service`
3. `npm install && npm run install-browsers`
4. Set `SERVICE_TOKEN` env var
5. Run with PM2: `pm2 start npm --name "bountyhunter-pw" -- start`
6. Update `PLAYWRIGHT_SERVICE_URL` and `PLAYWRIGHT_SERVICE_TOKEN` secrets in Wrangler:
   ```bash
   wrangler secret put PLAYWRIGHT_SERVICE_URL    # http://your-vps-ip:3001
   wrangler secret put PLAYWRIGHT_SERVICE_TOKEN  # your shared secret
   ```

---

## Project Structure

```
Bountyhunter/
├── worker/
│   ├── src/
│   │   ├── index.js              ← API entry point
│   │   ├── queue.js              ← Async job pipeline
│   │   ├── lib/
│   │   │   ├── claude.js         ← All AI functions
│   │   │   ├── crypto.js         ← JWT + password hashing
│   │   │   └── r2.js             ← File storage helpers
│   │   ├── middleware/auth.js    ← JWT verification
│   │   └── routes/               ← auth, profile, resume, jobs, applications, questions, dashboard
│   ├── migrations/0001_initial.sql
│   ├── wrangler.toml
│   └── .dev.vars.example         ← Copy to .dev.vars
│
├── frontend/
│   └── src/
│       ├── App.jsx               ← Routes + auth guards
│       ├── context/AuthContext   ← JWT + user state
│       ├── lib/api.js            ← All API calls
│       ├── pages/
│       │   ├── auth/             ← Login, Register
│       │   ├── onboarding/       ← 3-step onboarding
│       │   └── dashboard/        ← Dashboard, JobQueue, Applications, QuestionBank, ResumeStudio, Profile
│       └── components/           ← AppShell, Sidebar
│
└── playwright-service/
    └── src/
        ├── index.js              ← Express HTTP server
        ├── apply.js              ← Platform router
        └── linkedin.js           ← LinkedIn Easy Apply logic
```

---

## Common Issues

| Problem | Fix |
|---|---|
| `database_id = "PLACEHOLDER_..."` error | Run `npm run db:create` and paste the ID into `wrangler.toml` |
| 401 errors from the API | Make sure `JWT_SECRET` is set in `.dev.vars` |
| Resume upload times out | Claude can take 30–90s for large resumes — increase the axios timeout in `api.js` if needed |
| Job search does nothing | `JOB_SEARCH_API_URL` is not set — use Option B (mock jobs) to test scoring |
| Auto-apply always blocked | playwright-service must be running on `:3001` and your LinkedIn session must be logged in |
| Wrangler can't find D1 binding | Run `npm run db:migrate:local` to init the local DB |
