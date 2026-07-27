export interface JobResult {
  ok: boolean;
  detail: string;
}

export interface JobDefinition {
  name: string;
  intervalMs: number;
  run: () => Promise<JobResult>;
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
      }
    };
    // Run once shortly after boot, then on the configured interval.
    setTimeout(execute, 1500);
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
