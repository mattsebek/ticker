import "dotenv/config";
import express from "express";
import cors from "cors";
import "./db";
import { bootstrap } from "./bootstrap";
import { registerJobs } from "./jobs";
import { authRouter } from "./routes/auth";
import { portfolioRouter } from "./routes/portfolio";
import { clubsRouter } from "./routes/clubs";
import { tradesRouter } from "./routes/trades";
import { gameweekRouter } from "./routes/gameweek";
import { leaguesRouter } from "./routes/leagues";
import { briefingRouter } from "./routes/briefing";
import { internalRouter } from "./routes/internal";
import { fixturesRouter } from "./routes/fixtures";
import { standingsRouter } from "./routes/standings";
import { adminRouter } from "./routes/admin";
import { notificationsRouter } from "./routes/notifications";
import { nuggetsRouter } from "./routes/nuggets";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Layer 5 — Public API. Every router below is a thin controller: it calls
// exactly one domain service/composed presenter and shapes the HTTP
// response. No route ever imports football/providers or touches another
// domain's repo directly.
app.use("/auth", authRouter);
app.use("/portfolio", portfolioRouter);
app.use("/clubs", clubsRouter);
app.use("/trades", tradesRouter);
app.use("/gameweek", gameweekRouter);
app.use("/leagues", leaguesRouter);
app.use("/briefing", briefingRouter);
app.use("/fixtures", fixturesRouter);
app.use("/standings", standingsRouter);
app.use("/internal", internalRouter);
app.use("/admin", adminRouter);
app.use("/notifications", notificationsRouter);
app.use("/nuggets", nuggetsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong." });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

bootstrap()
  .then(() => {
    registerJobs();
    app.listen(PORT, () => {
      console.log(`Ticker API listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Fatal error during bootstrap:", err);
    process.exit(1);
  });
