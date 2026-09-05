import { marketRepo } from "./repo";
import { shortingConfig } from "./shortingConfig";

/**
 * The one piece of margin-call logic in the whole feature — everything else
 * (tradingService's buy/short guard, the sweep job, the portfolio route)
 * just calls this or reads what it already wrote.
 *
 * A margin call is cash falling short of what it would cost to buy back
 * every open short RIGHT NOW (current prices, not entry prices) — the
 * standard maintenance-margin definition. Called after every sell()/cover()
 * (so curing it unlocks the account immediately, not on the next sweep) and
 * by the periodic sweepMarginCalls job (so a price move from someone else's
 * trade, or a fixture settlement, is caught even if the affected user never
 * takes an action themselves).
 */
export function checkAndUpdateMarginCall(userId: string): boolean {
  const cash = marketRepo.getCash(userId);
  const shortValue = marketRepo.getTotalShortMarketValue(userId);
  const isUnderwater = cash < shortValue * shortingConfig.MARGIN_CALL_COVERAGE_PCT;
  const wasInMarginCall = marketRepo.isInMarginCall(userId);

  if (isUnderwater && !wasInMarginCall) {
    marketRepo.setMarginCall(userId, Date.now(), cash, shortValue);
  } else if (!isUnderwater && wasInMarginCall) {
    marketRepo.clearMarginCall(userId, Date.now());
  }

  return isUnderwater;
}
