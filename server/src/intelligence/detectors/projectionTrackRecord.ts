import { footballRepo } from "../../football/repo";
import { marketRepo } from "../../market/repo";
import { projectionRepo } from "../../projection/repo";
import { intelligenceConfig } from "../intelligenceConfig";
import { CandidateSignal } from "../types";

/** One club's running record against its own Official Fixture Projections. */
interface ClubTrackRecord {
  clubId: string;
  fixtures: number;
  beats: number;
  misses: number;
  surpriseSum: number;
  /** Most recent round contributing to the record — what the nugget is pinned to. */
  lastRound: number;
}

function emptyRecord(clubId: string): ClubTrackRecord {
  return { clubId, fixtures: 0, beats: 0, misses: 0, surpriseSum: 0, lastRound: 0 };
}

/**
 * PROJECTION_OVERPERFORMER / PROJECTION_UNDERPERFORMER.
 *
 * Every other performance signal in this engine is per-fixture: it looks at
 * one match and asks whether the market got that one right (see
 * detectors/performanceDivergence.ts). This one is cumulative — it asks
 * which clubs KEEP beating the number and which keep falling short, which
 * is a different and longer-lived kind of story, and the one a manager
 * actually trades on.
 *
 * Source is official_fixture_projections' settled rows, i.e. the same
 * Performance Surprise (actual − Official Projection) that
 * benchmarkLockService writes. That matters: the benchmark was locked
 * immediately BEFORE kickoff, so a club's record here is measured against
 * what the market genuinely believed at the time, never against a number
 * revised after the fact.
 *
 * Two gates, both required — see TRACK_RECORD_* in intelligenceConfig.
 * Consistency without magnitude is a rounding error, and magnitude without
 * consistency is one loud afternoon.
 */
export function detectProjectionTrackRecord(): CandidateSignal[] {
  const out: CandidateSignal[] = [];
  const byClub = new Map<string, ClubTrackRecord>();

  for (const official of projectionRepo.listSettledOfficialProjections()) {
    const fixture = footballRepo.getFixture(official.fixtureId);
    if (!fixture) continue;

    const sides: { clubId: string; surprise: number | null }[] = [
      { clubId: fixture.homeClubId, surprise: official.homePerformanceSurprise },
      { clubId: fixture.awayClubId, surprise: official.awayPerformanceSurprise },
    ];

    for (const side of sides) {
      // A settled row with a null surprise never actually got scored —
      // counting it as "delivered exactly on projection" would quietly
      // dilute every rate below, so it is not part of the sample at all.
      if (side.surprise == null) continue;

      const record = byClub.get(side.clubId) ?? emptyRecord(side.clubId);
      record.fixtures++;
      record.surpriseSum += side.surprise;
      if (side.surprise > 0) record.beats++;
      else if (side.surprise < 0) record.misses++;
      record.lastRound = Math.max(record.lastRound, fixture.round);
      byClub.set(side.clubId, record);
    }
  }

  for (const record of byClub.values()) {
    if (record.fixtures < intelligenceConfig.TRACK_RECORD_MIN_FIXTURES) continue;

    const beatRate = record.beats / record.fixtures;
    const missRate = record.misses / record.fixtures;
    const avgSurprise = record.surpriseSum / record.fixtures;
    const ownershipPct = marketRepo.getOwnershipPct(record.clubId) / 100;

    const overperforming = beatRate >= intelligenceConfig.TRACK_RECORD_HIT_RATE && avgSurprise >= intelligenceConfig.TRACK_RECORD_MIN_AVG_SURPRISE;
    const underperforming = missRate >= intelligenceConfig.TRACK_RECORD_HIT_RATE && avgSurprise <= -intelligenceConfig.TRACK_RECORD_MIN_AVG_SURPRISE;
    if (!overperforming && !underperforming) continue;

    const hitRate = overperforming ? beatRate : missRate;
    out.push({
      signalType: overperforming ? "PROJECTION_OVERPERFORMER" : "PROJECTION_UNDERPERFORMER",
      clubId: record.clubId,
      round: record.lastRound,
      // Keyed on how many matches the record covers, so the story re-fires
      // when the club actually plays again and the record extends — not on
      // every sweep, and not once-per-season either.
      windowLabel: `season:${record.fixtures}`,
      facts: {
        fixturesCounted: record.fixtures,
        beats: record.beats,
        misses: record.misses,
        hitRate: Number(hitRate.toFixed(3)),
        avgSurprise: Number(avgSurprise.toFixed(2)),
        totalSurprise: Number(record.surpriseSum.toFixed(2)),
      },
      // Consistency AND depth. A pure hit-rate ratio cannot work here: a
      // rate is capped at 1.0, so hitRate/HIT_RATE can never exceed ~1.49,
      // and interestScore's rarity curve (which saturates at 3x threshold)
      // would then cap this signal's rarity component at ~25/100 no matter
      // how emphatic the record — even a perfect 6-of-6 scored 51 against
      // the 65 candidate threshold, i.e. the detector could never surface
      // anything at all. Scaling by how many matches the run covers is
      // also the truer statement of rarity: six straight beats is a much
      // less likely accident than three.
      rarityRatio: (hitRate / intelligenceConfig.TRACK_RECORD_HIT_RATE) * (record.fixtures / intelligenceConfig.TRACK_RECORD_MIN_FIXTURES),
      magnitude: Math.min(1, Math.abs(avgSurprise) / intelligenceConfig.MAGNITUDE_SCALE.avgSurprise),
      ownershipPct,
      isDivergence: true,
    });
  }

  return out;
}
