import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

export const JWT_SECRET = process.env.JWT_SECRET || "ticker-dev-secret";

export interface AuthedRequest extends Request {
  userId?: string;
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "90d" });
}

/** Hand-rolled rather than pulling in cookie-parser — same convention routes/admin.ts already established for its own session cookie. */
export function parseCookies(header: string | undefined): Record<string, string> {
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

export function isHttps(req: Request): boolean {
  return req.protocol === "https" || req.headers["x-forwarded-proto"] === "https";
}

// The website talks to this API through its own reverse proxy
// (ticker-website/server/index.js's /api passthrough) specifically so this
// cookie is same-origin from the browser's point of view — Safari's ITP
// blocks/evicts cookies AND localStorage set by a genuinely cross-site
// domain, which is exactly why the website was relying on localStorage
// alone (see session.ts) and users kept getting logged out. Bearer-token
// auth (the mobile app's only mechanism, via AsyncStorage — never subject
// to ITP) keeps working completely unchanged; this is purely additive.
const SESSION_COOKIE = "ticker_session";
const SESSION_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // matches signToken's own 90d expiry

export function setSessionCookie(req: Request, res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
  const token = bearerToken || cookieToken;
  if (!token) return res.status(401).json({ error: "Missing session token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
