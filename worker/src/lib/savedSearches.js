export async function ensureSavedSearchesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS saved_searches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      keywords TEXT NOT NULL,
      frequency TEXT DEFAULT 'daily',
      is_active INTEGER DEFAULT 1,
      last_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, keywords)
    )
  `).run()
}
