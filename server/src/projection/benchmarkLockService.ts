import { footballRepo } from "../football/repo";
import { scoreClubInFixture } from "../fantasy/scoringService";
import { projectionRepo } from "./repo";

const NON_SCHEDULED_STATUSES = ["live", "finished", "postponed"] as const;

export interface LockAndSettleResult {
  locked: number;
  skippedNoProjection: number;
  settled: number;
}

/**
 * Spec section 16 — "the final valid Points Projection immediately before
 * the fixture begins becomes the Official Fixture Projection." Correct by
 * construction, no kickoff-timestamp parsing needed anywhere (Ticker's own
 * mock football data has non-parseable kickoff strings — see this file's
 * caller in jobs/lockAndSettleProjections.ts for why that rules out a
 * Date.now()-vs-kickoff design): projectionService.ts's odds-refresh cycle
 * only ever writes fixture_projections rows for fixtures currently
 * status='scheduled'. So whatever fixture_projections row was most recent
 * THE INSTANT a fixture's status first moves away from 'scheduled' is, by
 * definition, the last pre-kickoff value — this job's only job is to notice
 * that transition promptly (called on a tight interval) and copy it in
 * before anything else can happen. INSERT OR IGNORE on the PK
 * (projectionRepo.lockOfficialProjection) makes the lock itself idempotent
 * and immutable — a second call for an already-locked fixture is a no-op.
 */
export function lockNewlyStartedFixtures(): { locked: number; skippedNoProjection: number } {
  let locked = 0;
  let skippedNoProjection = 0;
  for (const status of NON_SCHEDULED_STATUSES) {
    for (const fixture of footballRepo.listFixturesByStatus(status)) {
      if (projectionRepo.getOfficialProjection(fixture.id)) continue; // already locked
      const latest = projectionRepo.getLatestFixtureProjection(fixture.id);
      if (!latest) {
        // Genuinely no benchmark available — e.g. kicked off before the odds
        // provider's budget/matching ever reached it. Distinct from a zero
        // projection; the admin UI renders this state explicitly.
        skippedNoProjection++;
        continue;
      }
      const wasLocked = projectionRepo.lockOfficialProjection({
        fixtureId: fixture.id,
        fixtureProjectionId: latest.id,
        homeProjectedPoints: latest.homeProjectedPoints,
        awayProjectedPoints: latest.awayProjectedPoints,
      });
      if (wasLocked) locked++;
    }
  }
  return { locked, skippedNoProjection };
}

/**
 * Spec section 17 — Performance Surprise = Actual − Official Projected,
 * filled in once a locked fixture actually finishes. Independent call to
 * scoreClubInFixture (the same authoritative function settlementService.ts
 * calls) — zero coupling to the real settlement pipeline, satisfying the
 * shadow-mode architectural-independence requirement.
 */
export function settleLockedFixtures(): number {
  let settled = 0;
  for (const fixtureId of projectionRepo.listUnsettledLockedFixtureIds()) {
    const fixture = footballRepo.getFixture(fixtureId);
    if (!fixture || fixture.status !== "finished") continue;
    const official = projectionRepo.getOfficialProjection(fixtureId)!;
    const homeActual = scoreClubInFixture(fixture, "home");
    const awayActual = scoreClubInFixture(fixture, "away");
    projectionRepo.settleOfficialProjection(fixtureId, homeActual, awayActual, homeActual - official.homeProjectedPoints, awayActual - official.awayProjectedPoints);
    settled++;
  }
  return settled;
}

export function lockAndSettle(): LockAndSettleResult {
  const { locked, skippedNoProjection } = lockNewlyStartedFixtures();
  const settled = settleLockedFixtures();
  return { locked, skippedNoProjection, settled };
}
