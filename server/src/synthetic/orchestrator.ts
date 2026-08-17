import { syntheticRepo, SyntheticProfile } from "./syntheticRepo";
import { buildClubSignalsMap } from "./marketSignals";
import { evaluateAndAct, TradeAction } from "./tradeDecisionEngine";
import { evaluateLineup } from "./lineupDecisionEngine";
import { scheduleNextActivity } from "./scheduling";
import { rngFor } from "./rng";
import { ClubSignals } from "./strategies";

const MAX_BATCH = 500; // caps one orchestrator tick so a large population can't balloon a single run indefinitely

export interface OrchestratorResult {
  evaluated: number;
  failures: number;
}

/** One user's full evaluation pass — trade decision, then a lineup review. Shared by the scheduled job and the admin "force evaluate" action, so both go through identical logic. */
export function evaluateOneUser(profile: SyntheticProfile, signalsBase: Map<string, ClubSignals>): { tradeAction: TradeAction; lineupChanged: boolean } {
  const tradeAction = evaluateAndAct(profile, signalsBase);
  const lineupChanged = evaluateLineup(profile);
  return { tradeAction, lineupChanged };
}

/**
 * Evaluates every synthetic user whose next_activity_at is due (spec §25,
 * §27 Job A/B combined — see jobs/syntheticActivityOrchestrator.ts). Claims
 * each user (advances their schedule) BEFORE evaluating them, so even a
 * hypothetical concurrent pass can never double-act on the same account —
 * combined with this codebase's synchronous, single-threaded job execution
 * model (see Market Pricing V2's marketDemandService.ts for the same
 * reasoning), this is the idempotency/concurrency guard spec §50 asks for.
 * Per-user failures are caught individually so one bad account never aborts
 * the batch.
 */
export function runOrchestratorBatch(): OrchestratorResult {
  const config = syntheticRepo.getConfig();
  if (!config.enabled) return { evaluated: 0, failures: 0 };

  const now = Date.now();
  const due = syntheticRepo.getDueForEvaluation(now, MAX_BATCH);
  if (due.length === 0) return { evaluated: 0, failures: 0 };

  const signalsBase = buildClubSignalsMap(null);
  let failures = 0;

  for (const profile of due) {
    const rng = rngFor(profile.randomSeed, `schedule-${now}`);
    syntheticRepo.setSchedule(profile.userId, scheduleNextActivity(profile.strategyType, now, rng), now);
    try {
      evaluateOneUser(profile, signalsBase);
    } catch (err) {
      failures++;
      console.error(`[syntheticOrchestrator] evaluation failed for ${profile.userId}:`, err);
    }
  }

  return { evaluated: due.length, failures };
}

/** Admin "force evaluate" action — runs one user right now regardless of their schedule, without disturbing next_activity_at (so it doesn't skip their next naturally-due evaluation). */
export function forceEvaluateUser(userId: string): { tradeAction: TradeAction; lineupChanged: boolean } | null {
  const profile = syntheticRepo.getProfile(userId);
  if (!profile) return null;
  const signalsBase = buildClubSignalsMap(null);
  return evaluateOneUser(profile, signalsBase);
}
