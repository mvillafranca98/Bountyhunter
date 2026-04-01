-- BountyHunter D1 Schema — v1
-- Compatible with SQLite (Cloudflare D1)

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 TEXT PRIMARY KEY,
  email              TEXT UNIQUE NOT NULL,
  password_hash      TEXT NOT NULL,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  phone              TEXT,
  location           TEXT,
  linkedin_url       TEXT,
  work_authorization TEXT DEFAULT 'authorized',   -- authorized, visa_required, citizen
  start_date         TEXT,                          -- ISO date string
  employment_type    TEXT DEFAULT 'full-time',      -- full-time, part-time, contract, any
  auto_apply         INTEGER DEFAULT 0,             -- 0 = user approves, 1 = auto-submit
  fit_threshold      INTEGER DEFAULT 75,            -- min fit score to queue for apply
  onboarding_step    INTEGER DEFAULT 0,             -- 0=profile, 1=prefs, 2=resume, 3=done
  created_at         TEXT DEFAULT (datetime('now')),
  updated_at         TEXT DEFAULT (datetime('now'))
);

-- ─── Salary Preferences ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_preferences (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  min_hourly     REAL,
  max_hourly     REAL,
  min_yearly     REAL,
  max_yearly     REAL,
  preferred_type TEXT DEFAULT 'yearly',   -- hourly | yearly
  currency       TEXT DEFAULT 'USD',
  created_at     TEXT DEFAULT (datetime('now'))
);

-- ─── Target Roles ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS target_roles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  industry   TEXT,
  priority   INTEGER DEFAULT 1           -- 1 = highest
);

-- ─── Resumes ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resumes (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key                TEXT NOT NULL,               -- R2 object key for original PDF
  original_filename     TEXT,
  parsed_data           TEXT,                        -- JSON: skills[], experience[], education[]
  master_resume_text    TEXT,                        -- Claude-polished ATS resume (markdown)
  linkedin_about        TEXT,                        -- Generated LinkedIn About section
  linkedin_experience   TEXT,                        -- Generated LinkedIn Experience bullets
  is_active             INTEGER DEFAULT 1,
  created_at            TEXT DEFAULT (datetime('now'))
);

-- ─── Jobs ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          TEXT NOT NULL,                      -- linkedin | indeed | ziprecruiter
  external_id     TEXT,                               -- platform's own job ID
  title           TEXT NOT NULL,
  company         TEXT NOT NULL,
  location        TEXT,
  url             TEXT NOT NULL,
  description     TEXT,
  requirements    TEXT,                               -- JSON array
  salary_min      REAL,
  salary_max      REAL,
  salary_type     TEXT,                               -- hourly | yearly
  posted_at       TEXT,
  expires_at      TEXT,
  fit_score       INTEGER,                            -- 0-100
  fit_reasoning   TEXT,                               -- JSON: { match_pct, gaps[], highlights[] }
  status          TEXT DEFAULT 'new',
  -- new | scored | ready | applied | needs_manual | expired | low_fit | failed
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, source, external_id)
);

-- ─── Resume Versions (tailored per job) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resume_versions (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  r2_key      TEXT,                                   -- tailored PDF in R2 (null until generated)
  resume_text TEXT NOT NULL,                          -- markdown text used for tailoring
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Applications ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS applications (
  id                    TEXT PRIMARY KEY,
  job_id                TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_version_id     TEXT REFERENCES resume_versions(id),
  cover_letter          TEXT,
  applied_at            TEXT DEFAULT (datetime('now')),
  method                TEXT DEFAULT 'auto',           -- auto | manual
  confirmation_number   TEXT
);

-- ─── Blockers (jobs that couldn't auto-apply) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS blockers (
  id                 TEXT PRIMARY KEY,
  job_id             TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason             TEXT NOT NULL,
  -- video_required | voice_required | captcha | assessment | external_ats | login_required | other
  reason_detail      TEXT,
  screenshot_r2_key  TEXT,
  created_at         TEXT DEFAULT (datetime('now'))
);

-- ─── Question Bank ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS question_bank (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_template TEXT NOT NULL,
  answer            TEXT NOT NULL,
  category          TEXT,
  -- work_style | availability | salary | authorization | work_experience | custom
  is_default        INTEGER DEFAULT 0,                -- 1 = seeded from onboarding answers
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_user_status   ON jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_fit_score     ON jobs(user_id, fit_score DESC);
CREATE INDEX IF NOT EXISTS idx_apps_user          ON applications(user_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_blockers_user      ON blockers(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_user       ON resumes(user_id, is_active);
