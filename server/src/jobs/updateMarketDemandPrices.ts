import { runMarketTick } from "../market/marketDemandService";
import { JobResult } from "./scheduler";

/** Market Pricing V2's demand clock — independent of fixture settlement, see market/marketDemandService.ts. */
export async function run(): Promise<JobResult> {
  const result = runMarketTick();
  const ok = result.failures === 0;
  return {
    ok,
    detail: `tick ${result.tickId}: evaluated ${result.clubsEvaluated} club(s), ${result.clubsChanged} price(s) changed${result.failures ? `, ${result.failures} failure(s)` : ""}`,
  };
}
