import { fantasyRepo } from "../fantasy/repo";
import { leagueService } from "../fantasy/leagueService";
import { usersRepo } from "../shared/usersRepo";
import { syntheticRepo } from "./syntheticRepo";
import { ensureSeededLeagues } from "./leagueSeeder";

export interface LeagueManagerResult {
  leaguesTopped: number;
  membersAdded: number;
}

/**
 * Daily League Manager (spec §27 Job D, §41-42): tops up any seeded public
 * league below minimum_public_league_population with additional synthetic
 * members (favorite-club/region-relevant ones prioritized where the league
 * category makes that meaningful). Never removes an existing member just
 * because humans joined later. Deliberately has no max-synthetic-share cap
 * — see the loop below for why one doesn't make sense for a "bootstrap an
 * empty league up to a floor" mechanism specifically.
 */
export function reconcileLeagues(): LeagueManagerResult {
  const config = syntheticRepo.getConfig();
  if (!config.enabled || !config.autoJoinLeaguesEnabled) return { leaguesTopped: 0, membersAdded: 0 };

  const leagues = ensureSeededLeagues();
  const activeSyntheticIds = syntheticRepo.listActiveUserIds();

  let leaguesTopped = 0;
  let membersAdded = 0;

  for (const lg of leagues) {
    const members = fantasyRepo.getMembers(lg.id);
    if (members.length >= config.minimumPublicLeaguePopulation) continue;

    const existingIds = new Set(members.map((m) => m.member_id));

    let candidates = activeSyntheticIds.filter((id) => !existingIds.has(id));
    // Light relevance bias: for a club or geo league, put matching profiles first — everyone else still eligible after them.
    const relevant: string[] = [];
    const rest: string[] = [];
    for (const id of candidates) {
      const profile = syntheticRepo.getProfile(id);
      const isRelevant = !!profile && ((lg.clubId && profile.favoriteClubId === lg.clubId) || (lg.regions && lg.regions.includes(profile.identityRegion)));
      (isRelevant ? relevant : rest).push(id);
    }
    candidates = [...relevant, ...rest];

    const needed = config.minimumPublicLeaguePopulation - members.length;
    let added = 0;
    // No max-synthetic-share cap here — this loop only ever tops a league up
    // TO minimumPublicLeaguePopulation, never beyond, and a league starting
    // from few/no real members is *necessarily* mostly-or-entirely synthetic
    // while it climbs to that floor (that's the bootstrap this job exists
    // for). The old check compared (currentSynthetic+1)/(currentTotal+1)
    // against the cap on every single addition, including the very first —
    // for a 0-member league that's always 1/1 = 100%, which always exceeded
    // any reasonable cap and broke out before adding anyone, permanently.
    // The cap still has a real job to do elsewhere (never removing/blocking
    // once a league already has organic growth) — it just doesn't belong in
    // "get an empty league up to a minimum floor" specifically.
    for (const userId of candidates) {
      if (added >= needed) break;
      const user = usersRepo.getById(userId);
      if (!user) continue;
      leagueService.join(lg.id, userId, user.name);
      added++;
      membersAdded++;
    }
    if (added > 0) leaguesTopped++;
  }

  return { leaguesTopped, membersAdded };
}
