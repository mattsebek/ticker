import { footballService } from "../football/service";

// Free, no-API-key, no-registration RSS feeds — RSS exists specifically for
// syndication (each outlet's own terms link "reuse"/"syndication" policies
// to their feeds), so surfacing headline + link back to the original
// article is exactly its intended use. Sources are fetched independently
// and merged by publish date — one outlet being slow or down never blocks
// the others (see getPremierLeagueNews's Promise.allSettled).
const SOURCES: { name: string; url: string }[] = [
  { name: "BBC Sport", url: "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml" },
  { name: "Sky Sports", url: "https://www.skysports.com/rss/11095" },
  { name: "The Guardian", url: "https://www.theguardian.com/football/rss" },
];
const CACHE_TTL_MS = 15 * 60_000; // matches BBC's own advertised feed <ttl>

// Headlines commonly use a club's short/nickname rather than its full
// registered name (see football/clubColors.ts for the same lookup-by-
// lowercased-name pattern) — without these, "Man City", "Spurs", "Forest"
// etc. would never match our own club names for the badge.
const ALIASES: Record<string, string[]> = {
  "manchester city": ["man city"],
  "manchester united": ["man utd", "man united"],
  tottenham: ["spurs"],
  "nottingham forest": ["forest"],
  newcastle: ["newcastle united", "toon"],
  brighton: ["albion", "brighton & hove"],
  wolves: ["wolverhampton"],
  "west ham": ["hammers"],
};

interface RawNewsItem {
  title: string;
  description: string;
  link: string;
  pubDate: string;
  thumbnail: string | null;
  source: string;
}

interface NewsItem extends RawNewsItem {
  id: string;
  clubId: string | null;
  code: string | null;
  color: string | null;
}

const cache = new Map<string, { items: RawNewsItem[]; fetchedAt: number }>();

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'");
}

function tagText(block: string, tag: string): string | undefined {
  const cdata = block.match(new RegExp(`<${tag}><!\\[CDATA\\[(.*?)\\]\\]></${tag}>`, "s"));
  if (cdata) return decodeEntities(cdata[1]);
  const plain = block.match(new RegExp(`<${tag}>(.*?)</${tag}>`, "s"));
  return plain ? decodeEntities(plain[1]) : undefined;
}

/**
 * Self-closing tags with attributes, not <tag>text</tag> pairs, so they need
 * their own extraction — and different outlets favor different tags for the
 * same purpose (BBC: media:thumbnail, Guardian: media:content, Sky:
 * enclosure), so try each in turn. A source using a tag this doesn't
 * recognize just falls back to no thumbnail — the client already renders
 * the club badge in that case, so it's a graceful gap, not a broken item.
 */
function extractThumbnail(block: string): string | null {
  const thumb = block.match(/<media:thumbnail[^>]*\burl="([^"]+)"/);
  if (thumb) return decodeEntities(thumb[1]);
  const media = block.match(/<media:content[^>]*\burl="([^"]+)"/);
  if (media) return decodeEntities(media[1]);
  const enclosure = block.match(/<enclosure[^>]*\btype="image[^"]*"[^>]*\burl="([^"]+)"/);
  if (enclosure) return decodeEntities(enclosure[1]);
  return null;
}

function parseRss(xml: string, source: string): RawNewsItem[] {
  return xml
    .split("<item>")
    .slice(1)
    .map((block) => ({
      title: tagText(block, "title") ?? "",
      description: tagText(block, "description") ?? "",
      link: tagText(block, "link") ?? "",
      pubDate: tagText(block, "pubDate") ?? "",
      thumbnail: extractThumbnail(block),
      source,
    }))
    .filter((item) => item.title && item.link);
}

async function fetchSource(source: { name: string; url: string }): Promise<RawNewsItem[]> {
  const cached = cache.get(source.url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.items;
  const res = await fetch(source.url);
  if (!res.ok) throw new Error(`${source.name} RSS fetch failed: ${res.status}`);
  const items = parseRss(await res.text(), source.name);
  cache.set(source.url, { items, fetchedAt: Date.now() });
  return items;
}

function fmtTimeAgo(pubDate: string): string {
  const t = new Date(pubDate).getTime();
  if (Number.isNaN(t)) return "";
  const diffMin = Math.max(1, Math.round((Date.now() - t) / 60_000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

export const newsService = {
  /** Best-effort across all SOURCES, merged and sorted most-recent-first. A source that fails to fetch is silently dropped (Promise.allSettled) rather than failing the whole request — news is decoration, not core functionality. */
  async getPremierLeagueNews(limit = 4): Promise<NewsItem[]> {
    const results = await Promise.allSettled(SOURCES.map(fetchSource));
    const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    items.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

    const clubs = footballService.listClubs();
    return items.slice(0, limit).map((item, i) => {
      const text = `${item.title} ${item.description}`.toLowerCase();
      const club = clubs.find((c) => {
        const name = c.name.toLowerCase();
        if (text.includes(name)) return true;
        return (ALIASES[name] ?? []).some((alias) => text.includes(alias));
      });
      return {
        ...item,
        id: `news-${i}-${Buffer.from(item.link).toString("base64url").slice(0, 16)}`,
        clubId: club?.id ?? null,
        code: club?.code ?? null,
        color: club?.color ?? null,
      };
    });
  },

  fmtTimeAgo,
};
