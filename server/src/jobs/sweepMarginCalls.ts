import { marketRepo } from "../market/repo";
import { checkAndUpdateMarginCall } from "../market/marginCallService";
import { JobResult } from "./scheduler";

/**
 * Catches a margin call caused by a price move the affected user didn't
 * cause themselves (someone else's trade, a fixture settlement) — sell()
 * and cover() already re-check immediately for the user's own actions, this
 * job is what makes it "continuous" rather than only checked at trade time.
 */
export async function run(): Promise<JobResult> {
  const userIds = marketRepo.getUserIdsWithOpenShorts();
  let failures = 0;
  for (const userId of userIds) {
    try {
      checkAndUpdateMarginCall(userId);
    } catch (err) {
      failures++;
      console.error(`[sweepMarginCalls] failed for user ${userId}:`, err);
    }
  }
  return { ok: failures === 0, detail: `checked ${userIds.length} account(s) with open shorts${failures ? `, ${failures} failure(s)` : ""}` };
}
