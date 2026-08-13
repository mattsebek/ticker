import { randomUUID } from "crypto";
import { db } from "../db";

// Ephemeral verification codes for both registration and login — kept
// separate from `users` so an unverified signup never creates a real user
// row (see routes/auth.ts's /verify handler, the only place that reads
// `payload` and actually creates the account).
db.exec(`
CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_otp_codes_email ON otp_codes(email);
`);

export type OtpPurpose = "register" | "login";

export interface OtpRow {
  id: string;
  email: string;
  code: string;
  purpose: OtpPurpose;
  payload: string | null;
  attempts: number;
  expires_at: number;
  consumed_at: number | null;
  created_at: number;
}

const MAX_ATTEMPTS = 5;

export const otpRepo = {
  create(email: string, code: string, purpose: OtpPurpose, payload: string | null, expiresAt: number): OtpRow {
    const id = randomUUID();
    db.prepare(
      "INSERT INTO otp_codes (id, email, code, purpose, payload, attempts, expires_at, created_at) VALUES (?,?,?,?,?,0,?,?)"
    ).run(id, email.toLowerCase().trim(), code, purpose, payload, expiresAt, Date.now());
    return otpRepo.getById(id)!;
  },
  getById(id: string): OtpRow | undefined {
    return db.prepare("SELECT * FROM otp_codes WHERE id = ?").get(id) as OtpRow | undefined;
  },
  /** Most recent unconsumed, unexpired code for an email — null/undefined if none is active. */
  getLatestActive(email: string): OtpRow | undefined {
    return db
      .prepare("SELECT * FROM otp_codes WHERE email = ? AND consumed_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1")
      .get(email.toLowerCase().trim(), Date.now()) as OtpRow | undefined;
  },
  incrementAttempts(id: string) {
    db.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").run(id);
  },
  consume(id: string) {
    db.prepare("UPDATE otp_codes SET consumed_at = ? WHERE id = ?").run(Date.now(), id);
  },
  maxAttempts: MAX_ATTEMPTS,
};
