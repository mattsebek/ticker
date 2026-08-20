import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { NEWSREADER_REGULAR_BASE64 } from "./fonts/newsreaderRegular";
import { NEWSREADER_BOLD_BASE64 } from "./fonts/newsreaderBold";

const regularFont = Buffer.from(NEWSREADER_REGULAR_BASE64, "base64");
const boldFont = Buffer.from(NEWSREADER_BOLD_BASE64, "base64");

const WIDTH = 1200;
const HEIGHT = 630;
const INK = "#00170c";
const GREEN = "#12F06F";

// The real app logo (ported from ticker-website/src/components/Logo.tsx) —
// gradient rounded square + an up-trending-chart arrow glyph, not a plain
// letter. Rendered once to a raster PNG and embedded as a data: URI below,
// since satori's own SVG support is too limited to trust for this shape.
const ICON_PX = 160;
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_PX}" height="${ICON_PX}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="g" x1="15%" y1="0%" x2="85%" y2="100%">
      <stop offset="0%" stop-color="${GREEN}"/>
      <stop offset="100%" stop-color="#00B54F"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="28" fill="url(#g)"/>
  <g transform="translate(21,21) scale(2.6)" stroke="${INK}" stroke-width="2.1" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3,16 8,10 12,13 19,4"/>
    <polyline points="13,4 19,4 19,10"/>
  </g>
</svg>`;
const iconPngDataUri = "data:image/png;base64," + new Resvg(ICON_SVG).render().asPng().toString("base64");

function node(type: string, props: Record<string, unknown>, children?: unknown) {
  return { type, props: { ...props, children } };
}
function row(style: Record<string, unknown>, children: unknown[]) {
  return node("div", { style: { display: "flex", flexDirection: "row", ...style } }, children);
}
function col(style: Record<string, unknown>, children: unknown[]) {
  return node("div", { style: { display: "flex", flexDirection: "column", ...style } }, children);
}
function text(value: string, style: Record<string, unknown>) {
  return node("div", { style: { display: "flex", ...style } }, value);
}

export interface LeagueShareCardOptions {
  leagueName: string;
}

/** Renders a 1200x630 OG/Twitter-card PNG for a league invite link — just the real Ticker logo/wordmark and the league name, nothing that goes stale (no member count). Rendered fresh per request, never cached to disk. */
export async function renderLeagueShareImage(opts: LeagueShareCardOptions): Promise<Buffer> {
  const nameFontSize = opts.leagueName.length > 26 ? 64 : opts.leagueName.length > 16 ? 78 : 92;

  const markup = col(
    { width: WIDTH, height: HEIGHT, padding: "72px", justifyContent: "space-between", backgroundColor: GREEN, fontFamily: "Newsreader" },
    [
      row({ alignItems: "center", gap: 18 }, [
        node("img", { src: iconPngDataUri, width: 56, height: 56 }),
        text("Ticker", { fontSize: 32, fontWeight: 700, letterSpacing: 1, color: INK }),
      ]),
      text(opts.leagueName, { fontSize: nameFontSize, fontWeight: 700, color: INK, lineHeight: 1.08, maxWidth: 1040 }),
    ]
  );

  const svg = await satori(markup as never, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Newsreader", data: regularFont, weight: 400, style: "normal" },
      { name: "Newsreader", data: boldFont, weight: 700, style: "normal" },
    ],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } });
  return resvg.render().asPng();
}
