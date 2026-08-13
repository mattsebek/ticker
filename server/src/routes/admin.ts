import { Router, Request, Response, NextFunction } from "express";
import { usersRepo } from "../shared/usersRepo";
import { fantasyRepo } from "../fantasy/repo";
import { marketRepo } from "../market/repo";
import { renderAdminPage } from "../admin/adminPage";

/**
 * Read-only admin CMS — a single shared password via ADMIN_PASSWORD, checked
 * with HTTP Basic Auth (any username, only the password matters). No login
 * page to build: the browser's native credential prompt handles it, and
 * `curl -u` works for scripted checks. Not tied to per-user accounts —
 * fine for a solo-founder MVP, revisit if this ever needs multiple admins.
 */
function requireAdminPassword(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return res.status(503).send("ADMIN_PASSWORD not configured.");

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", 'Basic realm="Ticker Admin"');
    return res.status(401).send("Authentication required.");
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1); // username ignored — single shared password
  if (password !== expected) {
    res.set("WWW-Authenticate", 'Basic realm="Ticker Admin"');
    return res.status(401).send("Invalid password.");
  }
  next();
}

export const adminRouter = Router();
adminRouter.use(requireAdminPassword);

adminRouter.get("/", (req, res) => {
  const users = usersRepo.listAll().map((u) => ({
    ...u,
    cash: marketRepo.getCash(u.id),
    holdingsCount: marketRepo.getHoldings(u.id).length,
  }));
  const leagues = fantasyRepo.listAllLeagues().map((lg) => ({ ...lg, members: fantasyRepo.getMembers(lg.id) }));
  res.type("html").send(renderAdminPage({ users, leagues }));
});
