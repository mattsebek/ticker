import { lockAndSettle } from "../projection/benchmarkLockService";
import { projectionConfig } from "../projection/projectionConfig";
import { JobResult } from "./scheduler";

/**
 * Tight interval, local-database-only (unmetered) — see
 * benchmarkLockService.ts's doc comment for why a fast poll on fixture
 * status, not a kickoff-timestamp comparison, is what correctly implements
 * the pre-kickoff benchmark lock.
 */
export async function run(): Promise<JobResult> {
  if (!projectionConfig.ENABLED) return { ok: true, detail: "projection engine disabled (PROJECTION_ENGINE_ENABLED=false)" };
  const result = lockAndSettle();
  return { ok: true, detail: `locked ${result.locked} (${result.skippedNoProjection} skipped, no projection), settled ${result.settled}` };
}
