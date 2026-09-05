import { fantasyRepo } from "./repo";
import { fantasyConfig } from "./fantasyConfig";
import { marketRepo } from "../market/repo";

export type SetLineupResult = { ok: true; clubIds: string[] } | { ok: false; error: string };

/**
 * Sets a manager's pending Starting Four intent — the one path both the
 * human `PUT /starting-four` route and the synthetic engine's
 * lineupDecisionEngine call, so synthetic users are validated by exactly
 * the same rules a human is (dedupe, ≤MAX_STARTERS, must currently own
 * every club) rather than a parallel, potentially-drifting check.
 */
export function setLineup(userId: string, clubIdsInput: string[]): SetLineupResult {
  if (marketRepo.isInMarginCall(userId)) {
    return { ok: false, error: "Your account is in margin call. Sell a holding or cover a short to restore buying power before changing your lineup." };
  }
  const clubIds = Array.from(new Set(clubIdsInput));
  if (clubIds.length > fantasyConfig.MAX_STARTERS) {
    return { ok: false, error: `You can start at most ${fantasyConfig.MAX_STARTERS} clubs.` };
  }
  const holdingIds = new Set(marketRepo.getHoldings(userId).map((h) => h.club_id));
  if (!clubIds.every((id) => holdingIds.has(id))) {
    return { ok: false, error: "You can only start clubs you currently own." };
  }
  fantasyRepo.setStarterSelection(userId, clubIds);
  return { ok: true, clubIds };
}
