import { IdentityRegion, StrategyType } from "./syntheticRepo";
import { rngFor, weightedPick, pick, randInt } from "./rng";

export type IdentityType = "human" | "fantasy_team" | "football_fan" | "ticker_culture" | "chaos";

// --- Region mix (spec §10) ---
const REGIONS: { region: IdentityRegion; weight: number }[] = [
  { region: "US", weight: 32 },
  { region: "CANADA", weight: 8 },
  { region: "UK", weight: 25 },
  { region: "IRELAND", weight: 10 },
  { region: "EUROPE", weight: 20 },
  { region: "OTHER", weight: 5 },
];

// --- Identity type mix (spec §8) — configurable, these are the defaults ---
export const IDENTITY_TYPE_WEIGHTS: Record<IdentityType, number> = {
  human: 55,
  fantasy_team: 22,
  football_fan: 12,
  ticker_culture: 8,
  chaos: 3,
};

// --- Human name pools, first x last combined combinatorially per region family ---
const US_FIRST = [
  "Matt", "Ryan", "Chris", "Jake", "Adam", "Ben", "Daniel", "Tom", "James", "Luke", "Nathan", "Sam", "Alex", "Kevin", "Brian", "Justin",
  "Andrew", "Josh", "Mike", "Eric", "Tyler", "Brandon", "Kyle", "Zach", "Jordan", "Austin", "Cody", "Derek", "Sean", "Marcus",
  "Emily", "Sarah", "Jessica", "Amanda", "Ashley", "Megan", "Rachel", "Lauren", "Hannah", "Nicole", "Kayla", "Brittany", "Chloe", "Grace",
];
const US_LAST = [
  "Collins", "Anderson", "Walker", "Miller", "Wilson", "Thompson", "Hughes", "Fletcher", "Sullivan", "Carter", "Brooks", "Turner", "Morgan",
  "Reynolds", "Perry", "Foster", "Hayes", "Stewart", "Bennett", "Coleman", "Powell", "Barnes", "Ross", "Henderson", "Simmons", "Patterson",
  "Jenkins", "Sanders", "Price", "Bell", "Murphy", "Cook", "Rivera", "Cooper", "Richardson", "Cox",
];

const UK_FIRST = [
  "Oliver", "Harry", "George", "Jack", "Charlie", "Jamie", "Lewis", "Callum", "Thomas", "Elliot", "Freddie", "Archie", "Ollie", "Josh",
  "Will", "Alfie", "Toby", "Max", "Ryan", "Connor",
  "Olivia", "Amelia", "Isla", "Freya", "Poppy", "Ruby", "Millie", "Ella", "Lily", "Grace",
];
const UK_LAST = [
  "Davies", "Williams", "Harrison", "Evans", "Clarke", "Taylor", "Foster", "Wright", "Ward", "Hughes", "Edwards", "Green", "Baker", "Hunt",
  "Palmer", "Shaw", "Reid", "Marsh", "Dixon", "Grant", "Fisher", "Bond", "Pearce", "Blake", "Whitfield", "Chapman",
];

const IE_FIRST = [
  "Conor", "Sean", "Cian", "Cathal", "Eoin", "Dara", "Ronan", "Fionn", "Padraig", "Declan", "Niall", "Aoife", "Siobhan", "Niamh", "Roisin", "Ciara",
];
const IE_LAST = [
  "Murphy", "Kelly", "Byrne", "Ryan", "OConnor", "Walsh", "OBrien", "Kennedy", "Doyle", "McCarthy", "Gallagher", "Fitzgerald", "Brennan",
];

const IT_FIRST = ["Luca", "Marco", "Matteo", "Andrea", "Giulia", "Francesca", "Alessandro", "Davide", "Federico", "Chiara"];
const IT_LAST = ["Romano", "Bianchi", "Rossi", "Conti", "Ferrari", "Esposito", "Ricci", "Marino", "Greco", "Bruno"];
const FR_FIRST = ["Julien", "Thomas", "Lucas", "Antoine", "Camille", "Manon", "Hugo", "Nathan", "Louis", "Emma"];
const FR_LAST = ["Martin", "Bernard", "Moreau", "Dubois", "Lefevre", "Girard", "Roux", "Fournier", "Morel", "Blanc"];
const DE_FIRST = ["Jonas", "Felix", "Lukas", "Maximilian", "Leon", "Lena", "Anna", "Paul", "Finn", "Mia"];
const DE_LAST = ["Becker", "Wagner", "Hoffmann", "Schulz", "Koch", "Richter", "Wolf", "Neumann", "Schwarz", "Zimmermann"];
const ES_FIRST = ["Carlos", "Javier", "Daniel", "Alejandro", "Sofia", "Lucia", "Pablo", "Diego", "Marta", "Elena"];
const ES_LAST = ["Moreno", "Ruiz", "Garcia", "Fernandez", "Lopez", "Martinez", "Sanchez", "Perez", "Gomez", "Diaz"];
const NORDIC_FIRST = ["Erik", "Oscar", "Emil", "Anders", "Lars", "Ida", "Freya", "Sofia", "Elin", "Nora"];
const NORDIC_LAST = ["Larsen", "Lindberg", "Andersson", "Johansson", "Nilsson", "Karlsson", "Berg", "Eriksen", "Solberg", "Haugen"];

const EU_FIRST = [...IT_FIRST, ...FR_FIRST, ...DE_FIRST, ...ES_FIRST, ...NORDIC_FIRST];
const EU_LAST = [...IT_LAST, ...FR_LAST, ...DE_LAST, ...ES_LAST, ...NORDIC_LAST];

const REGION_NAME_POOLS: Record<IdentityRegion, { first: string[]; last: string[] }> = {
  US: { first: US_FIRST, last: US_LAST },
  CANADA: { first: US_FIRST, last: US_LAST },
  UK: { first: UK_FIRST, last: UK_LAST },
  IRELAND: { first: IE_FIRST, last: IE_LAST },
  EUROPE: { first: EU_FIRST, last: EU_LAST },
  OTHER: { first: [...US_FIRST, ...UK_FIRST], last: [...US_LAST, ...UK_LAST] },
};

// --- Fantasy/team-style names (spec §11) ---
const FANTASY_TEAM_NAMES = [
  "North London XI", "Sunday FC", "The High Press", "Four Four Too", "Park the Bus", "False Nine FC", "Added Time", "Top Bins United",
  "Expected Goals FC", "No Clean Sheets", "Weekend XI", "Away Days", "The Gaffer", "Three Points Please", "Proper Football Club",
  "Route One FC", "The Boxing Day Special", "Injury Time XI", "Between the Lines", "Set Piece Specialists", "The Tactics Board",
  "Nutmeg Nation", "Long Ball United", "The Wall Pass", "Offside Trap FC",
];

// --- Football-fan identities (spec §12) — city + favorite-club-name templates ---
const US_CITIES = ["Chicago", "Boston", "NYC", "California", "Austin", "Philly", "Seattle", "Denver", "St. Louis", "Portland"];

// --- Ticker/market-personality names (spec §13) ---
const TICKER_NAMES = [
  "BuyTheDipFC", "ExpectedGains", "DiamondHandsUnited", "GoalDifferenceGuy", "MidTableCapital", "NetSpendKing", "xGInvestor",
  "HoldTheLineFC", "Transfer Market Mike", "Portfolio FC", "Bull Market Ballers", "The Long Hold", "Value Vultures", "Dividend Derby",
];

// --- Comedic/chaos names (spec: <5%) ---
const CHAOS_NAMES = [
  "Sacked in the Morning", "VAR Made Me Do It", "Big Cup Energy", "Relegation Vibes Only", "Own Goal Enjoyer", "Panic Sell Pete",
  "The Wildcard", "Chaos Theory FC", "No Tactics Just Vibes", "Sunday League Legend",
];

function generateHumanName(rng: () => number, region: IdentityRegion, usedNames: Set<string>): string {
  const pool = REGION_NAME_POOLS[region];
  for (let attempt = 0; attempt < 12; attempt++) {
    const name = `${pick(rng, pool.first)} ${pick(rng, pool.last)}`;
    if (!usedNames.has(name)) return name;
  }
  // Pool exhausted at this size (very unlikely below a few thousand users) — append a quiet disambiguator.
  return `${pick(rng, pool.first)} ${pick(rng, pool.last)} ${Math.floor(rng() * 90 + 10)}`;
}

function generateFootballFanName(rng: () => number, favoriteClubName: string | null): string {
  const city = pick(rng, US_CITIES);
  if (favoriteClubName) {
    const nick = favoriteClubName.split(" ")[0];
    return pick(rng, [`${favoriteClubName} Till I Die`, `${city} ${nick}`, `${nick} in ${city}`]);
  }
  return `${city} Footy Fan`;
}

export interface GeneratedIdentity {
  name: string;
  identityType: IdentityType;
  region: IdentityRegion;
}

/**
 * Picks the identity type with a loose coherence nudge (spec §15): a
 * football-fan name is more likely when a favorite club is already set, and
 * ticker-culture names lean toward the more market-minded strategies —
 * probabilistic nudges only, never deterministic overrides, so plenty of
 * counter-examples exist (a Value Investor with a plain human name, etc.).
 */
function pickIdentityType(rng: () => number, hasFavoriteClub: boolean, strategyType: StrategyType): IdentityType {
  const weights = { ...IDENTITY_TYPE_WEIGHTS };
  if (hasFavoriteClub) weights.football_fan *= 1.6;
  if (strategyType === "momentum" || strategyType === "contrarian" || strategyType === "value" || strategyType === "active_trader") {
    weights.ticker_culture *= 1.8;
  }
  const types = Object.keys(weights) as IdentityType[];
  return weightedPick(rng, types, types.map((t) => weights[t]));
}

export function pickRegion(rng: () => number): IdentityRegion {
  return weightedPick(rng, REGIONS.map((r) => r.region), REGIONS.map((r) => r.weight));
}

export function generateIdentity(
  seedContext: string,
  region: IdentityRegion,
  strategyType: StrategyType,
  favoriteClubName: string | null,
  usedNames: Set<string>
): GeneratedIdentity {
  const rng = rngFor(seedContext, "identity");
  const identityType = pickIdentityType(rng, !!favoriteClubName, strategyType);

  let name: string;
  switch (identityType) {
    case "fantasy_team":
      name = pick(rng, FANTASY_TEAM_NAMES);
      break;
    case "football_fan":
      name = generateFootballFanName(rng, favoriteClubName);
      break;
    case "ticker_culture":
      name = pick(rng, TICKER_NAMES);
      break;
    case "chaos":
      name = pick(rng, CHAOS_NAMES);
      break;
    default:
      name = generateHumanName(rng, region, usedNames);
  }

  if (usedNames.has(name)) name = `${name} ${Math.floor(rng() * 900 + 100)}`;
  usedNames.add(name);
  return { name, identityType, region };
}

/** A unique-enough, obviously-not-a-real-inbox synthetic email — never sent to, just satisfies the `users.email UNIQUE` constraint. */
export function generateSyntheticEmail(userIndex: number, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
  return `${slug}.${userIndex}@synthetic.ticker.internal`;
}

/** A plausible adult birthday (25-55 years old), varied enough to not all land on the same day. */
export function generateBirthday(rng: () => number): string {
  const age = randInt(rng, 25, 56);
  const year = new Date().getFullYear() - age;
  const month = randInt(rng, 1, 13);
  const day = randInt(rng, 1, 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
