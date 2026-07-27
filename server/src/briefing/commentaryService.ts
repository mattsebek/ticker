import { Club } from "../football/types";

function fmtPct(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

/**
 * Ticker's own editorial voice — every line here is generated FROM real form
 * and price data (never fixed flavor text), which is the whole point of
 * "the provider tells us what happened, Ticker decides what it means."
 */
export const commentaryService = {
  clubHeadline(club: Club, form: ("W" | "D" | "L")[], seasonPct: number): string {
    const wins = form.filter((r) => r === "W").length;
    const losses = form.filter((r) => r === "L").length;
    const trend = seasonPct >= 0 ? "up" : "down";

    if (wins >= 3) return `${club.name} have won ${wins} of their last ${form.length}, and the market has followed — value is ${trend} ${fmtPct(seasonPct)} this season.`;
    if (losses >= 3) return `${club.name}'s recent form has cooled (${losses} losses in their last ${form.length}), weighing on a price that's ${trend} ${fmtPct(seasonPct)} this season.`;
    if (seasonPct >= 15) return `${club.name}'s price has climbed ${fmtPct(seasonPct)} this season, ahead of where their recent results alone would suggest.`;
    if (seasonPct <= -15) return `${club.name} are down ${fmtPct(Math.abs(seasonPct))} this season — the market may be pricing in more risk than recent form justifies.`;
    return `${club.name} have been steady lately, with the market keeping their value roughly in line ${fmtPct(seasonPct)} this season.`;
  },

  /** Deterministic from the headline itself, not random — reproducible like everything else Ticker shows. */
  readTimeLabel(headline: string): string {
    const mins = 2 + (headline.length % 3);
    return `${mins} min read`;
  },
};
