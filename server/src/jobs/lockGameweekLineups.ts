import { gameweekService } from "../fantasy/gameweekService";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = gameweekService.lockPendingLineups();
  if (!result) return { ok: true, detail: "no lineup lock due yet" };
  return { ok: true, detail: `locked ${result.locked} lineups for round ${result.round}` };
}
