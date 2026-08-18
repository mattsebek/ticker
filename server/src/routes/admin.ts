import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { usersRepo, AccountType } from "../shared/usersRepo";
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
import { renderAdminSyntheticPage, AdminSyntheticUserRow } from "../admin/adminSyntheticPage";
import { syntheticRepo } from "../synthetic/syntheticRepo";
import { forceEvaluateUser } from "../synthetic/orchestrator";
import { renderAdminProjectionsPage, AdminProjectionRow } from "../admin/adminProjectionsPage";
import { renderAdminProjectionDetailPage } from "../admin/adminProjectionDetailPage";
import { projectionRepo } from "../projection/repo";
import { projectionConfig } from "../projection/projectionConfig";
import { buildScoreMatrix } from "../projection/scoreDistribution";
import { renderAdminIntelligencePage, AdminNuggetRow, IntelligenceFilter } from "../admin/adminIntelligencePage";
import { intelligenceRepo } from "../intelligence/repo";
import { generateCopy } from "../intelligence/copyTemplates";

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
  const accountTypeRaw = typeof req.query.accountType === "string" ? req.query.accountType : "";
  const accountType = (["human", "synthetic", "admin", "system"] as const).includes(accountTypeRaw as any) ? (accountTypeRaw as AccountType) : undefined;

  // Fetch one extra row to know whether there's a next page, without a second COUNT query.
  const page = usersRepo.searchPaged(query, offset, limit + 1, accountType);
  const hasMore = page.length > limit;
  const users = page.slice(0, limit).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    birthday: u.birthday,
    createdAt: u.created_at,
    onboarded: !!u.onboarded,
    accountType: u.account_type,
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
    const netDemand = marketRepo.getLatestDemandDirection(c.id);

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

  const forwardGameweeks = projectionConfig.FORWARD_PROJECTION_GAMEWEEKS;
  const storedForward = projectionRepo.getLatestForwardProjection(club.id, forwardGameweeks);
  const forwardProjection = storedForward
    ? { points: storedForward.forwardProjectedPoints, delta: storedForward.forwardProjectionDelta, gameweeks: forwardGameweeks, fixtureCount: storedForward.fixtureCount }
    : null;

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
      forwardProjection,
    })
  );
});

// --- Synthetic ecosystem ---

adminRouter.get("/synthetic", (req, res) => {
  const config = syntheticRepo.getConfig();
  const statusCounts = syntheticRepo.countByStatus();
  const accountCounts = usersRepo.countByAccountType();
  const actionsLast24h = syntheticRepo.countActionsSince(Date.now() - DAY_MS);
  const clubNameById = new Map(footballRepo.listClubs().map((c) => [c.id, c.name]));

  const profiles = syntheticRepo.listProfiles(100, 0);
  const users: AdminSyntheticUserRow[] = profiles.map((p) => {
    const u = usersRepo.getById(p.userId);
    return {
      id: p.userId,
      name: u?.name ?? p.userId,
      strategyType: p.strategyType,
      activityLevel: p.activityLevel,
      status: p.status,
      favoriteClubName: p.favoriteClubId ? (clubNameById.get(p.favoriteClubId) ?? null) : null,
      nextActivityAt: p.nextActivityAt,
    };
  });

  res.type("html").send(
    renderAdminSyntheticPage({
      accountCounts,
      statusCounts,
      actionsLast24h,
      config,
      users,
      totalProfiles: syntheticRepo.countProfiles(),
    })
  );
});

adminRouter.post("/synthetic/config", (req, res) => {
  try {
    syntheticRepo.updateConfig(req.body, "admin");
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

adminRouter.post("/synthetic/users/:id/pause", (req, res) => {
  syntheticRepo.setStatus(req.params.id, "paused");
  res.json({ ok: true });
});
adminRouter.post("/synthetic/users/:id/resume", (req, res) => {
  syntheticRepo.setStatus(req.params.id, "active");
  res.json({ ok: true });
});
adminRouter.post("/synthetic/users/:id/retire", (req, res) => {
  syntheticRepo.setStatus(req.params.id, "retired");
  res.json({ ok: true });
});
adminRouter.post("/synthetic/users/:id/force", (req, res) => {
  const result = forceEvaluateUser(req.params.id);
  if (!result) return res.status(404).json({ ok: false, error: "No synthetic profile for that user." });
  res.json({ ok: true, result });
});

// --- Market-Calibrated Points Projection Engine (shadow mode — see projection/) ---

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

adminRouter.get("/projections", (req, res) => {
  const fixtureIds = projectionRepo.listDistinctProjectedFixtureIds();
  const rows: AdminProjectionRow[] = fixtureIds
    .map((fixtureId) => {
      const fixture = footballRepo.getFixture(fixtureId);
      if (!fixture) return null;
      const home = footballRepo.getClub(fixture.homeClubId);
      const away = footballRepo.getClub(fixture.awayClubId);
      const snapshot = projectionRepo.getLatestSnapshotForFixture(fixtureId);
      const projection = projectionRepo.getLatestFixtureProjection(fixtureId);
      const official = projectionRepo.getOfficialProjection(fixtureId);
      const row: AdminProjectionRow = {
        fixtureId,
        homeClubName: home?.name ?? fixture.homeClubId,
        awayClubName: away?.name ?? fixture.awayClubId,
        round: fixture.round,
        kickoffStr: fmtDateTime(new Date(fixture.kickoff).getTime()),
        status: fixture.status,
        consensusHomeProb: snapshot?.consensusHomeProb ?? null,
        consensusDrawProb: snapshot?.consensusDrawProb ?? null,
        consensusAwayProb: snapshot?.consensusAwayProb ?? null,
        lambdaHome: projection?.lambdaHome ?? null,
        lambdaAway: projection?.lambdaAway ?? null,
        homeProjectedPoints: projection?.homeProjectedPoints ?? null,
        awayProjectedPoints: projection?.awayProjectedPoints ?? null,
        locked: !!official,
        settled: !!official?.settledAt,
      };
      return row;
    })
    .filter((r): r is AdminProjectionRow => r != null);

  const availableRounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => a - b);
  const roundParam = parseInt(String(req.query.round ?? ""), 10);
  const selectedRound = Number.isFinite(roundParam) ? roundParam : null;
  const filteredRows = selectedRound == null ? rows : rows.filter((r) => r.round === selectedRound);

  res.type("html").send(renderAdminProjectionsPage(filteredRows, availableRounds, selectedRound));
});

adminRouter.get("/projections/:fixtureId", (req, res) => {
  const fixture = footballRepo.getFixture(req.params.fixtureId);
  if (!fixture) return res.status(404).send("Fixture not found.");
  const home = footballRepo.getClub(fixture.homeClubId);
  const away = footballRepo.getClub(fixture.awayClubId);

  const snapshot = projectionRepo.getLatestSnapshotForFixture(fixture.id);
  const bookmakers = snapshot ? projectionRepo.getSnapshotBookmakers(snapshot.id) : [];
  const latestProjection = projectionRepo.getLatestFixtureProjection(fixture.id);
  const official = projectionRepo.getOfficialProjection(fixture.id);
  const history = projectionRepo.getFixtureProjectionHistory(fixture.id);

  const topScorelines = latestProjection
    ? buildScoreMatrix(latestProjection.lambdaHome, latestProjection.lambdaAway, projectionConfig.MAX_GOALS_PER_TEAM)
        .matrix.slice()
        .sort((a, b) => b.probability - a.probability)
        .slice(0, 15)
    : [];

  res.type("html").send(
    renderAdminProjectionDetailPage({
      fixtureId: fixture.id,
      homeClubName: home?.name ?? fixture.homeClubId,
      awayClubName: away?.name ?? fixture.awayClubId,
      round: fixture.round,
      kickoffStr: fmtDateTime(new Date(fixture.kickoff).getTime()),
      status: fixture.status,
      latestSnapshot: snapshot
        ? {
            consensusHomeProb: snapshot.consensusHomeProb,
            consensusDrawProb: snapshot.consensusDrawProb,
            consensusAwayProb: snapshot.consensusAwayProb,
            consensusTotalsLine: snapshot.consensusTotalsLine,
            consensusOverProb: snapshot.consensusOverProb,
            consensusUnderProb: snapshot.consensusUnderProb,
            fetchedAtStr: fmtDateTime(snapshot.fetchedAt),
          }
        : null,
      bookmakers: bookmakers.map((b) => ({
        bookmakerTitle: b.bookmakerTitle,
        homeOdds: b.homeOdds,
        drawOdds: b.drawOdds,
        awayOdds: b.awayOdds,
        impliedHomeProb: b.impliedHomeProb,
        impliedDrawProb: b.impliedDrawProb,
        impliedAwayProb: b.impliedAwayProb,
        overroundPct: b.overroundPct,
        totalsLine: b.totalsLine,
        overOdds: b.overOdds,
        underOdds: b.underOdds,
      })),
      latestProjection: latestProjection
        ? {
            lambdaHome: latestProjection.lambdaHome,
            lambdaAway: latestProjection.lambdaAway,
            homeProjectedPoints: latestProjection.homeProjectedPoints,
            awayProjectedPoints: latestProjection.awayProjectedPoints,
            cumulativeProbabilityCovered: latestProjection.cumulativeProbabilityCovered,
          }
        : null,
      topScorelines,
      official: official
        ? {
            homeProjectedPoints: official.homeProjectedPoints,
            awayProjectedPoints: official.awayProjectedPoints,
            lockedAtStr: fmtDateTime(official.lockedAt),
            homeActualPoints: official.homeActualPoints,
            awayActualPoints: official.awayActualPoints,
            homePerformanceSurprise: official.homePerformanceSurprise,
            awayPerformanceSurprise: official.awayPerformanceSurprise,
            settledAtStr: official.settledAt ? fmtDateTime(official.settledAt) : null,
          }
        : null,
      history: history.map((h) => ({
        computedAtStr: fmtDateTime(h.computedAt),
        lambdaHome: h.lambdaHome,
        lambdaAway: h.lambdaAway,
        homeProjectedPoints: h.homeProjectedPoints,
        awayProjectedPoints: h.awayProjectedPoints,
      })),
    })
  );
});

// --- Ticker Intelligence Engine (Market Nuggets — see intelligence/) ---

function toAdminNuggetRow(n: ReturnType<typeof intelligenceRepo.getById>): AdminNuggetRow {
  const row = n!;
  const club = row.clubId ? footballRepo.getClub(row.clubId) : undefined;
  return {
    id: row.id,
    signalType: row.signalType,
    clubId: row.clubId,
    clubName: club?.name ?? null,
    interestScore: row.interestScore,
    category: row.category,
    emoji: row.emoji,
    headline: row.headline,
    body: row.body,
    isEdited: row.headline !== row.generatedHeadline || row.body !== row.generatedBody,
    sourceDataJson: row.sourceDataJson,
    status: row.status,
    isPinned: row.isPinned,
    generatedAt: row.generatedAt,
    publishedAt: row.publishedAt,
    expiresAt: row.expiresAt,
  };
}

adminRouter.get("/intelligence", (req, res) => {
  const filter = (["new", "published", "pinned", "dismissed", "expired"] as const).includes(req.query.filter as any) ? (req.query.filter as IntelligenceFilter) : "new";

  const rows =
    filter === "new"
      ? intelligenceRepo.listByStatus("CANDIDATE")
      : filter === "published"
        ? intelligenceRepo.listByStatus("PUBLISHED")
        : filter === "pinned"
          ? intelligenceRepo.listPinned()
          : filter === "dismissed"
            ? intelligenceRepo.listByStatus("DISMISSED")
            : intelligenceRepo.listExpiredPublished();

  const statusCounts = intelligenceRepo.countByStatus();
  const clubs = footballRepo.listClubs().map((c) => ({ id: c.id, name: c.name }));

  res.type("html").send(
    renderAdminIntelligencePage({
      filter,
      counts: { new: statusCounts.CANDIDATE, published: statusCounts.PUBLISHED, pinned: intelligenceRepo.listPinned().length, dismissed: statusCounts.DISMISSED },
      nuggets: rows.map((r) => toAdminNuggetRow(r)),
      clubs,
    })
  );
});

adminRouter.post("/nuggets", (req, res) => {
  try {
    const { category, emoji, headline, body, clubId, isPinned } = req.body ?? {};
    if (!category || !emoji || !headline || !body) return res.status(400).json({ ok: false, error: "category, emoji, headline, and body are required." });
    const nugget = intelligenceRepo.insertManual({
      category: String(category),
      emoji: String(emoji),
      headline: String(headline),
      body: String(body),
      clubId: clubId || null,
      ctaClubId: clubId || null,
      expiresAt: Date.now() + 48 * 60 * 60 * 1000,
      isPinned: !!isPinned,
    });
    res.json({ ok: true, id: nugget.id });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

adminRouter.post("/nuggets/:id/publish", (req, res) => {
  intelligenceRepo.publish(req.params.id, "admin");
  res.json({ ok: true });
});
adminRouter.post("/nuggets/:id/dismiss", (req, res) => {
  intelligenceRepo.dismiss(req.params.id, "admin");
  res.json({ ok: true });
});
adminRouter.post("/nuggets/:id/pin", (req, res) => {
  intelligenceRepo.setPinned(req.params.id, true);
  res.json({ ok: true });
});
adminRouter.post("/nuggets/:id/unpin", (req, res) => {
  intelligenceRepo.setPinned(req.params.id, false);
  res.json({ ok: true });
});
adminRouter.post("/nuggets/:id/edit", (req, res) => {
  const { headline, body } = req.body ?? {};
  if (!headline || !body) return res.status(400).json({ ok: false, error: "headline and body are required." });
  intelligenceRepo.editCopy(req.params.id, String(headline), String(body));
  res.json({ ok: true });
});
adminRouter.post("/nuggets/:id/regenerate", (req, res) => {
  const existing = intelligenceRepo.getById(req.params.id);
  if (!existing) return res.status(404).json({ ok: false, error: "Nugget not found." });
  if (existing.signalType === "MANUAL") return res.status(400).json({ ok: false, error: "Manual nuggets don't have a generator to re-run — edit them directly." });

  let facts: Record<string, string | number | boolean | null> = {};
  try {
    facts = JSON.parse(existing.sourceDataJson);
  } catch {
    // leave empty
  }
  const clubName = existing.clubId ? footballRepo.getClub(existing.clubId)?.name ?? null : null;
  // Cycles to the next phrasing variant deterministically off generatedAt, so repeated clicks rotate rather than repeat the same variant.
  const variant = Math.floor(existing.updatedAt / 1000) + 1;
  const copy = generateCopy({ signalType: existing.signalType, clubId: existing.clubId, facts }, clubName, variant);
  intelligenceRepo.regenerateCopy(existing.id, copy.category, copy.emoji, copy.headline, copy.body);
  res.json({ ok: true });
});
