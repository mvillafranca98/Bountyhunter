// Helper to fetch user job search preferences from the user_preferences table.
// Returns a plain object safe to pass to scoreJobFit (returns defaults if no row exists).

export async function fetchUserPreferences(db, userId) {
  try {
    // Ensure table exists (no-op after first call per isolate lifetime)
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        user_id TEXT PRIMARY KEY,
        work_style TEXT DEFAULT 'remote',
        deal_breakers TEXT DEFAULT '[]',
        target_industries TEXT DEFAULT '[]',
        experience_level TEXT DEFAULT 'mid',
        languages TEXT DEFAULT '["English"]',
        target_regions TEXT DEFAULT '[]',
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run()
    try { await db.prepare("ALTER TABLE user_preferences ADD COLUMN target_regions TEXT DEFAULT '[]'").run() } catch {}
    try { await db.prepare("ALTER TABLE user_preferences ADD COLUMN disabled_sources TEXT DEFAULT '[]'").run() } catch {}

    const row = await db.prepare(
      'SELECT * FROM user_preferences WHERE user_id = ?'
    ).bind(userId).first()

    if (!row) {
      return {
        work_style: 'any',
        deal_breakers: [],
        target_industries: [],
        experience_level: null,
        languages: [],
        target_regions: [],
        disabled_sources: [],
      }
    }

    return {
      work_style: row.work_style || 'any',
      deal_breakers: JSON.parse(row.deal_breakers || '[]'),
      target_industries: JSON.parse(row.target_industries || '[]'),
      experience_level: row.experience_level || null,
      languages: JSON.parse(row.languages || '[]'),
      target_regions: JSON.parse(row.target_regions || '[]'),
      disabled_sources: JSON.parse(row.disabled_sources || '[]'),
    }
  } catch (e) {
    console.error('fetchUserPreferences error:', e.message)
    return {
      work_style: 'any',
      deal_breakers: [],
      target_industries: [],
      experience_level: null,
      languages: [],
      target_regions: [],
      disabled_sources: [],
    }
  }
}
