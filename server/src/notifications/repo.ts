import { db } from "../db";

// A user can have multiple tokens (reinstall, new device) — the on/off
// toggle flips `enabled` for all of a user's rows at once, matching how the
// UI presents it as a single per-account setting, not per-device.
db.exec(`
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, token)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

CREATE TABLE IF NOT EXISTS sent_reminders (
  round INTEGER PRIMARY KEY,
  sent_at INTEGER NOT NULL
);
`);

export interface PushTokenRow {
  user_id: string;
  token: string;
  platform: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export const pushRepo = {
  upsertToken(userId: string, token: string, platform: string) {
    const now = Date.now();
    db.prepare(
      `INSERT INTO push_tokens (user_id, token, platform, enabled, created_at, updated_at) VALUES (?,?,?,1,?,?)
       ON CONFLICT(user_id, token) DO UPDATE SET platform = excluded.platform, enabled = 1, updated_at = excluded.updated_at`
    ).run(userId, token, platform, now, now);
  },
  setEnabled(userId: string, enabled: boolean) {
    db.prepare("UPDATE push_tokens SET enabled = ?, updated_at = ? WHERE user_id = ?").run(enabled ? 1 : 0, Date.now(), userId);
  },
  hasEnabledToken(userId: string): boolean {
    return !!db.prepare("SELECT 1 FROM push_tokens WHERE user_id = ? AND enabled = 1 LIMIT 1").get(userId);
  },
  getAllEnabledTokens(): { userId: string; token: string }[] {
    return (db.prepare("SELECT user_id, token FROM push_tokens WHERE enabled = 1").all() as PushTokenRow[]).map((r) => ({
      userId: r.user_id,
      token: r.token,
    }));
  },
  reminderAlreadySent(round: number): boolean {
    return !!db.prepare("SELECT 1 FROM sent_reminders WHERE round = ?").get(round);
  },
  markReminderSent(round: number) {
    db.prepare("INSERT OR IGNORE INTO sent_reminders (round, sent_at) VALUES (?, ?)").run(round, Date.now());
  },
};
