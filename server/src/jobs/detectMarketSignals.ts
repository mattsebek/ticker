import { runIntelligenceSweep } from "../intelligence/nuggetService";
import { intelligenceConfig } from "../intelligence/intelligenceConfig";
import { JobResult } from "./scheduler";

/** Periodic Intelligence Engine sweep — see intelligence/nuggetService.ts. */
export async function run(): Promise<JobResult> {
  if (!intelligenceConfig.ENABLED) return { ok: true, detail: "intelligence engine disabled (INTELLIGENCE_ENGINE_ENABLED=false)" };

  const result = runIntelligenceSweep();
  return {
    ok: true,
    detail: `${result.candidatesEvaluated} candidate(s) evaluated: ${result.created} created, ${result.updated} updated, ${result.belowThreshold} below threshold`,
  };
}
