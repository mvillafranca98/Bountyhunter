# BountyHunter
**AI-powered job application copilot** — parses your resume, scores job fit, tailors applications, and auto-fills LinkedIn Easy Apply forms.

---

## What it does

1. **Upload your resume** → Claude parses it and generates a Harvard-style ATS-optimized master resume + LinkedIn About section, headline, and experience bullets
2. **Set target roles, salary range, and preferences** during onboarding
3. **Load sample jobs** (AI-generated and scored) or connect a live job API
4. **Fit scoring** — every job gets a 0–100% match score with strengths/gaps breakdown
5. **Prepare** — Claude tailors your resume and writes a custom cover letter per job
6. **Auto-apply** — Playwright navigates LinkedIn Easy Apply and fills the form automatically
7. **Dashboard** — tracks Applied / Needs Manual Attention / Expired / Low Fit

---

## Architecture

```
Bountyhunter/
├── frontend/           React 18 + Vite + Tailwind  →  Cloudflare Pages
├── worker/             Cloudflare Workers (Hono) + D1 + R2 + Queues  →  API
└── playwright-service/ Express + Playwright  →  LinkedIn auto-apply bot
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | v18+ (v20 LTS recommended) | [nodejs.org](https://nodejs.org) |
| npm | v9+ | Comes with Node |
| Wrangler CLI | v4+ | `npm install -g wrangler` |
| Cloudflare account | Free tier | [dash.cloudflare.com](https://dash.cloudflare.com) |
| Anthropic API key | Required | [console.anthropic.com](https://console.anthropic.com) |
| LinkedIn account | Required for auto-apply | [linkedin.com](https://linkedin.com) |

---

## Quickstart (local dev)

### Step 1 — Clone and install

```bash
git clone https://github.com/mvillafranca98/Bountyhunter.git
cd Bountyhunter

# Install all dependencies (worker + frontend + playwright-service + root)
cd worker && npm install && cd ..
cd frontend && npm install && cd ..
cd playwright-service && npm install && cd ..
npm install
```

---

### Step 2 — Log in to Cloudflare

```bash
npx wrangler login
```

Approve access in the browser that opens. One-time only.

---

### Step 3 — Create Cloudflare resources (one-time)

```bash
cd worker
npm run db:create      # → copy the printed database_id into wrangler.toml
npm run r2:create
npm run queue:create
cd ..
```

After `db:create`, open `worker/wrangler.toml` and paste the `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "bountyhunter-db"
database_id = "paste-your-id-here"   # ← replace this
```

---

### Step 4 — Configure secrets

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

Open `worker/.dev.vars` and fill in:

```ini
JWT_SECRET=any-random-32-char-string      # generate at: https://generate-secret.vercel.app/32
ANTHROPIC_API_KEY=sk-ant-your-key-here
PLAYWRIGHT_SERVICE_URL=http://localhost:3001
PLAYWRIGHT_SERVICE_TOKEN=local-dev-token
```

> `.dev.vars` is gitignored — it will never be committed.

---

### Step 5 — Run database migrations

```bash
cd worker && npm run db:migrate:local && cd ..
```

---

### Step 6 — Set up LinkedIn session (one-time)

This opens a real browser window. Log in to LinkedIn manually — 2FA and SSO work. The session is saved locally and reused automatically.

```bash
npm run setup-linkedin
```

You'll see `✅ Logged in! Session saved.` — then the window closes.

> No LinkedIn credentials are stored anywhere. This only needs to be repeated if LinkedIn logs you out (~90 days).

---

### Step 7 — Start everything

```bash
npm run dev
```

This starts all three services at once with color-coded output:

| Service | URL | Color |
|---|---|---|
| Worker (API) | http://localhost:8787 | Cyan |
| Frontend | http://localhost:5173 | Magenta |
| Playwright service | http://localhost:3001 | Yellow |

Open **http://localhost:5173** in your browser.

---

## Testing the Full Flow

### 1. Register & Onboarding

1. Click **"Create one"** on the login page
2. Fill in name, email, password → **Create account**
3. Complete the 3-step onboarding:
   - **Profile** — location, work authorization, start date
   - **Preferences** — target roles, salary range, auto-apply toggle
   - **Resume** — upload a PDF → Claude parses it and generates your master resume (~30–60 seconds)

---

### 2. Resume Studio

Click **"Resume"** in the sidebar. Three tabs:

| Tab | Contents |
|---|---|
| **Master Resume** | Harvard-style ATS resume — rendered with proper headings, bullets, bold text |
| **LinkedIn Copy** | Ready-to-paste About section, headline, and per-role experience bullets |
| **Parsed Data** | Extracted skills, job history, and education |

---

### 3. Load Jobs

Two ways to populate the Job Queue:

**Option A — AI sample jobs (instant, no API key needed):**
1. Go to **Dashboard**
2. Click **"✨ Load 5 AI-scored sample jobs"**
3. Claude generates 5 realistic job postings tailored to your resume and scores each one (~20–30s)
4. Jobs appear in the **Job Queue** with fit scores

**Option B — Live job search:**
1. Type keywords in the search bar (or leave blank to use your target roles)
2. Click **"Hunt jobs"**
3. Requires `JOB_SEARCH_API_URL` to be configured (see [Connecting Job Sources](#connecting-job-sources))

---

### 4. Prepare & Apply

1. In **Job Queue**, click any job card to expand it
2. Click **"Prepare"** → Claude tailors your resume + writes a cover letter (~20–40s)
3. Review the tailored resume preview and cover letter
4. Choose:
   - **"Auto-apply"** → Playwright opens LinkedIn Easy Apply and fills the form automatically
   - **"Mark as applied (manual)"** → records the application immediately without automation

---

### 5. Question Bank

1. Click **"Question Bank"** in the sidebar
2. Click **"Seed with AI answers"** → Claude generates personalized answers to 8 common screening questions
3. Edit any answers, or click **"+ Add"** to add custom questions with AI-generated responses

---

### 6. Applications Dashboard

Click **"Applications"** to see:
- **Applied** — all submitted applications with method (auto / manual)
- **Needs You** — blocked auto-applies with reason labels (CAPTCHA, video required, external ATS, etc.)
- **Expired** — postings no longer available

---

## Connecting Job Sources

The "Hunt jobs" button uses `JOB_SEARCH_API_URL`. Without it, use the **"✨ Load sample jobs"** button instead.

To connect a live source, add to `worker/.dev.vars`:

```ini
JOB_SEARCH_API_URL=https://jsearch.p.rapidapi.com
JOB_SEARCH_API_KEY=your-rapidapi-key
```

Then update `handleSearchJobs()` in `worker/src/queue.js` to match the API response shape. [JSearch on RapidAPI](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) has a free tier (500 req/month).

---

## Deploy to Production

### Worker

```bash
cd worker
npx wrangler secret put JWT_SECRET
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

### Frontend (Cloudflare Pages)

```bash
cd frontend
npm run build
npx wrangler pages deploy dist --project-name bountyhunter
```

### Playwright Service (VPS)

1. SSH into a VPS (DigitalOcean / Hetzner / Fly.io)
2. `git clone` the repo, `cd playwright-service`
3. `npm install && npm run install-browsers`
4. Create `.env` with `PORT=3001` and `SERVICE_TOKEN=your-secret`
5. Run: `npm run setup-linkedin` (one-time, opens browser on the VPS — use VNC/RDP)
6. Start with PM2: `pm2 start npm --name "bountyhunter-pw" -- start`
7. Update secrets in Wrangler:
   ```bash
   wrangler secret put PLAYWRIGHT_SERVICE_URL    # https://your-vps-ip:3001
   wrangler secret put PLAYWRIGHT_SERVICE_TOKEN  # same as SERVICE_TOKEN
   ```

---

## Deploy via GitHub Actions

Every push to `main` auto-deploys the Worker + Frontend.

**Add these secrets in GitHub → Settings → Secrets → Actions:**

| Secret | Where to get it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens) → "Edit Cloudflare Workers" |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → right sidebar |
| `JWT_SECRET` | Same value as in `.dev.vars` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |

> ⚠️ Run `db:create`, `r2:create`, and `queue:create` once locally first — GitHub Actions deploys code but cannot create Cloudflare infrastructure.

---

## Project Structure

```
Bountyhunter/
├── package.json                    ← Root: `npm run dev` starts everything
├── worker/
│   ├── src/
│   │   ├── index.js                ← API entry point (Hono)
│   │   ├── queue.js                ← Async job pipeline (search → score → apply)
│   │   ├── lib/
│   │   │   ├── claude.js           ← All Claude AI functions
│   │   │   ├── crypto.js           ← JWT + password hashing
│   │   │   └── r2.js               ← File storage helpers
│   │   ├── middleware/auth.js      ← JWT verification middleware
│   │   └── routes/                 ← auth, profile, resume, jobs, applications, questions, dashboard
│   ├── migrations/0001_initial.sql ← D1 schema
│   ├── wrangler.toml
│   ├── .dev.vars.example           ← Copy to .dev.vars and fill in secrets
│   └── .dev.vars                   ← ⛔ gitignored — never committed
│
├── frontend/
│   └── src/
│       ├── App.jsx                 ← Routes + auth guards
│       ├── context/AuthContext.jsx ← JWT + user state
│       ├── lib/api.js              ← All API calls (axios)
│       ├── pages/
│       │   ├── auth/               ← Login, Register
│       │   ├── onboarding/         ← 3-step onboarding flow
│       │   └── dashboard/          ← Dashboard, JobQueue, ResumeStudio, Applications, QuestionBank, Profile
│       └── components/             ← AppShell, Sidebar
│
└── playwright-service/
    ├── scripts/
    │   └── setup-linkedin.js       ← One-time LinkedIn session setup (run via `npm run setup-linkedin`)
    ├── src/
    │   ├── index.js                ← Express HTTP server
    │   ├── apply.js                ← Platform router + persistent session
    │   ├── linkedin.js             ← LinkedIn Easy Apply automation
    │   └── blockers.js             ← Blocker reason codes
    ├── .env.example                ← Copy to .env
    ├── .env                        ← ⛔ gitignored — never committed
    └── .session/                   ← ⛔ gitignored — saved LinkedIn cookies
```

---

## Common Issues

| Problem | Fix |
|---|---|
| `database_id = "PLACEHOLDER_..."` error | Run `cd worker && npm run db:create` and paste the ID into `wrangler.toml` |
| 401 errors from the API | Check `JWT_SECRET` is set in `worker/.dev.vars` |
| Resume parsing fails | Ensure `ANTHROPIC_API_KEY` is set in `worker/.dev.vars` and starts with `sk-ant-` |
| Resume upload times out | Claude takes 30–90s for large resumes — this is normal |
| "Load sample jobs" fails | Same as above — check `ANTHROPIC_API_KEY` |
| "Hunt jobs" does nothing | `JOB_SEARCH_API_URL` is not set — use "✨ Load sample jobs" instead |
| Auto-apply fails: session error | Run `npm run setup-linkedin` to refresh the LinkedIn session |
| Auto-apply: `external_ats` blocker | The job doesn't have LinkedIn Easy Apply — apply manually |
| Wrangler: `ECANCELED` error | Delete `.wrangler/state/v3/` WAL files and restart |
| Port already in use | Run `lsof -ti :8787 :5173 :3001 \| xargs kill -9` |

---

## Security Notes

- `worker/.dev.vars` — contains API keys — **never committed** (gitignored)
- `playwright-service/.env` — service token — **never committed** (gitignored)
- `playwright-service/.session/` — LinkedIn browser cookies — **never committed** (gitignored)
- No LinkedIn credentials are ever stored — authentication uses a saved browser session only
- All API keys are passed via environment variables, never hardcoded in source files
