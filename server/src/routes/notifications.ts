import { Router } from "express";
import { z } from "zod";
import { requireAuth, AuthedRequest } from "../shared/auth";
import { pushRepo } from "../notifications/repo";

export const notificationsRouter = Router();

notificationsRouter.get("/status", requireAuth, (req: AuthedRequest, res) => {
  res.json({ enabled: pushRepo.hasEnabledToken(req.userId!) });
});

const registerTokenSchema = z.object({
  token: z.string().trim().min(1),
  platform: z.enum(["ios", "android"]),
});

notificationsRouter.post("/register-token", requireAuth, (req: AuthedRequest, res) => {
  const parsed = registerTokenSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid push token." });
  pushRepo.upsertToken(req.userId!, parsed.data.token, parsed.data.platform);
  res.json({ ok: true });
});

notificationsRouter.patch("/enabled", requireAuth, (req: AuthedRequest, res) => {
  pushRepo.setEnabled(req.userId!, !!req.body?.enabled);
  res.json({ ok: true });
});
