import { footballRepo } from "../football/repo";
import { footballService } from "../football/service";
import { projectionRepo } from "./repo";
import { projectionConfig } from "./projectionConfig";
import { isMaterialChange } from "./materialChange";

export interface ForwardProjectionSummary {
  forwardProjectedPoints: number;
  fixtureCount: number;
}

/**
 * Spec section 20 — a club's summed Projected Ticker Points across its next
 * `gameweeks` fixtures ("forward earnings expectations"). Reads whatever
 * fixture_projections currently exist for those fixtures (most are still
 * future, so this is intentionally "best available projection right now",
 * not necessarily a locked/official one) — footballService.getUpcomingFixturesForClub
 * already exists and is exactly the right building block. fixtureCount can
 * be less than `gameweeks` near a fixture whose odds haven't posted yet or
 * near the end of the season — reported, not treated as an error.
 */
export function computeForwardProjection(clubId: string, gameweeks: number): ForwardProjectionSummary {
  const fixtures = footballService.getUpcomingFixturesForClub(clubId, gameweeks);
  let sum = 0;
  let fixtureCount = 0;
  for (const fixture of fixtures) {
    const projection = projectionRepo.getLatestFixtureProjection(fixture.id);
    if (!projection) continue;
    const isHome = fixture.homeClubId === clubId;
    sum += isHome ? projection.homeProjectedPoints : projection.awayProjectedPoints;
    fixtureCount++;
  }
  return { forwardProjectedPoints: sum, fixtureCount };
}

export interface RecomputeForwardResult {
  clubsEvaluated: number;
  clubsUpdated: number;
}

/**
 * Recomputes every club's Forward Projection and persists a new row only on
 * material change (spec section 24, same threshold/guard as fixture
 * projections — see materialChange.ts) — `forward_projection_delta` (spec
 * section 21, "fundamental momentum") is simply the difference from this
 * club+window's own last stored row. Called at the end of the SAME
 * odds-refresh job cycle that just wrote this round's fixture_projections
 * (see jobs/refreshOddsAndReproject.ts), never on its own schedule — avoids
 * a race where forward projections could compute before that cycle's own
 * fixture projections exist.
 */
export function recomputeAllForwardProjections(gameweeks: number = projectionConfig.FORWARD_PROJECTION_GAMEWEEKS): RecomputeForwardResult {
  const clubs = footballRepo.listClubs();
  let clubsUpdated = 0;
  for (const club of clubs) {
    const { forwardProjectedPoints, fixtureCount } = computeForwardProjection(club.id, gameweeks);
    const previous = projectionRepo.getLatestForwardProjection(club.id, gameweeks);
    if (!isMaterialChange(previous?.forwardProjectedPoints ?? null, forwardProjectedPoints, projectionConfig.MATERIAL_CHANGE_THRESHOLD_POINTS)) continue;
    projectionRepo.insertForwardProjection({
      clubId: club.id,
      gameweeks,
      forwardProjectedPoints,
      fixtureCount,
      forwardProjectionDelta: previous ? forwardProjectedPoints - previous.forwardProjectedPoints : null,
    });
    clubsUpdated++;
  }
  return { clubsEvaluated: clubs.length, clubsUpdated };
}
