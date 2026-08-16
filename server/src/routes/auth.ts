import { Router, Response } from "express";
import { z } from "zod";
import { usersRepo, UserRow, isBriefCurrentlyDismissed } from "../shared/usersRepo";
import { signToken, requireAuth, AuthedRequest } from "../shared/auth";
import { marketRepo } from "../market/repo";
import { leagueService } from "../fantasy/leagueService";
import { otpRepo, OtpPurpose } from "../shared/otpRepo";
import { sendOtpEmail } from "../shared/resend";

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

// 30 min, not the more typical 10 — Resend deliveries to this inbox have
// been arriving several minutes late, and a code that's already expired by
// the time it lands is worse than a slightly wider guess window (still
// capped by otpRepo.maxAttempts).
const OTP_TTL_MS = 30 * 60_000;
const OTP_COOLDOWN_MS = 60_000;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Shared by /register and /login — mints a code, emails it, enforces a resend cooldown. */
async function issueOtp(res: Response, email: string, purpose: OtpPurpose, payload: string | null) {
  const active = otpRepo.getLatestActive(email);
  if (active && Date.now() - active.created_at < OTP_COOLDOWN_MS) {
    return res.status(429).json({ error: "A code was just sent — check your email, or wait a moment before requesting another." });
  }
  const code = generateCode();
  otpRepo.create(email, code, purpose, payload, Date.now() + OTP_TTL_MS);
  try {
    await sendOtpEmail(email, code);
  } catch (err) {
    console.error("[auth] failed to send OTP email:", err);
    return res.status(502).json({ error: "Couldn't send the verification email. Try again in a moment." });
  }
  res.json({ ok: true, email });
}

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid input" });
  const { name, email, birthday } = parsed.data;

  if (ageFromBirthday(birthday) < MIN_AGE_YEARS) return res.status(400).json({ error: `You must be at least ${MIN_AGE_YEARS} years old to use Ticker.` });
  if (usersRepo.getByEmail(email)) return res.status(409).json({ error: "An account with that email already exists. Try logging in instead." });

  await issueOtp(res, email, "register", JSON.stringify({ name, birthday }));
});

const loginSchema = z.object({ email: z.string().trim().email() });

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email." });
  const user = usersRepo.getByEmail(parsed.data.email);
  if (!user) return res.status(404).json({ error: "No account found for that email." });
  await issueOtp(res, parsed.data.email, "login", null);
});

const verifySchema = z.object({ email: z.string().trim().email(), code: z.string().trim().min(1) });

authRouter.post("/verify", (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter the code from your email." });
  const { email, code } = parsed.data;

  const otp = otpRepo.getLatestActive(email);
  if (!otp) return res.status(400).json({ error: "That code has expired. Request a new one." });
  if (otp.attempts >= otpRepo.maxAttempts) return res.status(400).json({ error: "Too many incorrect attempts. Request a new code." });
  if (otp.code !== code) {
    otpRepo.incrementAttempts(otp.id);
    return res.status(400).json({ error: "Incorrect code." });
  }
  otpRepo.consume(otp.id);

  let user: UserRow | undefined;
  if (otp.purpose === "register") {
    // Already-consumed on a double-submit race — the account exists from
    // the first successful verify, just sign them in instead of erroring.
    user = usersRepo.getByEmail(email);
    if (!user) {
      const { name, birthday } = JSON.parse(otp.payload || "{}");
      user = usersRepo.create(name, email, birthday);
      marketRepo.ensureAccount(user.id, 100);
      leagueService.autoJoinDefaultLeagues(user.id, user.name);
    }
  } else {
    user = usersRepo.getByEmail(email);
  }
  if (!user) return res.status(404).json({ error: "No account found for that email." });

  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  const user = usersRepo.getById(req.userId!);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user) });
});
