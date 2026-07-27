import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = await footballService.refreshStandings();
  return { ok: true, detail: `refreshed ${result.updated} standings rows` };
}
