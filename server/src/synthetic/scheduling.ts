import { StrategyType } from "./syntheticRepo";
import { STRATEGY_DEFS } from "./strategies";
import { randInt } from "./rng";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Next evaluation time for a synthetic user — a random point inside their
 * strategy's eval-interval range (spec §25: avoid a single common
 * timestamp for everyone, e.g. "every Monday at 8am"). activity_multiplier
 * is applied by the caller (orchestrator job) at read time, not baked in
 * here, so changing it via admin config takes effect on the very next
 * scheduling decision rather than only for newly-created users.
 */
export function scheduleNextActivity(strategyType: StrategyType, fromMs: number, rng: () => number): number {
  const [minH, maxH] = STRATEGY_DEFS[strategyType].evalIntervalHoursRange;
  const hours = randInt(rng, minH, maxH + 1);
  return fromMs + hours * HOUR_MS;
}
