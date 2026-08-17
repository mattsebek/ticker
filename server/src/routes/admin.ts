import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { usersRepo } from "../shared/usersRepo";
import { fantasyRepo } from "../fantasy/repo";
import { marketRepo } from "../market/repo";
import { footballRepo } from "../football/repo";
import { deleteUser } from "../bootstrap";
import { renderAdminLoginPage } from "../admin/adminLoginPage";
import { renderAdminUsersPage } from "../admin/adminUsersPage";
import { renderAdminClubsPage, AdminClubRow } from "../admin/adminClubsPage";
import { renderAdminLeaguesPage } from "../admin/adminLeaguesPage";
import { renderAdminLeagueDetailPage, AdminLeagueStandingRow } from "../admin/adminLeagueDetailPage";
import { JWT_SECRET } from "../shared/auth";

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
  const clubs: AdminClubRow[] = footballRepo.listClubs().map((c) => {
    const series = marketRepo.getPriceSeries(c.id);
    const startingPrice = series[0]?.price ?? 0;
    const currentPrice = marketRepo.getPrice(c.id) ?? startingPrice;
    const pctChange = startingPrice > 0 ? ((currentPrice - startingPrice) / startingPrice) * 100 : 0;
    return { name: c.name, code: c.code, startingPrice, currentPrice, pctChange, ownershipPct: marketRepo.getOwnershipPct(c.id) };
  });
  res.type("html").send(renderAdminClubsPage(clubs));
});
