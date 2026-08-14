import { randomUUID } from "crypto";
import { fantasyRepo, LeagueRow } from "./repo";
import { portfolioService } from "../market/portfolioService";

export const DEFAULT_AUTO_JOIN_LEAGUE_IDS = ["overall-league"];

export interface StandingsRow {
  rank: number;
  name: string;
  memberId: string;
  points: number;
  portfolio: number;
}

export const leagueService = {
  getUserLeagues(userId: string): LeagueRow[] {
    return fantasyRepo.getUserLeagues(userId);
  },

  publicLeagues(userId: string): LeagueRow[] {
    return fantasyRepo.publicLeaguesNotJoined(userId);
  },

  getLeague(id: string): LeagueRow | undefined {
    return fantasyRepo.getLeagueById(id);
  },

  getLeagueByCode(code: string): LeagueRow | undefined {
    return fantasyRepo.getLeagueByCode(code);
  },

  isMember(leagueId: string, userId: string): boolean {
    return fantasyRepo.isMember(leagueId, userId);
  },

  join(leagueId: string, userId: string, name: string) {
    fantasyRepo.addMember(leagueId, userId, name, false);
  },

  autoJoinDefaultLeagues(userId: string, name: string) {
    for (const leagueId of DEFAULT_AUTO_JOIN_LEAGUE_IDS) {
      if (fantasyRepo.getLeagueById(leagueId)) fantasyRepo.addMember(leagueId, userId, name, false);
    }
  },

  /** customCode (private leagues) is caller-validated for format + uniqueness — see routes/leagues.ts. Normalized to lowercase to match getLeagueByCode's own lowercasing. */
  create(name: string, userId: string, userName: string, isPrivate: boolean, customCode?: string): LeagueRow {
    const id = "user-" + randomUUID();
    const code = customCode ? customCode.toLowerCase() : randomUUID().slice(0, 6);
    const row: LeagueRow = { id, name, is_private: isPrivate ? 1 : 0, code, commissioner: userName, base_member_count: 1, created_at: Date.now() };
    fantasyRepo.insertLeague(row);
    fantasyRepo.addMember(id, userId, userName, false);
    return row;
  },

  /** Live computation — season points through the given round for every league member, sorted (fantasy points is the primary league metric per ticker_rules.md). */
  standings(leagueId: string, throughRound: number, sortBy: "points" | "portfolio" = "points"): StandingsRow[] {
    const members = fantasyRepo.getMembers(leagueId);
    const rows = members.map((m) => ({
      memberId: m.member_id,
      name: m.member_name,
      points: seasonPointsForMember(m.member_id, throughRound),
      portfolio: portfolioService.getPortfolioValue(m.member_id),
    }));
    rows.sort((a, b) => (sortBy === "portfolio" ? b.portfolio - a.portfolio : b.points - a.points));
    return rows.map((r, i) => ({ rank: i + 1, name: r.name, memberId: r.memberId, points: r.points, portfolio: r.portfolio }));
  },

  /** Prefers the materialized cache (see recalculateLeagueStandings job); falls back to a live computation if a league hasn't been cached yet. */
  cachedStandings(leagueId: string, throughRound: number, sortBy: "points" | "portfolio" = "points"): StandingsRow[] {
    const cached = fantasyRepo.getStandingsCache(leagueId);
    if (cached.length === 0) return leagueService.standings(leagueId, throughRound, sortBy);
    const rows = cached
      .slice()
      .sort((a, b) => (sortBy === "portfolio" ? b.portfolio - a.portfolio : b.points - a.points))
      .map((r, i) => ({ rank: i + 1, name: r.name, memberId: r.memberId, points: r.points, portfolio: r.portfolio }));
    return rows;
  },

  /** recalculateLeagueStandings job entry point: materializes every league's standings (default sort: points). Idempotent — always recomputed fresh from source data. */
  recalculateAllStandingsCaches(currentRound: number): { leaguesUpdated: number } {
    const leagueIds = fantasyRepo.listAllLeagueIds();
    for (const leagueId of leagueIds) {
      const rows = leagueService.standings(leagueId, currentRound, "points");
      fantasyRepo.writeStandingsCache(leagueId, rows);
    }
    return { leaguesUpdated: leagueIds.length };
  },
};

/**
 * Season points must reflect whichever lineup was LOCKED for each round,
 * not a single current-holdings snapshot — a club traded away after
 * scoring still counts for the weeks it was actually locked in. Only
 * STARTER clubs count; Bench points are informational only (never league
 * standings).
 */
function seasonPointsForMember(memberId: string, throughRound: number): number {
  let total = 0;
  for (let round = 1; round <= throughRound; round++) {
    const locked = fantasyRepo.getLockedLineup(memberId, round) ?? [];
    for (const c of locked) {
      if (c.status !== "STARTER") continue;
      total += fantasyRepo.pointsAtRound(c.clubId, round);
    }
  }
  return total;
}
