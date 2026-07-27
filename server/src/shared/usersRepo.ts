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

export interface UserRow {
  id: string;
  name: string;
  email: string;
  birthday: string;
  theme: string;
  onboarded: number;
  brief_dismissed: number;
  created_at: number;
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
    db.prepare("UPDATE users SET brief_dismissed = ? WHERE id = ?").run(dismissed ? 1 : 0, id);
  },
};
