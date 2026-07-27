import { settlementService } from "../fantasy/settlementService";
import { JobResult } from "./scheduler";

export async function run(): Promise<JobResult> {
  const result = settlementService.settleAllPending();
  return { ok: true, detail: `settled ${result.settledCount} fixtures` };
}
