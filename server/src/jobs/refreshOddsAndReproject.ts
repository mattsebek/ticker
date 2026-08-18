import { runOddsRefreshAndReproject } from "../projection/projectionService";
import { recomputeAllForwardProjections } from "../projection/forwardProjectionService";
import { projectionConfig } from "../projection/projectionConfig";
import { JobResult } from "./scheduler";

/**
 * One full projection-engine cycle: odds refresh + reproject, then forward
 * projections recomputed on top of whatever just landed — same job, not a
 * separate schedule, so forward projections never race ahead of that
 * cycle's own fixture projections. Shadow mode: touches only projection/'s
 * own tables.
 */
export async function run(): Promise<JobResult> {
  if (!projectionConfig.ENABLED) return { ok: true, detail: "projection engine disabled (PROJECTION_ENGINE_ENABLED=false)" };

  const refresh = await runOddsRefreshAndReproject();
  const forward = recomputeAllForwardProjections();
  return {
    ok: true,
    detail: `odds: ${refresh.fixturesMatched} matched/${refresh.fixturesUnmatched} unmatched, ${refresh.projectionsWritten} projection(s) updated; forward: ${forward.clubsUpdated}/${forward.clubsEvaluated} club(s) updated`,
  };
}
