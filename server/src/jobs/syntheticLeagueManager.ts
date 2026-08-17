import { reconcileLeagues } from "../synthetic/leagueManager";
import { JobResult } from "./scheduler";

/** Daily public-league population top-up — see synthetic/leagueManager.ts. */
export async function run(): Promise<JobResult> {
  const result = reconcileLeagues();
  return { ok: true, detail: `topped up ${result.leaguesTopped} league(s), added ${result.membersAdded} membership(s)` };
}
