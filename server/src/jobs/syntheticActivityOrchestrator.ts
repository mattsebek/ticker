import { runOrchestratorBatch } from "../synthetic/orchestrator";
import { JobResult } from "./scheduler";

/** Hourly synthetic trade + lineup evaluation pass — see synthetic/orchestrator.ts. */
export async function run(): Promise<JobResult> {
  const result = runOrchestratorBatch();
  return { ok: result.failures === 0, detail: `evaluated ${result.evaluated} synthetic user(s)${result.failures ? `, ${result.failures} failure(s)` : ""}` };
}
