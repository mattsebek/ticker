import { randomUUID } from "crypto";
import { fantasyRepo, LeagueRow } from "./repo";
import { portfolioService } from "../market/portfolioService";

export const DEFAULT_AUTO_JOIN_LEAGUE_IDS = ["sunday-league-legends", "office-rivals", "the-boardroom", "college-friends"];

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

  create(name: string, userId: string, userName: string, isPrivate: boolean): LeagueRow {
    const id = "user-" + randomUUID();
    const row: LeagueRow = { id, name, is_private: isPrivate ? 1 : 0, code: randomUUID().slice(0, 6), commissioner: userName, base_member_count: 1 };
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

function seasonPointsForMember(memberId: string, throughRound: number): number {
  const holdings = portfolioService.getHoldings(memberId);
  return holdings.reduce((a, h) => a + fantasyRepo.seasonPointsThroughRound(h.clubId, throughRound), 0);
}
