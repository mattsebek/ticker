import { syntheticRepo } from "./syntheticRepo";
import { ensureSyntheticPopulation, SeedReport } from "./syntheticSeedService";

export interface ReconcileResult {
  created: number;
  pausedSurplus: number;
  targetActiveUsers: number;
  activeBefore: number;
}

/**
 * Daily Population Manager (spec §27 Job C): tops up a shortfall against
 * the configured target (via the same ensureSyntheticPopulation path the
 * initial seed uses), or — if the target has been lowered — pauses the
 * surplus rather than deleting anyone (spec §31-32: reducing the target
 * must not destroy historical accounts). Retirement is a deliberate admin
 * action (see admin/adminSyntheticPage.ts), not automatic.
 */
export function reconcilePopulation(): ReconcileResult {
  const config = syntheticRepo.getConfig();
  const activeBefore = syntheticRepo.countByStatus().active;

  let created = 0;
  if (activeBefore < config.targetActiveUsers) {
    const report: SeedReport = ensureSyntheticPopulation(config.targetActiveUsers);
    created = report.usersCreated;
  }

  let pausedSurplus = 0;
  if (activeBefore > config.targetActiveUsers) {
    const surplus = activeBefore - config.targetActiveUsers;
    const activeIds = syntheticRepo.listActiveUserIds().slice(0, surplus);
    for (const userId of activeIds) {
      syntheticRepo.setStatus(userId, "paused");
      const profile = syntheticRepo.getProfile(userId);
      if (profile) syntheticRepo.logActivity({ userId, strategyType: profile.strategyType, actionType: "PAUSE", executed: true, failureReason: "population target reduced" });
      pausedSurplus++;
    }
  }

  return { created, pausedSurplus, targetActiveUsers: config.targetActiveUsers, activeBefore };
}
