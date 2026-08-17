import { marketRepo } from "../market/repo";
import { footballService } from "../football/service";
import { fantasyRepo } from "../fantasy/repo";
import { fantasyConfig } from "../fantasy/fantasyConfig";
import { gameweekService } from "../fantasy/gameweekService";
import { expectedTickerPoints } from "../fantasy/projection";
import { setLineup } from "../fantasy/lineupService";
import { syntheticRepo, SyntheticProfile } from "./syntheticRepo";
import { rngFor } from "./rng";

/**
 * Reviews and, if it would actually change anything, resubmits this
 * synthetic user's Starting Four for their next unlocked round (spec
 * §21-22). Reuses the SAME expected-points formula the pricing engine
 * itself uses (fantasy/projection.ts's expectedTickerPoints) as the "how
 * good is this club's next match" signal, rather than inventing a second
 * projection model. No dedicated per-round "have I reviewed this round"
 * flag exists on starter_selections (it's a single rolling intent, not
 * round-scoped) — this simply re-evaluates every time the user's normal
 * trade-cadence evaluation runs and only writes when the computed set
 * actually differs, so it's cheap to call often and naturally gets spread
 * across the pre-lock window by each user's own randomized cadence rather
 * than a second dedicated schedule.
 */
export function evaluateLineup(profile: SyntheticProfile): boolean {
  const config = syntheticRepo.getConfig();
  if (!config.enabled || !config.lineupUpdatesEnabled) return false;

  const userId = profile.userId;
  const pendingRound = gameweekService.firstUnlockedRound(userId);
  if (!gameweekService.deadlineForRound(pendingRound)) return false; // fixtures not published yet

  const holdings = marketRepo.getHoldings(userId);
  if (holdings.length === 0) return false;

  const rng = rngFor(profile.randomSeed, `lineup-${pendingRound}-${profile.nextActivityAt}`);
  const scored = holdings
    .map((h) => {
      const fixture = footballService.getUpcomingFixtureForClub(h.club_id);
      const isHome = fixture?.homeClubId === h.club_id;
      const winProb = (isHome ? fixture?.homeWinProb : fixture?.awayWinProb) ?? 0.33;
      const drawProb = fixture?.drawProb ?? 0.24;
      const expected = fixture ? expectedTickerPoints(winProb, drawProb) : 0; // no upcoming fixture (bye) scores 0
      const favoriteBonus = h.club_id === profile.favoriteClubId ? 0.5 : 0;
      const jitter = (rng() - 0.5) * profile.decisionRandomness * 4; // decision_randomness widens/narrows how much noise perturbs the ranking
      return { clubId: h.club_id, score: expected + favoriteBonus + jitter };
    })
    .sort((a, b) => b.score - a.score);

  const starters = scored.slice(0, fantasyConfig.MAX_STARTERS).map((s) => s.clubId);
  const current = new Set(fantasyRepo.getStarterSelection(userId));
  const unchanged = starters.length === current.size && starters.every((id) => current.has(id));
  if (unchanged) return false;

  const result = setLineup(userId, starters);
  if (result.ok) {
    syntheticRepo.logActivity({ userId, strategyType: profile.strategyType, actionType: "SET_LINEUP", gameweekRound: pendingRound, executed: true, decisionInputs: { starters } });
  }
  return result.ok;
}
