-- BountyHunter D1 Migration — v2
-- Adds work_type, subscription detection, company watchlist, and interview prep

-- ─── Work type + subscription on jobs ──────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN work_type TEXT DEFAULT 'unknown';
-- Values: remote | hybrid | onsite | unknown

ALTER TABLE jobs ADD COLUMN requires_subscription INTEGER DEFAULT 0;
-- 0 = freely accessible, 1 = paywall/subscription required

ALTER TABLE jobs ADD COLUMN subscription_hint TEXT;
-- e.g. "LinkedIn Premium may be required to apply"

-- ─── Company watchlist (for ATS scraping) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_watchlist (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL,
  ats_type        TEXT DEFAULT 'greenhouse',
  -- greenhouse | lever | ashby | wellfound | generic
  ats_slug        TEXT NOT NULL,
  -- slug used in API URL, e.g. "stripe" → api.greenhouse.io/v1/boards/stripe/jobs
  website_url     TEXT,
  last_scanned_at TEXT,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, ats_type, ats_slug)
);

-- ─── Interview prep per job ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_prep (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  questions  TEXT NOT NULL,
  -- JSON array: [{question, type, answer, star_situation, star_task, star_action, star_result}]
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(job_id, user_id)
);

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_work_type    ON jobs(user_id, work_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_user    ON company_watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_job     ON interview_prep(job_id, user_id);
