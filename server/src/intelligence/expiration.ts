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

/**
 * Cross-window cooldown, keyed off the same class as expiry: how long a
 * still-true condition for a given (signalType, clubId) pair goes without
 * re-alerting, independent of the detector's own dedup-key granularity
 * (day bucket, fixture id, etc). Without this, a persistently-true
 * condition — a club sitting above the crowded-ownership threshold every
 * gameweek, a club with chronically elevated PPS every day — generates a
 * "fresh" candidate every single day/gameweek it remains true, forever,
 * since each of those windowLabels is technically a new dedup key. The
 * cooldown mirrors the expiry duration deliberately: don't re-alert on the
 * same story before the previous alert about it would even have expired.
 */
export function cooldownMs(signalType: string): number {
  const cls = SIGNAL_EXPIRATION_CLASS[signalType] ?? "DAILY_MARKET_SIGNAL";
  switch (cls) {
    case "INTRADAY_ACTIVITY":
      return 24 * HOUR;
    case "DAILY_MARKET_SIGNAL":
      return 48 * HOUR;
    case "MATCHWEEK_ACTIVITY":
      return 7 * DAY;
    case "SEASON_MILESTONE":
      return 14 * DAY;
  }
}

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
