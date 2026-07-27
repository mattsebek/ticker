import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = await footballService.refreshFixtures();
  return { ok: true, detail: `refreshed ${result.updated} fixtures` };
}
