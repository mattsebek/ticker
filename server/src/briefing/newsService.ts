import { footballService } from "../football/service";

// BBC's Premier League RSS feed — free, no API key, no registration. RSS
// exists specifically for syndication (their own copyright notice links to
// "terms and conditions of reuse" for feeds), so surfacing headline + link
// back to the original article is exactly its intended use.
const FEED_URL = "https://feeds.bbci.co.uk/sport/football/premier-league/rss.xml";
const CACHE_TTL_MS = 15 * 60_000; // matches the feed's own advertised <ttl>

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
}

interface NewsItem extends RawNewsItem {
  id: string;
  clubId: string | null;
  code: string | null;
  color: string | null;
}

let cache: { items: RawNewsItem[]; fetchedAt: number } | null = null;

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

/** <media:thumbnail width="240" height="134" url="..."/> — a self-closing tag with attributes, not a <tag>text</tag> pair, so it needs its own extraction. */
function extractThumbnail(block: string): string | null {
  const m = block.match(/<media:thumbnail[^>]*\burl="([^"]+)"/);
  return m ? decodeEntities(m[1]) : null;
}

function parseRss(xml: string): RawNewsItem[] {
  return xml
    .split("<item>")
    .slice(1)
    .map((block) => ({
      title: tagText(block, "title") ?? "",
      description: tagText(block, "description") ?? "",
      link: tagText(block, "link") ?? "",
      pubDate: tagText(block, "pubDate") ?? "",
      thumbnail: extractThumbnail(block),
    }))
    .filter((item) => item.title && item.link);
}

async function fetchFeed(): Promise<RawNewsItem[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.items;
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`BBC RSS fetch failed: ${res.status}`);
  const items = parseRss(await res.text());
  cache = { items, fetchedAt: Date.now() };
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
  /** Best-effort: real headlines from the top of the feed, most recent first (the feed is already in that order). Returns [] rather than throwing on a fetch failure — news is decoration, not core functionality. */
  async getPremierLeagueNews(limit = 4): Promise<NewsItem[]> {
    let items: RawNewsItem[];
    try {
      items = await fetchFeed();
    } catch {
      return [];
    }

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
