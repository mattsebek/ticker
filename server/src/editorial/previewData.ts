import { footballService } from "../football/service";
import { footballRepo } from "../football/repo";
import { gameweekService } from "../fantasy/gameweekService";
import { leagueService } from "../fantasy/leagueService";
import { portfolioService, marketPricingService } from "../market/portfolioService";
import { computePricePressure } from "../market/pricePressure";
import { projectionRepo } from "../projection/repo";
import { editorialConfig } from "./editorialConfig";

export interface HottestClubFact {
  clubName: string;
  clubCode: string;
  price: number;
  seasonPct: number;
  pressureScore: number | null;
  pressureForm: number | null;
  pressureExpectation: number | null;
}

export interface SpotlightGameFact {
  homeClubName: string;
  awayClubName: string;
  kickoff: string;
  homeProjectedPoints: number;
  awayProjectedPoints: number;
  projectedMargin: number;
}

export interface TopManagerHoldingFact {
  clubName: string;
  purchasePrice: number;
  currentPrice: number;
  gainPct: number;
}

export interface TopManagerFact {
  name: string;
  seasonPoints: number;
  portfolioValue: number;
  holdings: TopManagerHoldingFact[];
}

export interface GameweekPreviewFacts {
  round: number;
  hottestClubs: HottestClubFact[];
  spotlightGames: SpotlightGameFact[];
  topManager: TopManagerFact | null;
}

/** The nearest round with any still-scheduled fixture — "next up", not the one that just played. Falls back to currentRound() if nothing is scheduled (e.g. season fully played out in a scratch DB). */
function upcomingRound(): number {
  const scheduled = footballRepo.listFixturesByStatus("scheduled");
  if (scheduled.length === 0) return gameweekService.currentRound();
  return scheduled.reduce((min, f) => Math.min(min, f.round), scheduled[0].round);
}

function hottestClubs(): HottestClubFact[] {
  const clubs = footballService.listClubs();
  const scored = clubs.map((c) => {
    const priceView = marketPricingService.getClubPriceView(c.id);
    const pressure = computePricePressure(c.id);
    return {
      clubName: c.name,
      clubCode: c.code,
      price: priceView.price,
      seasonPct: priceView.seasonPct,
      pressureScore: pressure.score,
      pressureForm: pressure.form,
      pressureExpectation: pressure.expectation,
    };
  });
  scored.sort((a, b) => (b.pressureScore ?? -Infinity) - (a.pressureScore ?? -Infinity));
  return scored.slice(0, editorialConfig.HOTTEST_CLUB_COUNT);
}

function spotlightGames(round: number): SpotlightGameFact[] {
  const fixtures = footballRepo.listFixturesByRound(round).filter((f) => f.status === "scheduled");
  const withProjections = fixtures
    .map((f) => {
      const proj = projectionRepo.getLatestFixtureProjection(f.id);
      if (!proj) return null;
      const home = footballService.getClub(f.homeClubId);
      const away = footballService.getClub(f.awayClubId);
      if (!home || !away) return null;
      return {
        homeClubName: home.name,
        awayClubName: away.name,
        kickoff: f.kickoff,
        homeProjectedPoints: proj.homeProjectedPoints,
        awayProjectedPoints: proj.awayProjectedPoints,
        projectedMargin: Math.abs(proj.homeProjectedPoints - proj.awayProjectedPoints),
      };
    })
    .filter((x): x is SpotlightGameFact => x !== null);
  withProjections.sort((a, b) => a.projectedMargin - b.projectedMargin);
  return withProjections.slice(0, editorialConfig.SPOTLIGHT_GAME_COUNT);
}

function topManager(): TopManagerFact | null {
  const currentRound = gameweekService.currentRound();
  const standings = leagueService.cachedStandings("overall-league", currentRound);
  if (standings.length === 0) return null;
  const top = standings[0];
  const holdings = portfolioService.getHoldings(top.memberId).map((h) => {
    const club = footballService.getClub(h.clubId);
    const gainPct = h.purchasePrice ? ((h.currentPrice - h.purchasePrice) / h.purchasePrice) * 100 : 0;
    return {
      clubName: club?.name ?? h.clubId,
      purchasePrice: h.purchasePrice,
      currentPrice: h.currentPrice,
      gainPct,
    };
  });
  return { name: top.name, seasonPoints: top.points, portfolioValue: top.portfolio, holdings };
}

/** Gathers every real fact the generator is allowed to narrate — nothing in copyTemplates-adjacent code invents a number the model doesn't already have here. */
export function gatherGameweekPreviewFacts(): GameweekPreviewFacts {
  const round = upcomingRound();
  return {
    round,
    hottestClubs: hottestClubs(),
    spotlightGames: spotlightGames(round),
    topManager: topManager(),
  };
}
