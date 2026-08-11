import { randomUUID } from "crypto";
import { db } from "../db";

// Identity only — a user's cash lives in the Market domain (market_accounts),
// not here. This table is infrastructure shared by every domain, not itself
// one of Football/Market/Fantasy.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  birthday TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'dark',
  onboarded INTEGER NOT NULL DEFAULT 0,
  brief_dismissed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
`);

// brief_dismissed_date replaces brief_dismissed's old permanent-forever
// semantics with a per-day one (see isBriefCurrentlyDismissed below) — added
// after the table already shipped, so guard the ALTER for databases that
// already have the column.
try {
  db.exec("ALTER TABLE users ADD COLUMN brief_dismissed_date TEXT");
} catch {
  // already applied
}

const DAY_MS = 86_400_000;
const FIRST_WEEK_MS = 7 * DAY_MS;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  birthday: string;
  theme: string;
  onboarded: number;
  brief_dismissed: number;
  brief_dismissed_date: string | null;
  created_at: number;
}

/**
 * A brand-new account's first week is an onboarding/engagement window — the
 * "Did You Know?" stack (see routes/briefing.ts) should come back every day
 * during it even if dismissed, so a user always sees at least a couple of
 * tips per day rather than swiping it away once and never seeing it again.
 * After the first week, a dismissal is permanent again (the original
 * behavior), matching how it'll work once real per-user AI briefing content
 * replaces the generic tips.
 */
export function isBriefCurrentlyDismissed(user: UserRow): boolean {
  if (!user.brief_dismissed_date) return false;
  const isFirstWeek = Date.now() - user.created_at < FIRST_WEEK_MS;
  return isFirstWeek ? user.brief_dismissed_date === todayStr() : true;
}

export const usersRepo = {
  getById(id: string): UserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  },
  getByEmail(email: string): UserRow | undefined {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email.toLowerCase().trim()) as UserRow | undefined;
  },
  create(name: string, email: string, birthday: string): UserRow {
    const id = randomUUID();
    db.prepare("INSERT INTO users (id, name, email, birthday, theme, onboarded, brief_dismissed, created_at) VALUES (?,?,?,?,'dark',0,0,?)").run(
      id,
      name.trim(),
      email.toLowerCase().trim(),
      birthday,
      Date.now()
    );
    return usersRepo.getById(id)!;
  },
  markOnboarded(id: string) {
    db.prepare("UPDATE users SET onboarded = 1 WHERE id = ?").run(id);
  },
  setBriefDismissed(id: string, dismissed: boolean) {
    db.prepare("UPDATE users SET brief_dismissed = ?, brief_dismissed_date = ? WHERE id = ?").run(dismissed ? 1 : 0, dismissed ? todayStr() : null, id);
  },
  /** Demo/screenshot tooling only — backdates an account so first-week gating (30D/YTD lock, etc.) reads as if it were registered earlier. See /internal/backdate-user. */
  setCreatedAt(id: string, createdAt: number) {
    db.prepare("UPDATE users SET created_at = ? WHERE id = ?").run(createdAt, id);
  },
  /** Wipes every registered account (bots aren't rows in this table). Used by the /internal/reset-users ops action. */
  deleteAll(): number {
    return db.prepare("DELETE FROM users").run().changes;
  },
  listIds(): string[] {
    return (db.prepare("SELECT id FROM users").all() as { id: string }[]).map((r) => r.id);
  },
};
