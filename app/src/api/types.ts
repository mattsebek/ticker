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
  points: number;
  average: number;
  best: number;
  canPrev: boolean;
  canNext: boolean;
  nextKickoff: string | null;
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
}

export interface MorningBrief {
  text: string;
  recommendation: string;
  label?: string;
}

export interface TradeCandidateRow extends ClubSummary {
  canAfford: boolean;
}

export interface TradeOptionsResponse {
  mode: "trade" | "buy";
  fixed: ClubSummary;
  cash: number;
  candidates: TradeCandidateRow[];
}

export interface TradePreviewResponse {
  canAfford: boolean;
  availableCash: number;
  budgetImpact: string;
  budgetColor: "green" | "red" | "gray";
  aiExplanationText: string | null;
  release: {
    purchasePriceStr: string;
    avgPtsPerGw: string;
    returnStr: string;
    returnPctStr: string;
    positive: boolean;
  } | null;
  confirmLabel: string;
}
