import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = await footballService.refreshOdds();
  return { ok: true, detail: `refreshed odds for ${result.updated} fixtures` };
}
