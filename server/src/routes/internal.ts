import { Router } from "express";
import { scheduler } from "../jobs/scheduler";

/** Basic job observability — not authenticated, intended for local/ops use only. */
export const internalRouter = Router();

internalRouter.get("/jobs", (req, res) => {
  res.json({ jobs: scheduler.getStatus() });
});
