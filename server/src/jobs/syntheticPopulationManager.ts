import { reconcilePopulation } from "../synthetic/populationManager";
import { JobResult } from "./scheduler";

/** Daily population reconciliation — see synthetic/populationManager.ts. */
export async function run(): Promise<JobResult> {
  const result = reconcilePopulation();
  return { ok: true, detail: `active=${result.activeBefore} target=${result.targetActiveUsers} created=${result.created} paused=${result.pausedSurplus}` };
}
