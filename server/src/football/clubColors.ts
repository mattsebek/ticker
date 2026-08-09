// Known official brand colors for Premier League clubs — current plus
// recently promoted/relegated ones, so this stays useful across seasons.
// Keyed by lowercased club name rather than provider code: a provider's code
// isn't stable across seasons or providers (e.g. Aston Villa is "AVL" in the
// mock roster but "AST" from API-Football), while the name is. Real data
// providers like API-Football don't supply a brand color at all, so this is
// the fallback that keeps club badges from all rendering the same gray.
const CLUB_COLORS: Record<string, string> = {
  arsenal: "#EF0107",
  "aston villa": "#670E36",
  bournemouth: "#B50E12",
  "afc bournemouth": "#B50E12",
  brentford: "#E30613",
  brighton: "#0057B8",
  "brighton & hove albion": "#0057B8",
  "brighton and hove albion": "#0057B8",
  burnley: "#6C1D45",
  chelsea: "#034694",
  coventry: "#78D0F2",
  "coventry city": "#78D0F2",
  "crystal palace": "#1B458F",
  everton: "#003399",
  fulham: "#000000",
  hull: "#F18A00",
  "hull city": "#F18A00",
  ipswich: "#1D4C9B",
  "ipswich town": "#1D4C9B",
  leeds: "#FFCD00",
  "leeds united": "#FFCD00",
  leicester: "#003090",
  "leicester city": "#003090",
  liverpool: "#C8102E",
  luton: "#F78F1E",
  "luton town": "#F78F1E",
  "manchester city": "#6CABDD",
  "man city": "#6CABDD",
  "manchester united": "#DA291C",
  "man utd": "#DA291C",
  "man united": "#DA291C",
  newcastle: "#1B1B1B",
  "newcastle united": "#1B1B1B",
  norwich: "#00A650",
  "norwich city": "#00A650",
  "nottingham forest": "#DD0000",
  "sheffield united": "#EE2737",
  "sheffield utd": "#EE2737",
  southampton: "#D71920",
  sunderland: "#EB172B",
  "sunderland afc": "#EB172B",
  tottenham: "#132257",
  "tottenham hotspur": "#132257",
  watford: "#FBEE23",
  "west bromwich albion": "#122F67",
  "west brom": "#122F67",
  "west ham": "#7A263A",
  "west ham united": "#7A263A",
  wolves: "#FDB913",
  "wolverhampton wanderers": "#FDB913",
};

export function lookupClubColor(name: string): string | undefined {
  return CLUB_COLORS[name.trim().toLowerCase()];
}
