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
 * category makes that meaningful), stopping once that league's synthetic
 * share would exceed max_synthetic_percentage_per_public_league. Never
 * removes an existing member just because humans joined later.
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

    const syntheticMemberCount = members.filter((m) => usersRepo.isSynthetic(m.member_id)).length;
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
    let currentTotal = members.length;
    let currentSynthetic = syntheticMemberCount;
    for (const userId of candidates) {
      if (added >= needed) break;
      const projectedShare = (currentSynthetic + 1) / (currentTotal + 1);
      if (projectedShare > config.maxSyntheticPercentagePerPublicLeague) break;
      const user = usersRepo.getById(userId);
      if (!user) continue;
      leagueService.join(lg.id, userId, user.name);
      currentTotal++;
      currentSynthetic++;
      added++;
      membersAdded++;
    }
    if (added > 0) leaguesTopped++;
  }

  return { leaguesTopped, membersAdded };
}
