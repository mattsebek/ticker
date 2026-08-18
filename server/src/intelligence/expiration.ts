import { gameweekService } from "../fantasy/gameweekService";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type ExpirationClass = "INTRADAY_ACTIVITY" | "DAILY_MARKET_SIGNAL" | "MATCHWEEK_ACTIVITY" | "SEASON_MILESTONE";

/** Maps each concrete signal type to one of the spec's four expiration classes (section 38). */
const SIGNAL_EXPIRATION_CLASS: Record<string, ExpirationClass> = {
  BUY_VOLUME_SPIKE: "INTRADAY_ACTIVITY",
  SELL_VOLUME_SPIKE: "INTRADAY_ACTIVITY",
  NET_BUYING_SPIKE: "INTRADAY_ACTIVITY",
  NET_SELLING_SPIKE: "INTRADAY_ACTIVITY",
  PRICE_GAIN: "DAILY_MARKET_SIGNAL",
  PRICE_DROP: "DAILY_MARKET_SIGNAL",
  PPS_HIGH: "DAILY_MARKET_SIGNAL",
  PPS_SPIKE: "DAILY_MARKET_SIGNAL",
  PPS_DROP: "DAILY_MARKET_SIGNAL",
  PRICE_PRESSURE_DIVERGENCE: "DAILY_MARKET_SIGNAL",
  OWNERSHIP_GAIN: "DAILY_MARKET_SIGNAL",
  OWNERSHIP_DROP: "DAILY_MARKET_SIGNAL",
  PRICE_SEASON_HIGH: "SEASON_MILESTONE",
  PRICE_SEASON_LOW: "SEASON_MILESTONE",
  OWNERSHIP_MILESTONE: "SEASON_MILESTONE",
  MOST_OWNED_CLUB: "SEASON_MILESTONE",
  SMART_MONEY: "MATCHWEEK_ACTIVITY",
  MARKET_CALLED_IT: "MATCHWEEK_ACTIVITY",
  MARKET_GOT_IT_WRONG: "MATCHWEEK_ACTIVITY",
  BUYING_THE_DIP: "MATCHWEEK_ACTIVITY",
  SELLING_THE_RALLY: "MATCHWEEK_ACTIVITY",
  CROWDED_TRADE: "MATCHWEEK_ACTIVITY",
  UNPOPULAR_WINNER: "MATCHWEEK_ACTIVITY",
  MANUAL: "DAILY_MARKET_SIGNAL",
};

/** Default expires_at for a freshly-generated candidate — spec section 38's four default rules, admin can always override on publish/edit. */
export function defaultExpiresAt(signalType: string, generatedAt: number, currentRound: number): number | null {
  const cls = SIGNAL_EXPIRATION_CLASS[signalType] ?? "DAILY_MARKET_SIGNAL";
  switch (cls) {
    case "INTRADAY_ACTIVITY":
      return generatedAt + 24 * HOUR;
    case "DAILY_MARKET_SIGNAL":
      return generatedAt + 48 * HOUR;
    case "MATCHWEEK_ACTIVITY": {
      const nextDeadline = gameweekService.deadlineForRound(currentRound + 1);
      return nextDeadline ? new Date(nextDeadline).getTime() : generatedAt + 7 * DAY;
    }
    case "SEASON_MILESTONE":
      return generatedAt + 14 * DAY;
  }
}
