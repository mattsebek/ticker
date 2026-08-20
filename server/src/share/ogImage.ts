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

// satori takes a plain object tree shaped like a React element (no JSX
// runtime configured for this server) — every container needs an explicit
// display:"flex" (satori has no block layout), so `row`/`col` bake that in.
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
  memberCount: number;
  code: string;
}

/** Renders a 1200x630 OG/Twitter-card PNG for a league invite link — league name, member count, and join code on Ticker's green brand background. Rendered fresh per request (leagues change), never cached to disk. */
export async function renderLeagueShareImage(opts: LeagueShareCardOptions): Promise<Buffer> {
  const nameFontSize = opts.leagueName.length > 26 ? 46 : opts.leagueName.length > 16 ? 58 : 72;

  const markup = col(
    { width: WIDTH, height: HEIGHT, padding: "64px 72px", justifyContent: "space-between", backgroundColor: GREEN, fontFamily: "Newsreader" },
    [
      row({ alignItems: "center", gap: 14 }, [
        node("div", { style: { display: "flex", width: 48, height: 48, borderRadius: 12, backgroundColor: INK, alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: GREEN } }, "T"),
        text("Ticker", { fontSize: 28, fontWeight: 700, color: INK }),
      ]),
      col({ gap: 16 }, [
        text("You're invited to join", { fontSize: 22, fontWeight: 400, color: INK, opacity: 0.72 }),
        text(opts.leagueName, { fontSize: nameFontSize, fontWeight: 700, color: INK, lineHeight: 1.08, maxWidth: 1000 }),
        text(`${opts.memberCount} manager${opts.memberCount === 1 ? "" : "s"} competing`, { fontSize: 24, fontWeight: 400, color: INK, opacity: 0.78 }),
      ]),
      row({ alignItems: "center", gap: 14, backgroundColor: INK, borderRadius: 100, padding: "16px 30px", alignSelf: "flex-start" }, [
        text("JOIN CODE", { fontSize: 18, fontWeight: 400, color: "rgba(255,255,255,0.55)", letterSpacing: 2 }),
        text(opts.code.toUpperCase(), { fontSize: 26, fontWeight: 700, color: GREEN, letterSpacing: 3 }),
      ]),
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
