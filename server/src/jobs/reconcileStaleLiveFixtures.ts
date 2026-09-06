import { footballService } from "../football/service";
import { JobResult } from "./scheduler";

/**
 * Clears fixtures stuck at status "live" — see
 * footballService.reconcileStaleLiveFixtures() for why that state is
 * one-way and what it blocks downstream (settlement, fantasy points, price
 * movement, projection settlement).
 *
 * Unmetered on a quiet cycle: it only spends a provider request when a
 * fixture has actually been "live" past the point a real match could still
 * be running, so the steady-state cost of running this often is zero.
 */
export async function run(): Promise<JobResult> {
  const result = await footballService.reconcileStaleLiveFixtures();
  if (result.checked === 0) return { ok: true, detail: "no stale live fixtures" };
  return { ok: true, detail: `re-fetched ${result.updated}/${result.checked} stale live fixture(s)` };
}
