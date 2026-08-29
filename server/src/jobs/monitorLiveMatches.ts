import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

/**
 * The only job that asks the provider for genuine in-progress matches
 * (live=all) — refreshFixtures() only ever requests status:"FT", so a
 * fixture's status could never actually reach "live" before this existed.
 * Runs unconditionally on its own tight interval (see JOB_MONITOR_LIVE_MS)
 * rather than gating on any already-"live" DB row, since that row can't
 * exist yet the first time a match goes live. Idempotent: a quiet moment
 * with nothing live is a normal, successful run.
 */
export async function run(): Promise<JobResult> {
  const result = await footballService.refreshLiveFixtures();
  return { ok: true, detail: `updated ${result.updated} live fixture(s)` };
}
