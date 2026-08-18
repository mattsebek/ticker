import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { projectionRepo, OfficialFixtureProjectionRow } from "../../projection/repo";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;

interface SideContext {
  clubId: string;
  projectedPoints: number;
  actualPoints: number;
  performanceSurprise: number;
  result: "win" | "loss" | "draw";
  isFavorite: boolean;
}

function netCounts(clubId: string, sinceMs: number, untilMs: number): { netBuyers: number; netSellers: number; participants: number } {
  const traders = marketRepo.getNetTraderCounts(clubId, sinceMs, untilMs).filter((t) => t.net !== 0);
  const netBuyers = traders.filter((t) => t.net > 0).length;
  const netSellers = traders.filter((t) => t.net < 0).length;
  return { netBuyers, netSellers, participants: netBuyers + netSellers };
}

/**
 * SMART_MONEY, MARKET_CALLED_IT, MARKET_GOT_IT_WRONG, BUYING_THE_DIP,
 * SELLING_THE_RALLY, CROWDED_TRADE, UNPOPULAR_WINNER — spec section 9.7.
 * Triggered off every settled fixture in official_fixture_projections;
 * cheap to re-scan in full every sweep (a season is ~380 fixtures) since
 * dedup (keyed by fixture id + side) makes re-processing an already-seen
 * fixture a no-op. Pre-match ownership is approximated with the club's
 * CURRENT ownership_pct (no historical per-club total-user-base snapshot
 * exists to reconstruct the true pre-match figure) — documented limitation,
 * not a precision claim.
 */
export function detectPerformanceDivergence(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const settled = projectionRepo.listSettledOfficialProjections();

  for (const official of settled) {
    const fixture = footballRepo.getFixture(official.fixtureId);
    if (!fixture || fixture.homeGoals == null || fixture.awayGoals == null) continue;

    const homeResult: "win" | "loss" | "draw" = fixture.homeGoals > fixture.awayGoals ? "win" : fixture.homeGoals < fixture.awayGoals ? "loss" : "draw";
    const awayResult: "win" | "loss" | "draw" = homeResult === "win" ? "loss" : homeResult === "loss" ? "win" : "draw";

    const projGap = official.homeProjectedPoints - official.awayProjectedPoints;
    const homeIsFavorite = Math.abs(projGap) >= intelligenceConfig.FAVORITE_PROJECTED_POINTS_MARGIN && projGap > 0;
    const awayIsFavorite = Math.abs(projGap) >= intelligenceConfig.FAVORITE_PROJECTED_POINTS_MARGIN && projGap < 0;

    const sides: SideContext[] = [
      {
        clubId: fixture.homeClubId,
        projectedPoints: official.homeProjectedPoints,
        actualPoints: official.homeActualPoints ?? 0,
        performanceSurprise: official.homePerformanceSurprise ?? 0,
        result: homeResult,
        isFavorite: homeIsFavorite,
      },
      {
        clubId: fixture.awayClubId,
        projectedPoints: official.awayProjectedPoints,
        actualPoints: official.awayActualPoints ?? 0,
        performanceSurprise: official.awayPerformanceSurprise ?? 0,
        result: awayResult,
        isFavorite: awayIsFavorite,
      },
    ];

    for (const side of sides) {
      const ownershipPct = marketRepo.getOwnershipPct(side.clubId) / 100;
      const preMatch = netCounts(side.clubId, official.lockedAt - intelligenceConfig.PRE_MATCH_WINDOW_DAYS * DAY_MS, official.lockedAt);
      const postMatch = official.settledAt ? netCounts(side.clubId, official.settledAt, official.settledAt + intelligenceConfig.PRE_MATCH_WINDOW_DAYS * DAY_MS) : null;

      // --- SMART_MONEY: bought in heavily pre-match, then overperformed ---
      if (preMatch.participants >= intelligenceConfig.MIN_TRADERS && preMatch.netBuyers > preMatch.netSellers && side.performanceSurprise > 0) {
        out.push({
          signalType: "SMART_MONEY",
          clubId: side.clubId,
          round: fixture.round,
          windowLabel: `${official.fixtureId}:${side.clubId}`,
          facts: { netBuyersPreMatch: preMatch.netBuyers, netSellersPreMatch: preMatch.netSellers, performanceSurprise: side.performanceSurprise },
          rarityRatio: 1 + Math.abs(side.performanceSurprise) / 5,
          magnitude: Math.min(1, Math.abs(side.performanceSurprise) / 5),
          ownershipPct,
          isDivergence: true,
        });
      }

      // --- MARKET_CALLED_IT / MARKET_GOT_IT_WRONG: was this side the market's favorite, and did it win? ---
      if (side.isFavorite) {
        if (side.result === "win") {
          out.push({
            signalType: "MARKET_CALLED_IT",
            clubId: side.clubId,
            round: fixture.round,
            windowLabel: `${official.fixtureId}:${side.clubId}`,
            facts: { projectedPoints: side.projectedPoints, actualPoints: side.actualPoints },
            rarityRatio: 1 + Math.abs(projGap) / 3,
            magnitude: Math.min(1, Math.abs(projGap) / 5),
            ownershipPct,
            isDivergence: true,
          });
        } else if (side.result === "loss") {
          out.push({
            signalType: "MARKET_GOT_IT_WRONG",
            clubId: side.clubId,
            round: fixture.round,
            windowLabel: `${official.fixtureId}:${side.clubId}`,
            facts: { projectedPoints: side.projectedPoints, actualPoints: side.actualPoints },
            rarityRatio: 1 + Math.abs(projGap) / 3,
            magnitude: Math.min(1, Math.abs(projGap) / 5),
            ownershipPct,
            isDivergence: true,
          });
        }
      }

      // --- BUYING_THE_DIP / SELLING_THE_RALLY: post-match trading direction vs the result ---
      if (postMatch && postMatch.participants >= intelligenceConfig.MIN_TRADERS) {
        if (side.result === "loss" && postMatch.netBuyers > postMatch.netSellers) {
          out.push({
            signalType: "BUYING_THE_DIP",
            clubId: side.clubId,
            round: fixture.round,
            windowLabel: `${official.fixtureId}:${side.clubId}`,
            facts: { netBuyersPreMatch: postMatch.netBuyers, netSellersPreMatch: postMatch.netSellers },
            rarityRatio: 1 + postMatch.netBuyers / Math.max(1, postMatch.netSellers),
            magnitude: Math.min(1, postMatch.netBuyers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
            ownershipPct,
            isDivergence: true,
          });
        } else if (side.result === "win" && postMatch.netSellers > postMatch.netBuyers) {
          out.push({
            signalType: "SELLING_THE_RALLY",
            clubId: side.clubId,
            round: fixture.round,
            windowLabel: `${official.fixtureId}:${side.clubId}`,
            facts: { netSellersPreMatch: postMatch.netSellers, netBuyersPreMatch: postMatch.netBuyers },
            rarityRatio: 1 + postMatch.netSellers / Math.max(1, postMatch.netBuyers),
            magnitude: Math.min(1, postMatch.netSellers / intelligenceConfig.MAGNITUDE_SCALE.volumeRatio / 5),
            ownershipPct,
            isDivergence: true,
          });
        }
      }

      // --- CROWDED_TRADE: high pre-match ownership, independent of result ---
      if (ownershipPct >= intelligenceConfig.CROWDED_OWNERSHIP_THRESHOLD) {
        out.push({
          signalType: "CROWDED_TRADE",
          clubId: side.clubId,
          round: fixture.round,
          windowLabel: `${official.fixtureId}:${side.clubId}`,
          facts: { ownershipPctPreMatch: ownershipPct },
          rarityRatio: ownershipPct / intelligenceConfig.CROWDED_OWNERSHIP_THRESHOLD,
          magnitude: Math.min(1, ownershipPct),
          ownershipPct,
          isDivergence: true,
        });
      }

      // --- UNPOPULAR_WINNER: won despite very low pre-match ownership ---
      if (side.result === "win" && ownershipPct <= intelligenceConfig.UNPOPULAR_OWNERSHIP_THRESHOLD) {
        out.push({
          signalType: "UNPOPULAR_WINNER",
          clubId: side.clubId,
          round: fixture.round,
          windowLabel: `${official.fixtureId}:${side.clubId}`,
          facts: { ownershipPctPreMatch: ownershipPct },
          rarityRatio: intelligenceConfig.UNPOPULAR_OWNERSHIP_THRESHOLD > 0 ? intelligenceConfig.UNPOPULAR_OWNERSHIP_THRESHOLD / Math.max(ownershipPct, 0.001) : 1,
          magnitude: Math.min(1, 1 - ownershipPct / intelligenceConfig.UNPOPULAR_OWNERSHIP_THRESHOLD),
          ownershipPct,
          isDivergence: true,
        });
      }
    }
  }

  return out;
}
