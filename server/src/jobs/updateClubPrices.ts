import { priceUpdateService } from "../market/priceUpdateService";
import { JobResult } from "./scheduler";

/** Independently deployable/retryable from settleCompletedMatches — a no-op if that job already covered everything. */
export async function run(): Promise<JobResult> {
  const result = priceUpdateService.applyAllPendingPriceImpacts();
  return { ok: true, detail: `applied price impact for ${result.updatedFixtures} fixtures` };
}
