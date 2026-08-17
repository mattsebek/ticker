import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { usersRepo } from "../shared/usersRepo";
import { fantasyRepo } from "../fantasy/repo";
import { marketRepo } from "../market/repo";
import { footballRepo } from "../football/repo";
import { formLettersForClub } from "../presenters";
import { deleteUser } from "../bootstrap";
import { renderAdminLoginPage } from "../admin/adminLoginPage";
import { renderAdminUsersPage } from "../admin/adminUsersPage";
import { renderAdminClubsPage, AdminClubRow } from "../admin/adminClubsPage";
import { renderAdminClubDetailPage } from "../admin/adminClubDetailPage";
import { renderAdminLeaguesPage } from "../admin/adminLeaguesPage";
import { renderAdminLeagueDetailPage, AdminLeagueStandingRow } from "../admin/adminLeagueDetailPage";
import { JWT_SECRET } from "../shared/auth";
import { computePricePressure, priceDirection, ppsDirection } from "../market/pricePressure";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Shared by /clubs and /clubs/:id — PPS + the divergence check against real 24H price movement (BR-14). */
function clubPricingDiagnostics(clubId: string, currentPrice: number) {
  const now = Date.now();
  const price24hAgo = marketRepo.getPriceAtOrBefore(clubId, now - DAY_MS);
  const pctChange24h = price24hAgo && price24hAgo > 0 ? ((currentPrice - price24hAgo) / price24hAgo) * 100 : 0;
  const pressure = computePricePressure(clubId);
  const eligible = pressure.eligible && price24hAgo != null;
  const priceDir = priceDirection(pctChange24h / 100);
  const ppsDir = pressure.score != null ? ppsDirection(pressure.score) : "NEUTRAL";
  const divergence: "ALIGNED" | "DIVERGENCE" | null = eligible ? (priceDir === ppsDir ? "ALIGNED" : "DIVERGENCE") : null;
  return { pctChange24h, pressure, priceDir, ppsDir, divergence, eligible };
}

const ADMIN_COOKIE = "ticker_admin";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Railway terminates TLS at its edge and forwards over plain HTTP, so req.protocol alone would misreport "http" in production — check the forwarded-proto header too, so the cookie is Secure whenever the browser's connection actually was. */
function isHttps(req: Request): boolean {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/admin") ? value : "/admin";
}

/**
 * Session-cookie admin auth, styled like the public site's own login card
 * rather than the browser's native HTTP Basic Auth dialog (which prompts
 * for a username too, confusing given only the shared password matters).
 * Still a single shared password via ADMIN_PASSWORD — this only changes
 * how it's collected and remembered, not who's allowed in.
 */
function requireAdminSession(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).send("ADMIN_PASSWORD not configured.");

  const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { admin?: boolean };
      if (payload.admin) return next();
    } catch {
      // expired/invalid — fall through to the login redirect below
    }
  }
  res.redirect(`/admin/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`);
}

export const adminRouter = Router();
adminRouter.use(express.urlencoded({ extended: false }));

adminRouter.get("/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).send("ADMIN_PASSWORD not configured.");
  res.type("html").send(renderAdminLoginPage({ next: safeNext(req.query.next), error: req.query.error === "1" }));
});

adminRouter.post("/login", (req, res) => {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).send("ADMIN_PASSWORD not configured.");

  const next = safeNext(req.body?.next);
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password !== expected) {
    return res.redirect(`/admin/login?next=${encodeURIComponent(next)}&error=1`);
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "lax",
    path: "/admin",
    maxAge: SESSION_TTL_MS,
  });
  res.redirect(next);
});

adminRouter.get("/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/admin" });
  res.redirect("/admin/login");
});

adminRouter.use(requireAdminSession);

adminRouter.get("/", (req, res) => res.redirect("/admin/users"));

// --- Users ---

adminRouter.get("/users", (req, res) => {
  res.type("html").send(renderAdminUsersPage());
});

/** Backs the Users page's search + infinite scroll — never returns the whole table in one response. */
adminRouter.get("/api/users", (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query : "";
  const offset = Math.max(0, parseInt(String(req.query.offset ?? "0"), 10) || 0);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));

  // Fetch one extra row to know whether there's a next page, without a second COUNT query.
  const page = usersRepo.searchPaged(query, offset, limit + 1);
  const hasMore = page.length > limit;
  const users = page.slice(0, limit).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    birthday: u.birthday,
    createdAt: u.created_at,
    onboarded: !!u.onboarded,
    cash: marketRepo.getCash(u.id),
    holdingsCount: marketRepo.getHoldings(u.id).length,
  }));
  res.json({ users, hasMore });
});

adminRouter.post("/users/:id/delete", (req, res) => {
  const ok = deleteUser(req.params.id);
  if (!ok) return res.status(404).json({ ok: false, error: "User not found." });
  res.json({ ok: true });
});

// --- Leagues ---

adminRouter.get("/leagues", (req, res) => {
  const leagues = fantasyRepo.listAllLeagues().map((lg) => ({
    id: lg.id,
    name: lg.name,
    isPrivate: !!lg.is_private,
    code: lg.code,
    commissioner: lg.commissioner,
    memberCount: fantasyRepo.getMembers(lg.id).length,
  }));
  res.type("html").send(renderAdminLeaguesPage(leagues));
});

adminRouter.get("/leagues/:id", (req, res) => {
  const league = fantasyRepo.getLeagueById(req.params.id);
  if (!league) return res.status(404).send("League not found.");
  const members = fantasyRepo.getMembers(league.id);
  const botIds = new Set(members.filter((m) => m.is_bot).map((m) => m.member_id));
  const standings: AdminLeagueStandingRow[] = fantasyRepo
    .getStandingsCache(league.id)
    .map((s) => ({ rank: s.rank, name: s.name, points: s.points, portfolio: s.portfolio, isBot: botIds.has(s.memberId) }));
  res.type("html").send(
    renderAdminLeagueDetailPage({ name: league.name, isPrivate: !!league.is_private, code: league.code, commissioner: league.commissioner, standings })
  );
});

// --- Clubs ---

adminRouter.get("/clubs", (req, res) => {
  let aligned = 0;
  let eligible = 0;
  const clubs: AdminClubRow[] = footballRepo.listClubs().map((c) => {
    const series = marketRepo.getPriceSeries(c.id);
    const startingPrice = series[0]?.price ?? 0;
    const currentPrice = marketRepo.getPrice(c.id) ?? startingPrice;
    const pctChange = startingPrice > 0 ? ((currentPrice - startingPrice) / startingPrice) * 100 : 0;
    const demand = marketRepo.getDemandSince(c.id, marketRepo.getLastSettlementTime(c.id) ?? 0);
    const netDemand: "buying" | "selling" | "flat" = demand.uniqueBuyers > demand.uniqueSellers ? "buying" : demand.uniqueBuyers < demand.uniqueSellers ? "selling" : "flat";

    const diag = clubPricingDiagnostics(c.id, currentPrice);
    if (diag.eligible) {
      eligible++;
      if (diag.divergence === "ALIGNED") aligned++;
    }

    return {
      id: c.id,
      name: c.name,
      code: c.code,
      startingPrice,
      currentPrice,
      pctChange,
      ownershipPct: marketRepo.getOwnershipPct(c.id),
      netDemand,
      form: formLettersForClub(c.id, 3),
      pricePressure: diag.pressure.score,
      divergence: diag.divergence,
    };
  });
  res.type("html").send(renderAdminClubsPage(clubs, { aligned, eligible }));
});

adminRouter.get("/clubs/:id", (req, res) => {
  const club = footballRepo.listClubs().find((c) => c.id === req.params.id);
  if (!club) return res.status(404).send("Club not found.");

  const series = marketRepo.getPriceSeries(club.id);
  const startingPrice = series[0]?.price ?? 0;
  const currentPrice = marketRepo.getPrice(club.id) ?? startingPrice;
  const price7dAgo = marketRepo.getPriceAtOrBefore(club.id, Date.now() - 7 * DAY_MS);
  const pctChange7d = price7dAgo && price7dAgo > 0 ? ((currentPrice - price7dAgo) / price7dAgo) * 100 : 0;

  const diag = clubPricingDiagnostics(club.id, currentPrice);
  const timeline = marketRepo.getPriceHistoryTimeline(club.id, 100);

  res.type("html").send(
    renderAdminClubDetailPage({
      id: club.id,
      name: club.name,
      code: club.code,
      currentPrice,
      startingPrice,
      pctChange24h: diag.pctChange24h,
      pctChange7d,
      pressure: diag.pressure,
      priceDirection: diag.priceDir,
      ppsDirection: diag.ppsDir,
      divergence: diag.divergence,
      timeline,
    })
  );
});
