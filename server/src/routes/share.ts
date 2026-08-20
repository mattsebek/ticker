import { Router } from "express";
import { fantasyRepo } from "../fantasy/repo";
import { renderLeagueShareImage } from "../share/ogImage";
import { esc } from "../admin/adminShell";

// Where a human ends up after a scraper's had its look at the meta tags
// below — the actual SPA route JoinLeaguePage.tsx reads ?code= from.
const WEBSITE_URL = process.env.WEBSITE_URL || "https://playticker.app";

export const shareRouter = Router();

shareRouter.get("/join/:code/image.png", async (req, res) => {
  const league = fantasyRepo.getLeagueByCode(req.params.code.toLowerCase());
  const leagueName = league ? league.name : "Ticker";
  const memberCount = league ? fantasyRepo.getMemberCount(league.id) : 0;
  try {
    const png = await renderLeagueShareImage({ leagueName, memberCount, code: req.params.code });
    res.set("Content-Type", "image/png");
    // Short cache — a league's member count/name can change, but a share
    // preview a minute stale is fine, and this avoids re-rendering on every
    // scraper hit (most platforms fetch og:image more than once).
    res.set("Cache-Control", "public, max-age=300");
    res.send(png);
  } catch (err) {
    console.error("[share] OG image render failed:", err instanceof Error ? err.message : err);
    res.status(500).end();
  }
});

/**
 * The actual link a manager shares. Server-rendered (not the SPA) since
 * social scrapers (iMessage, Slack, Discord, ...) never execute JS — they
 * only read whatever HTML this route returns. Sets real per-league OG tags,
 * then immediately sends a human on to the real app via meta-refresh + JS
 * (scrapers ignore both and just read the tags above them).
 */
shareRouter.get("/join/:code", (req, res) => {
  const code = req.params.code;
  const destination = `${WEBSITE_URL}/compete/join?code=${encodeURIComponent(code)}`;
  const league = fantasyRepo.getLeagueByCode(code.toLowerCase());
  if (!league) {
    // Unknown/stale code — no card worth building, straight to the app (which already handles an invalid code itself).
    return res.redirect(302, destination);
  }
  const memberCount = fantasyRepo.getMemberCount(league.id);
  const imageUrl = `${req.protocol}://${req.get("host")}/share/join/${encodeURIComponent(code)}/image.png`;
  const title = `Join ${league.name} on Ticker`;
  const description = `${memberCount} manager${memberCount === 1 ? "" : "s"} competing. Use code ${code.toUpperCase()} to join.`;

  res.type("html").send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ticker">
<meta property="og:url" content="${esc(destination)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(imageUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<meta http-equiv="refresh" content="0;url=${esc(destination)}">
<script>window.location.replace(${JSON.stringify(destination)});</script>
</head>
<body>
<p>Redirecting to Ticker&hellip; <a href="${esc(destination)}">Tap here</a> if nothing happens.</p>
</body>
</html>`);
});
