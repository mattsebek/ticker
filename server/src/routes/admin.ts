import { Router, Request, Response, NextFunction } from "express";
import express from "express";
import jwt from "jsonwebtoken";
import { usersRepo } from "../shared/usersRepo";
import { fantasyRepo } from "../fantasy/repo";
import { marketRepo } from "../market/repo";
import { renderAdminPage } from "../admin/adminPage";
import { renderAdminLoginPage } from "../admin/adminLoginPage";
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

adminRouter.get("/", (req, res) => {
  const users = usersRepo.listAll().map((u) => ({
    ...u,
    cash: marketRepo.getCash(u.id),
    holdingsCount: marketRepo.getHoldings(u.id).length,
  }));
  const leagues = fantasyRepo.listAllLeagues().map((lg) => ({ ...lg, members: fantasyRepo.getMembers(lg.id) }));
  res.type("html").send(renderAdminPage({ users, leagues }));
});
