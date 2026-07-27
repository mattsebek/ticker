// Layer 5 (Public API) read-model composition. This is the one place allowed
// to reach into Football + Market + Fantasy together to shape a single
// response for the frontend — each domain service/repo it calls is still
// only ever touched through its own public interface.

import { Club, Fixture } from "./football/types";
import { footballService } from "./football/service";
import { footballRepo } from "./football/repo";
import { marketRepo } from "./market/repo";
import { fantasyRepo } from "./fantasy/repo";
import { projectPoints, difficultyFromWinProb } from "./fantasy/projection";
import { commentaryService } from "./briefing/commentaryService";
import { round2 } from "./shared/rng";

function opponentClub(fixture: Fixture, clubId: string): Club | undefined {
  const opponentId = fixture.homeClubId === clubId ? fixture.awayClubId : fixture.homeClubId;
  return footballService.getClub(opponentId);
}

function winProbFor(fixture: Fixture, clubId: string): number {
  const isHome = fixture.homeClubId === clubId;
  return (isHome ? fixture.homeWinProb : fixture.awayWinProb) ?? 0.33;
}

function fixtureMatchText(fixture: Fixture, clubId: string, opponent?: Club): string {
  const isHome = fixture.homeClubId === clubId;
  return `${isHome ? "vs" : "@"} ${opponent?.name ?? "TBD"} · ${fixture.kickoff.replace(/^Round \d+ · /, "")}`;
}

function formLettersForClub(clubId: string, n = 5): ("W" | "D" | "L")[] {
  return footballService.getRecentResultsForClub(clubId, n).map((f) => {
    const isHome = f.homeClubId === clubId;
    const gf = (isHome ? f.homeGoals : f.awayGoals) ?? 0;
    const ga = (isHome ? f.awayGoals : f.homeGoals) ?? 0;
    return gf > ga ? "W" : gf < ga ? "L" : "D";
  });
}

export function clubSummary(club: Club, currentRound: number) {
  const price = marketRepo.getPrice(club.id) ?? 0;
  const series = marketRepo.getPriceSeries(club.id).map((s) => s.price);
  const lastPrice = series.length >= 2 ? series[series.length - 2] : price;
  const openPrice = series.length >= 1 ? series[0] : price;
  const nextFixture = footballService.getUpcomingFixtureForClub(club.id);
  const opponent = nextFixture ? opponentClub(nextFixture, club.id) : undefined;
  const winProb = nextFixture ? winProbFor(nextFixture, club.id) : 0.33;
  const drawProb = nextFixture?.drawProb ?? 0.24;

  return {
    id: club.id,
    name: club.name,
    code: club.code,
    color: club.color,
    price,
    dailyPct: lastPrice ? round2(((price - lastPrice) / lastPrice) * 100) : 0,
    weeklyPct: lastPrice ? round2(((price - lastPrice) / lastPrice) * 100) : 0,
    seasonPct: openPrice ? round2(((price - openPrice) / openPrice) * 100) : 0,
    ownershipPct: marketRepo.getOwnershipPct(club.id),
    gwPts: fantasyRepo.pointsAtRound(club.id, currentRound),
    seasonPts: fantasyRepo.seasonPointsThroughRound(club.id, currentRound),
    sparkline: series.slice(-20),
    form: formLettersForClub(club.id, 5),
    nextFixture: nextFixture
      ? {
          opp: opponent?.name ?? "TBD",
          home: nextFixture.homeClubId === club.id,
          diff: difficultyFromWinProb(winProb),
          matchText: fixtureMatchText(nextFixture, club.id, opponent),
          projPts: projectPoints(winProb, drawProb),
        }
      : null,
  };
}

export function clubDetail(club: Club, currentRound: number) {
  const summary = clubSummary(club, currentRound);
  const upcoming = footballService.getUpcomingFixturesForClub(club.id, 3);
  const fixtures = upcoming.map((f) => {
    const opponent = opponentClub(f, club.id);
    const winProb = winProbFor(f, club.id);
    return {
      opp: opponent?.name ?? "TBD",
      home: f.homeClubId === club.id,
      diff: difficultyFromWinProb(winProb),
      matchText: fixtureMatchText(f, club.id, opponent),
      projPts: projectPoints(winProb, f.drawProb ?? 0.24),
    };
  });
  const headline = commentaryService.clubHeadline(club, summary.form, summary.seasonPct);
  return {
    ...summary,
    series: marketRepo.getPriceSeries(club.id).map((s) => s.price),
    fixtures,
    news: { h: headline, m: commentaryService.readTimeLabel(headline) },
  };
}
