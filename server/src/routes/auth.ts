import { Router } from "express";
import { z } from "zod";
import { usersRepo, UserRow, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { signToken, requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { leagueService } from "../fantasy/leagueService";

export const authRouter = Router();

// Must match RegisterForm.tsx's MIN_AGE_YEARS — the client already enforces
// this via the date picker's maximumDate and tells the user "13+" in the
// hint text, so the server rejecting anyone under 16 was silently
// contradicting what the UI promised.
const MIN_AGE_YEARS = 13;

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  birthday: z.string().trim().min(1),
});

function publicUser(u: UserRow) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    birthday: u.birthday,
    cash: marketRepo.getCash(u.id),
    theme: u.theme,
    onboarded: !!u.onboarded,
    hasHoldings: marketRepo.getHoldings(u.id).length > 0,
    briefDismissed: isBriefCurrentlyDismissed(u),
    joinDateStr: new Date(u.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    createdAt: u.created_at,
  };
}

function ageFromBirthday(birthday: string): number {
  const bd = new Date(birthday);
  if (isNaN(bd.getTime())) return 99;
  const now = new Date();
  let age = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) age--;
  return age;
}

authRouter.post("/register", (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
  const { name, email, birthday } = parsed.data;

  if (ageFromBirthday(birthday) < MIN_AGE_YEARS) return res.status(400).json({ error: `You must be at least ${MIN_AGE_YEARS} years old to use Ticker.` });
  if (usersRepo.getByEmail(email)) return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });

  const user = usersRepo.create(name, email, birthday);
  marketRepo.ensureAccount(user.id, 100);
  leagueService.autoJoinDefaultLeagues(user.id, user.name);

  res.json({ token: signToken(user.id), user: publicUser(user) });
});

const loginSchema = z.object({ email: z.string().trim().email() });

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
  const user = usersRepo.getByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No account found for that email." });
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});
