export type FixtureDifficulty = "Easy" | "Medium" | "Hard";

/** One real portfolio-value observation — emitted whenever a held club's price actually changed. */
export interface ChartPoint {
  t: number;
  v: number;
}

export interface NextFixture {
  opp: string;
  home: boolean;
  diff: FixtureDifficulty;
  matchText: string;
  projPts: number | null;
  /** Raw ISO kickoff — matchText is already human-formatted, this is for sorting (e.g. Portfolio's cross-club Upcoming Fixtures list). */
  kickoff: string;
}

export interface ClubSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  /** Final points from the club's last top-flight campaign — a stable proxy for preseason title expectations. Null for newly-promoted clubs or when unavailable. */
  priorSeasonPoints: number | null;
  price: number;
  /** The club's real, never-changes opening price for the season — the Market table's "Opening Value" column. */
  openingPrice: number;
  dailyPct: number;
  weeklyPct: number;
  /** False until the club has a recorded price at least 24 hours old — distinguishes "genuinely flat today" from "no day-old data yet" (Top Movers). */
  hasDailyHistory: boolean;
  /** False until the club has a recorded price at least 7 days old — distinguishes "genuinely flat this week" from "no week-old data yet". */
  hasWeeklyHistory: boolean;
  seasonPct: number;
  ownershipPct: number;
  /** % of users with an open short position in this club — a separate metric from ownershipPct, never derived from it (a short user is never counted as an owner). */
  shortPct: number;
  /** Unique buyers vs. sellers since this club's last settlement — the same signal driving its price's demand component, live rather than frozen at the last settlement. */
  netDemand: "buying" | "selling" | "flat";
  /** A richer 5-level read of the same underlying demand signal as netDemand — includes shorting/covering (Shorting V1 BR-18). */
  marketSentiment: "Very Bullish" | "Bullish" | "Neutral" | "Bearish" | "Very Bearish";
  /** Raw -1..1 signal behind marketSentiment — null before the club's first ever market tick. */
  marketSentimentScore: number | null;
  /** performancePct is a raw fraction (0.0893 = +8.93%), unlike dailyPct/weeklyPct/seasonPct which are already ×100 — from the most recent real fixture settlement, null until the club's first one. */
  priceBreakdown: { performancePct: number; demandPct: number | null } | null;
  gwPts: number;
  seasonPts: number;
  sparkline: number[];
  /** Whole-season shape (opening price through now) — used for the "YTD" toggle, distinct from `sparkline`'s recent-only tail. */
  sparklineSeason: number[];
  form: ("W" | "D" | "L")[];
  nextFixture: NextFixture | null;
  /** Only present when requested via GET /clubs?fixtures=1 (the onboarding club picker) — omitted everywhere else clubSummary() is used. */
  upcomingFixtures?: ClubFixture[];
  /** Only present on GET /clubs (the Market table) — the active gameweek's projected points, and actual points once that fixture is finished (null, not 0, until then). */
  activeGwProjPts?: number | null;
  activeGwActualPts?: number | null;
}

export interface ClubFixture {
  round: number;
  opp: string;
  code: string;
  home: boolean;
  diff: FixtureDifficulty;
  matchText: string;
  projPts: number | null;
}

export interface ClubPastFixture {
  opp: string;
  matchText: string;
  actualPts: number;
  projPts: number | null;
  result: "W" | "D" | "L";
}

export interface MarketMatchupSide {
  clubId: string;
  name: string;
  code: string;
  color: string;
  projPts: number | null;
  actualPts: number | null;
}

export interface MarketMatchup {
  fixtureId: string;
  round: number;
  status: "scheduled" | "live" | "finished" | "postponed";
  kickoff: string;
  scoreStr: string | null;
  home: MarketMatchupSide;
  away: MarketMatchupSide;
}

export interface ClubDetail extends ClubSummary {
  series: number[];
  /** Price series clipped to the last 30 days, for the club card's month-performance sparkline. */
  monthSeries: number[];
  fixtures: ClubFixture[];
  /** Last two played matches, most recent first. */
  pastFixtures: ClubPastFixture[];
  news: { h: string; m: string };
}

export interface HoldingView extends ClubSummary {
  purchasePrice: number;
  /** Whether this club is in the manager's pending (not-yet-locked) Starting Four intent. */
  inStartingFour: boolean;
  /** Backs the Portfolio screen's Upcoming Fixtures table (3 columns per club) — separate from ClubSummary's own single nextFixture. */
  upcomingFixtures: ClubFixture[];
}

/** A held short position — deliberately NOT a ClubSummary/HoldingView variant (Shorting V1 BR-20: don't present it like a traditional owned asset). */
export interface ShortPositionView {
  clubId: string;
  name: string;
  code: string;
  color: string;
  entryPrice: number;
  currentPrice: number;
  /** entryPrice - currentPrice: positive when the price has fallen since the short was opened. */
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedRound: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  birthday: string;
  cash: number;
  theme: "light" | "dark";
  onboarded: boolean;
  hasHoldings: boolean;
  briefDismissed: boolean;
  joinDateStr: string;
  createdAt: number;
}

export interface PortfolioResponse {
  cash: number;
  /** Cash minus collateral reserved by open shorts — what's actually spendable (Shorting V1 BR-17). Equal to cash when nothing is shorted. */
  buyingPower: number;
  onboarded: boolean;
  heroValue: number;
  weekPct: number;
  seasonPct: number;
  briefDismissed: boolean;
  holdings: HoldingView[];
  shorts: ShortPositionView[];
  /** Active while cash can't cover open shorts at current prices — blocks Buy/Short/lineup changes until cured by selling or covering (Shorting V1 margin calls). */
  marginCall: { active: boolean; since: string | null; shortfall: number };
}

export interface GameweekResponse {
  gwNumber: number;
  /** The round nextKickoff's countdown refers to — one ahead of gwNumber once real history exists. */
  pendingRound: number;
  points: number;
  average: number;
  best: number;
  canPrev: boolean;
  canNext: boolean;
  nextKickoff: string | null;
  lineupSet: boolean;
}

export interface ScoreBreakdown {
  result: "win" | "draw" | "loss";
  resultPoints: number;
  goalsFor: number;
  goalsAgainst: number;
  goalPoints: number;
  cleanSheet: boolean;
  cleanSheetPoints: number;
  total: number;
}

export interface GameweekClubDetail {
  clubId: string;
  name: string;
  code: string;
  color: string;
  opponent: string;
  isHome: boolean;
  matchText: string;
  status: string;
  scoreStr: string | null;
  projectedPoints: number;
  actualPoints: number | null;
  pctOfProjected: number | null;
  breakdown: ScoreBreakdown | null;
}

export interface GameweekDetailResponse {
  round: number;
  /** True when this round hasn't locked yet — starters/bench reflect current holdings + mutable pending selection, and the client should let the manager tap to reassign them. */
  isPending: boolean;
  maxStarters: number;
  canPrev: boolean;
  canNext: boolean;
  nextKickoff: string | null;
  starters: GameweekClubDetail[];
  bench: GameweekClubDetail[];
  /** Sum of Bench clubs' actual points so far — informational only, never counted in the Gameweek score. */
  benchPoints: number;
}

export interface LeagueListRow {
  id: string;
  name: string;
  rankStr: string;
  membersStr: string;
}

export interface ManagerStarterClub {
  clubId: string;
  name: string;
  code: string;
  color: string;
  points: number;
  /** Null if this club is no longer held (sold since this round locked). */
  purchasePrice: number | null;
  currentPrice: number | null;
}

export interface ManagerSummary {
  name: string;
  currentValue: number;
  currentValueStr: string;
  portfolioSeries: { t: number; v: number }[];
  ytdPct: number;
  /** Rank among EVERY manager with a market account (human + synthetic), as "top N%" — rank 1 of 500 is 0.2. */
  topPct: number;
  isTopFivePct: boolean;
  /** Null if this manager has never had a round lock yet. */
  lastLockedRound: number | null;
  /** The round this response's starters/bench/points are actually for — defaults to lastLockedRound, but can be any earlier round via the `round` param. Null alongside lastLockedRound when nothing's locked yet. */
  round: number | null;
  canPrev: boolean;
  canNext: boolean;
  points: number;
  starters: ManagerStarterClub[];
  bench: ManagerStarterClub[];
}

export interface PublicLeagueRow {
  id: string;
  name: string;
  membersStr: string;
}

export interface StandingsRow {
  memberId: string;
  rank: number;
  name: string;
  you: boolean;
  portfolio: number;
  portfolioStr: string;
  points: number;
  /** Rank among EVERY manager with a market account (human + synthetic), as "top N%". */
  topPct: number;
  isTopFivePct: boolean;
}

export interface BriefSegment {
  text: string;
  tone?: "pos" | "neg";
}

export interface BriefCard {
  label: string;
  emoji: string;
  segments: BriefSegment[];
  cta?: { text: string; action: string };
}

export interface MorningBrief {
  text: string;
  recommendation: string;
  label?: string;
}

export interface BuyPreviewResponse {
  clubName: string;
  price: number;
  priceStr: string;
  availableCash: number;
  availableCashStr: string;
  cashAfter: number;
  cashAfterStr: string;
  alreadyOwned: boolean;
  marginCallActive: boolean;
  canAfford: boolean;
  confirmLabel: string;
}

export interface GameweekPreview {
  id: string;
  slug: string;
  round: number;
  headline: string;
  body: string;
  publishedAt: string;
  icon: "football" | "trophy" | "flame" | "chartCandle" | "rocket" | "calendar";
  badge: "none" | "trending";
  background: "diagonal" | "vertical" | "radial" | "card";
  color: "ink" | "white";
}

/** One entry in an article page's "Past Columns" footer — everything but the body. */
export interface PastColumn {
  slug: string;
  round: number;
  headline: string;
  publishedAt: string;
}

export interface SellPreviewResponse {
  clubName: string;
  currentPrice: number;
  currentPriceStr: string;
  purchasePrice: number;
  purchasePriceStr: string;
  gain: number;
  gainStr: string;
  gainPct: number;
  gainPctStr: string;
  cashAfter: number;
  cashAfterStr: string;
  owned: boolean;
  confirmLabel: string;
}

export interface ShortPreviewResponse {
  clubName: string;
  price: number;
  priceStr: string;
  buyingPower: number;
  buyingPowerStr: string;
  buyingPowerAfter: number;
  buyingPowerAfterStr: string;
  alreadyOwned: boolean;
  alreadyShorted: boolean;
  marginCallActive: boolean;
  canShort: boolean;
  confirmLabel: string;
}

export interface CoverPreviewResponse {
  clubName: string;
  currentPrice: number;
  currentPriceStr: string;
  entryPrice: number;
  entryPriceStr: string;
  gain: number;
  gainStr: string;
  gainPct: number;
  gainPctStr: string;
  shorted: boolean;
  confirmLabel: string;
}

