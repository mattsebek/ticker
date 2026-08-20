import { randomUUID } from "crypto";
import { footballRepo } from "../football/repo";
import { marketRepo } from "../market/repo";
import { tradingService, TradingError } from "../market/tradingService";
import { usersRepo } from "../shared/usersRepo";
import { gameweekService } from "../fantasy/gameweekService";
import { leagueService } from "../fantasy/leagueService";
import { setLineup } from "../fantasy/lineupService";
import { fantasyConfig } from "../fantasy/fantasyConfig";
import { syntheticRepo, IdentityRegion, StrategyType } from "./syntheticRepo";
import { STRATEGY_DEFS, STRATEGY_TYPES, STRATEGY_SCORERS } from "./strategies";
import { buildClubSignalsMap } from "./marketSignals";
import { generateIdentity, generateSyntheticEmail, generateBirthday, pickRegion, IdentityType } from "./identityGenerator";
import { ensureSeededLeagues, assignLeagues, SeededLeague } from "./leagueSeeder";
import { rngFor, weightedPick, pick, randInt } from "./rng";
import { scheduleNextActivity } from "./scheduling";

export interface SeedReport {
  usersCreated: number;
  identityTypeCounts: Record<string, number>;
  regionCounts: Record<string, number>;
  strategyCounts: Record<string, number>;
  clubAffinityCounts: Record<string, number>;
  leaguesEnsured: number;
  leagueMembershipsCreated: number;
  validPortfolios: number;
  validLineups: number;
  warnings: string[];
  errors: string[];
}

function emptyReport(): SeedReport {
  return {
    usersCreated: 0,
    identityTypeCounts: {},
    regionCounts: {},
    strategyCounts: {},
    clubAffinityCounts: {},
    leaguesEnsured: 0,
    leagueMembershipsCreated: 0,
    validPortfolios: 0,
    validLineups: 0,
    warnings: [],
    errors: [],
  };
}

function bump(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

/**
 * Reconciles the active synthetic population against the configured target
 * — the ONLY user-creation path (spec §3, §51): the initial seed action and
 * the daily population-manager job both call this, so running it twice is
 * naturally a no-op once the target's met, no separate "have I seeded"
 * flag needed. Every account is created through the same services a human
 * registration uses (usersRepo.create → marketRepo.ensureAccount →
 * portfolio via tradingService.buy → lineup via lineupService.setLineup →
 * leagues via leagueService), per the spec's core architecture principle.
 */
export function ensureSyntheticPopulation(targetCount: number): SeedReport {
  const config = syntheticRepo.getConfig();
  const report = emptyReport();
  if (!config.enabled || !config.autoCreateUsersEnabled) {
    report.warnings.push("Synthetic system disabled or auto_create_users_enabled=false — no users created.");
    return report;
  }

  const existing = usersRepo.countByAccountType().synthetic;
  const shortfall = Math.max(0, targetCount - existing);
  if (shortfall === 0) {
    report.warnings.push(`Already at or above target (${existing}/${targetCount}) — nothing to create.`);
    return report;
  }

  const leagues = ensureSeededLeagues();
  report.leaguesEnsured = leagues.length;

  const clubs = footballRepo.listClubs();
  if (clubs.length === 0) {
    report.errors.push("No clubs available — cannot seed portfolios yet (season not imported?).");
    return report;
  }

  const signalsBase = buildClubSignalsMap(null);
  const usedNames = new Set<string>();
  const currentRound = gameweekService.currentRound();

  for (let i = 0; i < shortfall; i++) {
    try {
      const userIndex = existing + i;
      createOneSyntheticUser(userIndex, clubs, leagues, signalsBase, usedNames, currentRound, report);
      report.usersCreated++;
    } catch (err: any) {
      report.errors.push(`user ${i}: ${err?.message || String(err)}`);
    }
  }

  runDiversityChecks(report);
  return report;
}

function createOneSyntheticUser(
  userIndex: number,
  clubs: { id: string; name: string; code: string }[],
  leagues: SeededLeague[],
  signalsBase: Map<string, ReturnType<typeof buildClubSignalsMap> extends Map<string, infer V> ? V : never>,
  usedNames: Set<string>,
  currentRound: number,
  report: SeedReport
) {
  const seed = randomUUID();
  const rng = rngFor(seed, "profile");

  const region: IdentityRegion = pickRegion(rng);
  const strategyType: StrategyType = weightedPick(
    rng,
    STRATEGY_TYPES,
    STRATEGY_TYPES.map((t) => STRATEGY_DEFS[t].populationWeight)
  );
  const favoriteClub = pick(rng, clubs);

  const identity = generateIdentity(seed, region, strategyType, favoriteClub.name, usedNames);
  const email = generateSyntheticEmail(userIndex, identity.name);
  const birthday = generateBirthday(rng);

  const user = usersRepo.create(identity.name, email, birthday, "synthetic");
  marketRepo.ensureAccount(user.id, 100);
  const defaultLeaguesJoined = leagueService.autoJoinDefaultLeagues(user.id, user.name);
  report.leagueMembershipsCreated += defaultLeaguesJoined.length;

  bump(report.identityTypeCounts, identity.identityType);
  bump(report.regionCounts, region);
  bump(report.strategyCounts, strategyType);

  // --- initial portfolio (spec §19-20): score every club through this
  // strategy's lens, buy greedily down the ranked list with some randomness
  // in how many clubs to target and how much cash to hold back, so not
  // every bot ends up with an "optimal" portfolio.
  const scorer = STRATEGY_SCORERS[strategyType];
  const scored = clubs
    .map((c) => {
      const base = signalsBase.get(c.id)!;
      const signals = { ...base, isFavorite: c.id === favoriteClub.id };
      return { club: c, score: scorer(signals) + (rng() - 0.5) * 0.3 }; // decision_randomness-ish jitter
    })
    .sort((a, b) => b.score - a.score);

  const targetHoldings = randInt(rng, 3, 9); // 3-8 clubs
  const cashReserveFraction = 0.05 + rng() * 0.2; // keep 5-25% back
  const spendBudget = 100 * (1 - cashReserveFraction);

  const purchased: string[] = [];
  let spent = 0;
  for (const { club } of scored) {
    if (purchased.length >= targetHoldings) break;
    const price = marketRepo.getPrice(club.id) ?? 0;
    if (spent + price > spendBudget) continue;
    try {
      tradingService.buy(user.id, club.id, currentRound);
      purchased.push(club.id);
      spent += price;
      bump(report.clubAffinityCounts, club.id);
    } catch (err) {
      if (!(err instanceof TradingError)) throw err;
      // insufficient funds / already owned for this candidate — try the next one
    }
  }
  if (purchased.length > 0) report.validPortfolios++;

  // --- initial lineup ---
  const starters = purchased.slice(0, fantasyConfig.MAX_STARTERS);
  if (starters.length > 0) {
    const result = setLineup(user.id, starters);
    if (result.ok) report.validLineups++;
  }

  // --- league memberships ---
  const joined = assignLeagues(seed, user.id, user.name, favoriteClub.id, region, strategyType, leagues);
  report.leagueMembershipsCreated += joined.length;

  // --- synthetic profile + first scheduled evaluation ---
  const strategyDef = STRATEGY_DEFS[strategyType];
  const now = Date.now();
  syntheticRepo.upsertProfile({
    userId: user.id,
    strategyType,
    activityLevel: strategyDef.activityLevel,
    tradeFrequency: strategyDef.tradeFrequencyLabel,
    riskTolerance: rng(),
    decisionRandomness: 0.15 + rng() * 0.25,
    favoriteClubId: favoriteClub.id,
    identityRegion: region,
    preferredLeagues: joined,
    randomSeed: seed,
    lastActivityAt: now,
    nextActivityAt: scheduleNextActivity(strategyType, now, rng),
    status: "active",
  });

  syntheticRepo.logActivity({ userId: user.id, strategyType, actionType: "CREATE_USER", executed: true, decisionInputs: { region, identityType: identity.identityType, purchased: purchased.length } });
}

/** Diversity checks (spec §59) — flag, never block. */
function runDiversityChecks(report: SeedReport) {
  const totalNames = Object.values(report.identityTypeCounts).reduce((a, b) => a + b, 0);
  if (totalNames === 0) return;
  const fcCount = report.identityTypeCounts["ticker_culture"] ?? 0;
  if (fcCount / totalNames > 0.2) report.warnings.push(`Ticker/market-themed identities are ${Math.round((fcCount / totalNames) * 100)}% of this batch (target <10%).`);

  const maxClubAffinity = Math.max(0, ...Object.values(report.clubAffinityCounts));
  const totalAffinity = Object.values(report.clubAffinityCounts).reduce((a, b) => a + b, 0);
  if (totalAffinity > 0 && maxClubAffinity / totalAffinity > 0.3) {
    report.warnings.push("One club accounts for over 30% of all holdings in this batch — check for scoring bias.");
  }

  const maxRegion = Math.max(0, ...Object.values(report.regionCounts));
  if (maxRegion / totalNames > 0.6) report.warnings.push("One region accounts for over 60% of this batch — check region-mix weighting.");
}
