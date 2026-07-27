import { randomUUID } from "crypto";
import { footballRepo } from "./repo";
import { Club, Competition, Season, Fixture, FixtureStatus } from "./types";
import { RawTeamRef, RawCompetitionRef, RawSeasonRef, RawFixtureDTO, RawFixtureStatus, RawOddsDTO } from "./providers/types";

/**
 * Layer 2 — Data Normalization.
 *
 * Every raw provider object passes through here exactly once before it
 * becomes part of Ticker's domain. This is the only code in the app allowed
 * to read a `providerId` off a raw DTO; everything downstream only ever sees
 * the ticker-owned id returned here.
 */

function findOrCreateTickerId(provider: string, entityType: string, providerId: string, makeId: () => string): { id: string; isNew: boolean } {
  const existing = footballRepo.getMapping(provider, entityType, providerId);
  if (existing) return { id: existing, isNew: false };
  const id = makeId();
  footballRepo.createMapping(provider, entityType, providerId, id);
  return { id, isNew: true };
}

export function normalizeCompetition(provider: string, raw: RawCompetitionRef): Competition {
  const { id } = findOrCreateTickerId(provider, "competition", raw.providerId, () => `comp_${slug(raw.name)}`);
  const competition: Competition = { id, name: raw.name };
  footballRepo.upsertCompetition(competition);
  return competition;
}

export function normalizeSeason(provider: string, raw: RawSeasonRef, competitionId: string): Season {
  const { id } = findOrCreateTickerId(provider, "season", raw.providerId, () => `season_${competitionId}_${raw.year}`);
  const season: Season = { id, competitionId, year: raw.year };
  footballRepo.upsertSeason(season);
  return season;
}

export function normalizeClub(provider: string, raw: RawTeamRef): Club {
  const { id } = findOrCreateTickerId(provider, "club", raw.providerId, () => `club_${slug(raw.code || raw.name)}`);
  const club: Club = { id, name: raw.name, code: raw.code, color: raw.color || "#666666" };
  footballRepo.upsertClub(club);
  return club;
}

function toFixtureStatus(raw: RawFixtureStatus): FixtureStatus {
  switch (raw) {
    case "FT":
      return "finished";
    case "1H":
    case "HT":
    case "2H":
      return "live";
    case "PST":
    case "ABD":
    case "CANC":
      return "postponed";
    default:
      return "scheduled";
  }
}

export function normalizeFixture(provider: string, raw: RawFixtureDTO, seasonId: string, odds?: RawOddsDTO): Fixture {
  const { id } = findOrCreateTickerId(provider, "fixture", raw.providerId, () => `fixture_${randomUUID()}`);
  const homeClubId = footballRepo.getMapping(provider, "club", raw.home.providerId);
  const awayClubId = footballRepo.getMapping(provider, "club", raw.away.providerId);
  if (!homeClubId || !awayClubId) {
    throw new Error(`normalizeFixture: clubs must be normalized before fixtures (missing mapping for ${raw.home.providerId} or ${raw.away.providerId})`);
  }
  const fixture: Fixture = {
    id,
    seasonId,
    round: raw.round,
    kickoff: raw.kickoff,
    status: toFixtureStatus(raw.status),
    homeClubId,
    awayClubId,
    homeGoals: raw.homeGoals,
    awayGoals: raw.awayGoals,
    homeCleanSheet: raw.homeCleanSheet,
    awayCleanSheet: raw.awayCleanSheet,
    homeWinProb: odds?.homeWinProb ?? null,
    drawProb: odds?.drawProb ?? null,
    awayWinProb: odds?.awayWinProb ?? null,
  };
  footballRepo.upsertFixture(fixture);
  return fixture;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
