import { fantasyRepo } from "../fantasy/repo";
import { leagueService } from "../fantasy/leagueService";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const currentRound = Math.max(1, fantasyRepo.maxScoredRound());
  const result = leagueService.recalculateAllStandingsCaches(currentRound);
  return { ok: true, detail: `recalculated standings for ${result.leaguesUpdated} leagues (round ${currentRound})` };
}
