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
  projPts: number;
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
  dailyPct: number;
  weeklyPct: number;
  /** False until the club has a recorded price at least 24 hours old — distinguishes "genuinely flat today" from "no day-old data yet" (Top Movers). */
  hasDailyHistory: boolean;
  /** False until the club has a recorded price at least 7 days old — distinguishes "genuinely flat this week" from "no week-old data yet". */
  hasWeeklyHistory: boolean;
  seasonPct: number;
  ownershipPct: number;
  /** Unique buyers vs. sellers since this club's last settlement — the same signal driving its price's demand component, live rather than frozen at the last settlement. */
  netDemand: "buying" | "selling" | "flat";
  /** performancePct is a raw fraction (0.0893 = +8.93%), unlike dailyPct/weeklyPct/seasonPct which are already ×100 — from the most recent real fixture settlement, null until the club's first one. */
  priceBreakdown: { performancePct: number; demandPct: number | null } | null;
  gwPts: number;
  seasonPts: number;
  sparkline: number[];
  form: ("W" | "D" | "L")[];
  nextFixture: NextFixture | null;
}

export interface ClubFixture {
  opp: string;
  code: string;
  home: boolean;
  diff: FixtureDifficulty;
  matchText: string;
  projPts: number;
}

export interface ClubPastFixture {
  opp: string;
  matchText: string;
  actualPts: number;
  projPts: number;
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
  onboarded: boolean;
  heroValue: number;
  weekPct: number;
  seasonPct: number;
  briefDismissed: boolean;
  holdings: HoldingView[];
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
}

export interface ManagerSummary {
  name: string;
  currentValue: number;
  currentValueStr: string;
  portfolioSeries: { t: number; v: number }[];
  ytdPct: number;
  /** Null if this manager has never had a round lock yet. */
  lastLockedRound: number | null;
  points: number;
  starters: ManagerStarterClub[];
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

