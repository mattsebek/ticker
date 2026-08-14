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
  seasonPct: number;
  ownershipPct: number;
  gwPts: number;
  seasonPts: number;
  sparkline: number[];
  form: ("W" | "D" | "L")[];
  nextFixture: NextFixture | null;
}

export interface ClubFixture {
  opp: string;
  home: boolean;
  diff: FixtureDifficulty;
  matchText: string;
  projPts: number;
}

export interface ClubDetail extends ClubSummary {
  series: number[];
  fixtures: ClubFixture[];
  news: { h: string; m: string };
}

export interface HoldingView extends ClubSummary {
  purchasePrice: number;
  /** Whether this club is in the manager's pending (not-yet-locked) Starting Four intent. */
  inStartingFour: boolean;
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

