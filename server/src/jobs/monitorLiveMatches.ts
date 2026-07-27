import { footballRepo } from "../football/repo";
import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

/**
 * Polls in-progress fixtures more eagerly than the general refreshFixtures
 * job — live matches are where status/score change fastest. Idempotent: a
 * quiet season with nothing live is a normal, successful run.
 */
export async function run(): Promise<JobResult> {
  const live = footballRepo.listFixturesByStatus("live");
  if (live.length === 0) return { ok: true, detail: "no live matches" };
  await footballService.refreshFixtures();
  return { ok: true, detail: `polled ${live.length} live fixtures` };
}
