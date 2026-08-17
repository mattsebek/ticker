import { footballRepo } from "../football/repo";
import { fantasyRepo } from "../fantasy/repo";
import { leagueService } from "../fantasy/leagueService";
import { IdentityRegion, StrategyType } from "./syntheticRepo";
import { rngFor, pick } from "./rng";

export interface SeededLeague {
  id: string;
  name: string;
  category: "club" | "geo" | "general" | "ticker";
  clubId?: string;
  regions?: IdentityRegion[];
}

const GEO_LEAGUES: { slug: string; name: string; regions: IdentityRegion[] }[] = [
  { slug: "usa-footy-fans", name: "USA Footy Fans 🇺🇸", regions: ["US"] },
  { slug: "premier-league-usa", name: "Premier League USA", regions: ["US"] },
  { slug: "east-coast-footy", name: "East Coast Footy", regions: ["US"] },
  { slug: "west-coast-footy", name: "West Coast Footy", regions: ["US"] },
  { slug: "uk-footy-fans", name: "UK Footy Fans 🇬🇧", regions: ["UK"] },
  { slug: "london-football-fans", name: "London Football Fans", regions: ["UK"] },
  { slug: "ireland-pl-fans", name: "Ireland PL Fans 🇮🇪", regions: ["IRELAND"] },
  { slug: "canadian-footy-fans", name: "Canadian Footy Fans 🇨🇦", regions: ["CANADA"] },
];

const GENERAL_LEAGUE_NAMES = [
  "Premier League Fans", "Saturday Footy", "Sunday Football Club", "Matchweek Madness", "The Weekend League", "Football Sickos", "The Away End",
];

const TICKER_LEAGUE_NAMES = ["Diamond Hands FC", "Buy the Dip", "Value Investors", "Market Makers", "Momentum Traders"];

const FAN_SUFFIXES = ["Fans", "Supporters", "Faithful"];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/**
 * Creates the ~30 seeded public leagues (spec §33-39) if they don't already
 * exist — system-owned (commissioner "Ticker"), same pattern bootstrap.ts
 * already uses for "overall-league": inserted directly via fantasyRepo
 * rather than leagueService.create(), since a league's initial EXISTENCE
 * isn't a user action (nobody "created" it) — only membership is, which is
 * why joining still goes through the real leagueService below. Reads the
 * *current* club list (footballRepo.listClubs()) rather than a hardcoded
 * roster, so a season's promotion/relegation changes are reflected
 * automatically. Idempotent: deterministic ids, skips any that exist.
 */
export function ensureSeededLeagues(maxClubLeagues = 12): SeededLeague[] {
  const seeded: SeededLeague[] = [];
  const rng = rngFor("league-seed", "v1");

  const clubs = footballRepo.listClubs().slice(0, maxClubLeagues);
  for (const club of clubs) {
    const id = `synth-league-club-${club.id}`;
    const suffix = pick(rng, FAN_SUFFIXES);
    const name = `${club.name} ${suffix}`;
    ensureLeague(id, name);
    seeded.push({ id, name, category: "club", clubId: club.id });
  }

  for (const geo of GEO_LEAGUES) {
    const id = `synth-league-geo-${geo.slug}`;
    ensureLeague(id, geo.name);
    seeded.push({ id, name: geo.name, category: "geo", regions: geo.regions });
  }

  for (const name of GENERAL_LEAGUE_NAMES) {
    const id = `synth-league-general-${slugify(name)}`;
    ensureLeague(id, name);
    seeded.push({ id, name, category: "general" });
  }

  for (const name of TICKER_LEAGUE_NAMES) {
    const id = `synth-league-ticker-${slugify(name)}`;
    ensureLeague(id, name);
    seeded.push({ id, name, category: "ticker" });
  }

  return seeded;
}

function ensureLeague(id: string, name: string) {
  if (fantasyRepo.getLeagueById(id)) return;
  fantasyRepo.insertLeague({ id, name, is_private: 0, code: id.slice(0, 12), commissioner: "Ticker", base_member_count: 0, created_at: Date.now() });
}

const STRATEGY_LEAGUE_AFFINITY: Partial<Record<StrategyType, string[]>> = {
  momentum: ["synth-league-ticker-momentum-traders"],
  value: ["synth-league-ticker-value-investors"],
  contrarian: ["synth-league-ticker-buy-the-dip"],
  diamond_hands: ["synth-league-ticker-diamond-hands-fc"],
};

/**
 * Weighted membership assignment (spec §40): favorite-club and matching-region
 * leagues are HIGH relevance, general leagues MEDIUM, strategy-affiliated
 * leagues MEDIUM, everything else LOW-but-possible. Picks 1-4 leagues (§39)
 * and joins through the real leagueService — every membership obeys the
 * same duplicate/existence rules a human's join would.
 */
export function assignLeagues(
  seedContext: string,
  userId: string,
  userName: string,
  favoriteClubId: string | null,
  region: IdentityRegion,
  strategyType: StrategyType,
  leagues: SeededLeague[]
): string[] {
  const rng = rngFor(seedContext, "leagues");
  const weighted = leagues.map((lg) => {
    let weight = 1; // LOW but possible baseline
    if (lg.category === "club" && lg.clubId === favoriteClubId) weight = 12;
    else if (lg.category === "geo" && lg.regions?.includes(region)) weight = 10;
    else if (lg.category === "general") weight = 4;
    else if (lg.category === "ticker" && STRATEGY_LEAGUE_AFFINITY[strategyType]?.includes(lg.id)) weight = 6;
    return { lg, weight };
  });

  const count = 1 + Math.floor(rng() * 4); // 1-4 leagues
  const chosen = new Set<string>();
  const pool = weighted.slice();
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = weightedPickIndex(rng, pool.map((p) => p.weight));
    const [picked] = pool.splice(idx, 1);
    chosen.add(picked.lg.id);
  }

  const joined: string[] = [];
  for (const leagueId of chosen) {
    if (leagueService.isMember(leagueId, userId)) continue;
    leagueService.join(leagueId, userId, userName);
    joined.push(leagueId);
  }
  return joined;
}

function weightedPickIndex(rng: () => number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}
