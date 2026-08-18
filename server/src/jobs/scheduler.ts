import { db } from "../db";

// Every job run gets a persisted row here, not just the in-memory
// "last run" snapshot getStatus() exposes — the in-memory record is wiped
// on every restart, which made a real incident ("was this job actually
// running overnight?") unanswerable after the fact once the process had
// since restarted. This is the fix: a real, queryable history.
db.exec(`
CREATE TABLE IF NOT EXISTS job_run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  ran_at INTEGER NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_job_run_log_name_time ON job_run_log(job_name, ran_at DESC);
`);

// Two weeks is enough to look back across several overnight windows
// without letting a 15-minute-interval job accumulate unboundedly.
const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

function logRun(jobName: string, ranAt: number, ok: boolean, detail: string | null, error: string | null) {
  db.prepare("INSERT INTO job_run_log (job_name, ran_at, ok, detail, error) VALUES (?,?,?,?,?)").run(jobName, ranAt, ok ? 1 : 0, detail, error);
  // Prune probabilistically rather than on every write — cheap, and keeps
  // table growth bounded without a dedicated cleanup job.
  if (Math.random() < 0.02) {
    db.prepare("DELETE FROM job_run_log WHERE ran_at < ?").run(Date.now() - RETENTION_MS);
  }
}

export interface JobRunLogEntry {
  ranAt: number;
  ok: boolean;
  detail: string | null;
  error: string | null;
}

/** Real, persisted run history for one job — survives restarts, unlike getStatus()'s in-memory snapshot. See GET /internal/jobs/:name/history. */
export function getJobRunHistory(jobName: string, limit = 50): JobRunLogEntry[] {
  const rows = db.prepare("SELECT ran_at as ranAt, ok, detail, error FROM job_run_log WHERE job_name = ? ORDER BY ran_at DESC LIMIT ?").all(jobName, limit) as any[];
  return rows.map((r) => ({ ranAt: r.ranAt, ok: !!r.ok, detail: r.detail, error: r.error }));
}

export interface JobResult {
  ok: boolean;
  detail: string;
}

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<JobResult>;
  /** Delay before this job's first run, in ms. Defaults to 1500. Stagger jobs that share an external API's rate limit so they don't all burst at boot. */
  initialDelayMs?: number;
}

export interface JobRunRecord {
  name: string;
  lastRunAt: number | null;
  lastOk: boolean | null;
  lastDetail: string | null;
  lastError: string | null;
  runCount: number;
}

/**
 * Background job runner (Layer 3/1 support). Each job is independently
 * scheduled, retryable (errors are caught and logged, never crash the
 * process, and the next interval tries again), and observable (state
 * exposed via `getStatus()` / GET /internal/jobs).
 */
class JobScheduler {
  private records = new Map<string, JobRunRecord>();
  private timers: ReturnType<typeof setInterval>[] = [];

  register(job: JobDefinition) {
    this.records.set(job.name, { name: job.name, lastRunAt: null, lastOk: null, lastDetail: null, lastError: null, runCount: 0 });
    const execute = async () => {
      const record = this.records.get(job.name)!;
      try {
        const result = await job.run();
        record.lastOk = result.ok;
        record.lastDetail = result.detail;
        record.lastError = null;
      } catch (err: any) {
        record.lastOk = false;
        record.lastError = err?.message || String(err);
        console.error(`[job:${job.name}] failed:`, err);
      } finally {
        record.lastRunAt = Date.now();
        record.runCount++;
        logRun(job.name, record.lastRunAt, !!record.lastOk, record.lastDetail, record.lastError);
      }
    };
    // Run once shortly after boot, then on the configured interval.
    setTimeout(execute, job.initialDelayMs ?? 1500);
    this.timers.push(setInterval(execute, job.intervalMs));
  }

  getStatus(): JobRunRecord[] {
    return Array.from(this.records.values());
  }

  stopAll() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }
}

export const scheduler = new JobScheduler();
