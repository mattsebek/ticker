import { CandidateSignal } from "./types";

export interface GeneratedCopy {
  category: string;
  emoji: string;
  headline: string;
  body: string;
  ctaClubId: string | null;
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const round1 = (n: number) => n.toFixed(1);

/**
 * Deterministic, per-signal-type sentence templates — same "generated FROM
 * real data, never fixed flavor text" approach as the existing
 * briefing/commentaryService.ts, just extended to the Intelligence
 * Engine's richer signal vocabulary. `variant` cycles between 2 phrasings
 * per signal type so the admin's "Regenerate" button does something real
 * without needing an LLM. This is the one module a future real-AI pass
 * would replace — nothing else in the pipeline (detection, scoring, dedup,
 * persistence, admin workflow) would need to change.
 */
export function generateCopy(signal: CandidateSignal, clubName: string | null, variant = 0): GeneratedCopy {
  const club = clubName ?? "This club";
  const f = signal.facts;
  const v = variant % 2;
  const ctaClubId = signal.clubId;

  switch (signal.signalType) {
    case "BUY_VOLUME_SPIKE":
      return {
        category: "HEATING_UP",
        emoji: "🔥",
        headline: "Heating Up",
        body:
          v === 0
            ? `${club}'s buying volume is ${pct((f.ratio as number) - 1)} above its trailing average — ${f.count} buys in the last 24 hours.`
            : `Buyers are piling into ${club}: ${f.count} buys today, ${round1(f.ratio as number)}x its normal pace.`,
        ctaClubId,
      };
    case "SELL_VOLUME_SPIKE":
      return {
        category: "PAPER_HANDS",
        emoji: "📉",
        headline: "Paper Hands",
        body:
          v === 0
            ? `${club} is seeing its heaviest sell-off in a while — ${f.count} sells in the last 24 hours, ${round1(f.ratio as number)}x the norm.`
            : `Sellers are moving fast on ${club}: sell volume is ${pct((f.ratio as number) - 1)} above its trailing average.`,
        ctaClubId,
      };
    case "NET_BUYING_SPIKE":
      return {
        category: "HEATING_UP",
        emoji: "🔥",
        headline: "Heating Up",
        body:
          v === 0
            ? `${club} saw ${f.netBuyers} net buyers against just ${f.netSellers} sellers in the last 24 hours — a lopsided vote of confidence.`
            : `The crowd is one-sided on ${club} right now: ${f.netBuyers} buyers to ${f.netSellers} sellers.`,
        ctaClubId,
      };
    case "NET_SELLING_SPIKE":
      return {
        category: "PAPER_HANDS",
        emoji: "📉",
        headline: "Paper Hands",
        body:
          v === 0
            ? `${club} saw ${f.netSellers} net sellers against just ${f.netBuyers} buyers in the last 24 hours.`
            : `Exits are piling up on ${club}: ${f.netSellers} sellers to only ${f.netBuyers} buyers in the last day.`,
        ctaClubId,
      };
    case "PRICE_GAIN":
      return {
        category: "BREAKOUT",
        emoji: "🚀",
        headline: "Breakout",
        body:
          v === 0
            ? `${club} is up ${pct(f.pct as number)} in the last 24 hours, from $${(f.oldPrice as number).toFixed(2)} to $${(f.newPrice as number).toFixed(2)}.`
            : `${club}'s Ticker price jumped ${pct(f.pct as number)} today — one of the market's biggest movers.`,
        ctaClubId,
      };
    case "PRICE_DROP":
      return {
        category: "COOLING_OFF",
        emoji: "🧊",
        headline: "Cooling Off",
        body:
          v === 0
            ? `${club} is down ${pct(Math.abs(f.pct as number))} in the last 24 hours, from $${(f.oldPrice as number).toFixed(2)} to $${(f.newPrice as number).toFixed(2)}.`
            : `${club}'s Ticker price slid ${pct(Math.abs(f.pct as number))} today.`,
        ctaClubId,
      };
    case "PRICE_SEASON_HIGH":
      return {
        category: "NEW_HIGH",
        emoji: "📈",
        headline: "New High",
        body: `${club} just hit a new season-high Ticker price of $${(f.price as number).toFixed(2)}.`,
        ctaClubId,
      };
    case "PRICE_SEASON_LOW":
      return {
        category: "NEW_LOW",
        emoji: "📉",
        headline: "New Low",
        body: `${club} just touched a new season-low Ticker price of $${(f.price as number).toFixed(2)}.`,
        ctaClubId,
      };
    case "PPS_HIGH":
      return {
        category: "PRESSURE_BUILDING",
        emoji: "👀",
        headline: "Pressure Building",
        body: `${club}'s Price Pressure Score sits at ${f.score} — one of the strongest reads in the market right now.`,
        ctaClubId,
      };
    case "PPS_SPIKE":
      return {
        category: "PRESSURE_BUILDING",
        emoji: "👀",
        headline: "Pressure Building",
        body:
          v === 0
            ? `${club}'s Price Pressure Score jumped from ${f.previousScore} to ${f.currentScore} this week.`
            : `Something's brewing at ${club} — its Price Pressure Score climbed ${f.delta} points recently.`,
        ctaClubId,
      };
    case "PPS_DROP":
      return {
        category: "PRESSURE_COOLING",
        emoji: "🧊",
        headline: "Pressure Cooling",
        body: `${club}'s Price Pressure Score fell from ${f.previousScore} to ${f.currentScore} — the market's getting quieter here.`,
        ctaClubId,
      };
    case "PRICE_PRESSURE_DIVERGENCE":
      return {
        category: "PRESSURE_BUILDING",
        emoji: "👀",
        headline: "Pressure Building",
        body: `${club}'s price barely moved (${pct(f.pricePct as number)}), but the market underneath it is getting louder — its Price Pressure Score jumped from ${f.previousScore} to ${f.currentScore}.`,
        ctaClubId,
      };
    case "OWNERSHIP_GAIN":
      return {
        category: "MARKET_MOVER",
        emoji: "📈",
        headline: "Market Mover",
        body: `${club}'s ownership is climbing fast — now held by ${pct(f.ownershipPctNow as number)} of active managers.`,
        ctaClubId,
      };
    case "OWNERSHIP_DROP":
      return {
        category: "PAPER_HANDS",
        emoji: "📉",
        headline: "Paper Hands",
        body: `${club} is losing holders quickly — ownership has fallen to ${pct(f.ownershipPctNow as number)} of active managers.`,
        ctaClubId,
      };
    case "OWNERSHIP_MILESTONE":
      return {
        category: "MILESTONE",
        emoji: "🎉",
        headline: "Milestone",
        body: `${club} just crossed ${f.milestone} managers holding it in Ticker.`,
        ctaClubId,
      };
    case "MOST_OWNED_CLUB":
      return {
        category: "MOST_OWNED",
        emoji: "👑",
        headline: "Most Owned",
        body: `${club} is now Ticker's most-owned club, held by ${pct(f.ownershipPct as number)} of active managers.`,
        ctaClubId,
      };
    case "SMART_MONEY":
      return {
        category: "SMART_MONEY",
        emoji: "💎",
        headline: "Smart Money",
        body: `${club} saw heavy buying before its match — and the market called it, beating its projection by ${round1(Math.abs(f.performanceSurprise as number))} points.`,
        ctaClubId,
      };
    case "MARKET_CALLED_IT":
      return {
        category: "SMART_MONEY",
        emoji: "💎",
        headline: "Smart Money",
        body: `Ticker's market had ${club} projected at ${round1(f.projectedPoints as number)} points before kickoff — it delivered ${round1(f.actualPoints as number)}.`,
        ctaClubId,
      };
    case "MARKET_GOT_IT_WRONG":
      return {
        category: "PRICED_IN_WRONG",
        emoji: "🫠",
        headline: "Priced In Wrong",
        body: `The market projected ${club} for ${round1(f.projectedPoints as number)} points — it managed only ${round1(f.actualPoints as number)}.`,
        ctaClubId,
      };
    case "BUYING_THE_DIP":
      return {
        category: "BUYING_THE_DIP",
        emoji: "🤔",
        headline: "Buying the Dip?",
        body: `Managers kept buying ${club} even after its result — ${f.netBuyersPreMatch} net buyers since the final whistle.`,
        ctaClubId,
      };
    case "SELLING_THE_RALLY":
      return {
        category: "SELLING_THE_RALLY",
        emoji: "📤",
        headline: "Selling the Rally",
        body: `${club} won, but managers are heading for the exit — ${f.netSellersPreMatch} net sellers since the result.`,
        ctaClubId,
      };
    case "CROWDED_TRADE":
      return {
        category: "CROWDED_TRADE",
        emoji: "👜",
        headline: "Crowded Trade",
        body: `${pct(f.ownershipPctPreMatch as number)} of managers already hold ${club} — one of the market's most crowded positions.`,
        ctaClubId,
      };
    case "UNPOPULAR_WINNER":
      return {
        category: "UNDER_THE_RADAR",
        emoji: "🏆",
        headline: "Under the Radar",
        body: `${club} delivered, but barely anyone was holding it — just ${pct(f.ownershipPctPreMatch as number)} ownership going in.`,
        ctaClubId,
      };
    default:
      return {
        category: "MARKET_MOVER",
        emoji: "📈",
        headline: "Market Mover",
        body: `${club} is showing notable activity in Ticker's market right now.`,
        ctaClubId,
      };
  }
}
