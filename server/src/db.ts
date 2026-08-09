import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// DATA_DIR lets a host with a persistent volume (e.g. Railway) point the
// SQLite file at the mounted volume path, so it survives redeploys/restarts.
// Unset locally — same relative path as always.
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Just the connection. Every domain (football/, market/, fantasy/,
// shared/usersRepo) owns and migrates its own tables via `db.exec(...)` in
// its own repo.ts, imported on demand — there is deliberately no single
// "schema.sql" god-file for the whole app.
export const db = new Database(path.join(dataDir, "ticker.db"));
db.pragma("journal_mode = WAL");
