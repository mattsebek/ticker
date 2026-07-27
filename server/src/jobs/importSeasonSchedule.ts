import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = await footballService.importSeasonSchedule();
  return { ok: true, detail: result.skipped ? "already imported" : `imported ${result.imported} fixtures` };
}
