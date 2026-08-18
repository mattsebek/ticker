import { renderAdminShell, esc, T } from "./adminShell";
import { pricingConfig } from "../market/pricingConfig";
import { PricePressureResult, Direction } from "../market/pricePressure";

const WARNING = "#F0A202";

export interface AdminClubDetail {
  id: string;
  name: string;
  code: string;
  currentPrice: number;
  startingPrice: number;
  pctChange24h: number;
  pctChange7d: number;
  pressure: PricePressureResult;
  priceDirection: Direction;
  ppsDirection: Direction;
  divergence: "ALIGNED" | "DIVERGENCE" | null;
  timeline: any[]; // raw price_history rows, newest first — see market/repo.ts getPriceHistoryTimeline
  /** From the shadow-mode Projection Engine (projection/) — not wired into pricing yet, shown here for visibility only. Null if no forward projection has been computed for this club. */
  forwardProjection: { points: number; delta: number | null; gameweeks: number; fixtureCount: number } | null;
}

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}
function pct(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
function pctColor(n: number): string {
  return n > 0 ? T.accent : n < 0 ? T.red : T.textSecondary;
}
/**
 * Renders a placeholder that a small client-side script (see
 * renderAdminClubDetailPage's <script> tag) fills in with the timestamp
 * formatted in the VIEWER's own local timezone. A server-rendered
 * toLocaleString() would format in whatever timezone the Node process
 * itself runs in (UTC on Railway) — every admin would see the same wrong
 * clock regardless of where they actually are, silently misattributing
 * events to the wrong time of day.
 */
function fmtTime(ms: number): string {
  return `<span class="local-time" data-ts="${ms}"></span>`;
}
function scoreColor(n: number | null): string {
  if (n == null) return T.textSecondary;
  return n > 20 ? T.accent : n < -20 ? T.red : T.textSecondary;
}
function directionLabel(d: Direction): string {
  return d === "UP" ? "▲ UP" : d === "DOWN" ? "▼ DOWN" : "→ NEUTRAL";
}

function statCard(label: string, value: string, color?: string): string {
  return `<div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 16px;">
    <div style="font-size:11px;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${esc(label)}</div>
    <div style="font-size:18px;font-weight:600;color:${color ?? T.text};">${value}</div>
  </div>`;
}

function renderTimelineEvent(row: any): string {
  const time = fmtTime(row.created_at);
  const impact = row.impact_pct != null ? pct(row.impact_pct * 100) : "—";
  let label = row.event_type ?? "LEGACY";
  let detail = "";

  if (row.event_type === "PERFORMANCE") {
    const hasPoints = row.actual_ticker_points != null && row.expected_ticker_points != null;
    const delta = hasPoints ? row.actual_ticker_points - row.expected_ticker_points : null;
    detail = hasPoints
      ? `
      <div>Expected points: <b>${row.expected_ticker_points.toFixed(2)}</b></div>
      <div>Actual points: <b>${row.actual_ticker_points.toFixed(2)}</b></div>
      <div>Delta: <b>${delta!.toFixed(2)}</b></div>
      <div>Applied impact: <b>${impact}</b> (capped at ±${(pricingConfig.PERFORMANCE_CAP_PCT * 100).toFixed(0)}%)</div>`
      : `
      <div style="font-style:italic;">Expected/actual points weren't recorded for this settlement — it predates Market Pricing V2.</div>
      <div>Applied impact: <b>${impact}</b> (capped at ±${(pricingConfig.PERFORMANCE_CAP_PCT * 100).toFixed(0)}%)</div>`;
  } else if (row.event_type === "DEMAND") {
    // "Requested" is recomputed from the stored demand_signal against the CURRENT tick cap config —
    // exact unless DEMAND_TICK_CAP_PCT has changed since this row was written.
    const requested = row.demand_signal != null ? Math.max(-pricingConfig.DEMAND_TICK_CAP_PCT, Math.min(pricingConfig.DEMAND_TICK_CAP_PCT, row.demand_signal * pricingConfig.DEMAND_TICK_CAP_PCT)) : null;
    detail = `
      <div>Net buyers: <b>${row.net_buyers ?? "—"}</b> · Net sellers: <b>${row.net_sellers ?? "—"}</b></div>
      <div>Ownership: <b>${row.starting_owner_count ?? "—"} → ${row.ending_owner_count ?? "—"}</b></div>
      <div>Demand signal: <b>${row.demand_signal != null ? row.demand_signal.toFixed(3) : "—"}</b></div>
      <div>Requested impact: <b>${requested != null ? pct(requested * 100) : "—"}</b></div>
      <div>Applied impact (after 24h guardrail): <b>${impact}</b></div>`;
  } else if (row.event_type === "OPENING") {
    detail = `<div>Opening price set to <b>${fmt(row.price)}</b>.</div>`;
  } else if (row.event_type === "ADMIN") {
    detail = `<div>Manually adjusted from ${fmt(row.previous_price ?? row.price)} to ${fmt(row.price)}.</div>`;
    label = "ADMIN";
  } else {
    detail = `<div>Legacy row (predates event tracking) — round ${row.round}.</div>`;
    label = "LEGACY";
  }

  const color = row.impact_pct > 0 ? T.accent : row.impact_pct < 0 ? T.red : T.textSecondary;
  // Price transition alongside the % so a glance down the timeline shows the
  // actual dollar fluctuation, not just the relative change.
  const priceTransition = row.previous_price != null ? `${fmt(row.previous_price)} → ${fmt(row.price)}` : fmt(row.price);
  return `
    <details style="background:${T.card};border:1px solid ${T.border};border-radius:10px;margin-bottom:6px;">
      <summary style="padding:10px 14px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <span><span style="color:${T.textSecondary};font-size:12px;">${time}</span> — <b>${esc(label)}</b></span>
        <span style="text-align:right;white-space:nowrap;">
          <span style="color:${T.textSecondary};font-size:12px;">${priceTransition}</span>
          <span style="color:${color};font-weight:600;margin-left:8px;">${impact}</span>
        </span>
      </summary>
      <div style="padding:0 14px 12px;font-size:12.5px;color:${T.textSecondary};line-height:1.7;">${detail}</div>
    </details>`;
}

function pressureBreakdown(title: string, p: PricePressureResult["market"], score: number | null): string {
  return `
    <div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;">${esc(title)}: <span style="color:${scoreColor(score)};">${score ?? "—"}</span></div>
      <div style="font-size:12px;color:${T.textSecondary};line-height:1.8;">
        <div>Net buyers: <b style="color:${T.text};">${p.netBuyers}</b> · Net sellers: <b style="color:${T.text};">${p.netSellers}</b> · Participants: <b style="color:${T.text};">${p.totalParticipants}</b></div>
        <div>Ownership signal: <b style="color:${T.text};">${p.ownershipSignal != null ? p.ownershipSignal.toFixed(2) : "not enough tick history yet"}</b></div>
      </div>
    </div>`;
}

export function renderAdminClubDetailPage(d: AdminClubDetail): string {
  const divergenceBadge =
    d.divergence === "DIVERGENCE"
      ? `<span style="color:${WARNING};font-weight:600;">⚠ DIVERGENCE</span>`
      : d.divergence === "ALIGNED"
        ? `<span style="color:${T.accent};font-weight:600;">✓ ALIGNED</span>`
        : `<span style="color:${T.textSecondary};">Not enough data yet</span>`;

  const timeline = d.timeline.length ? d.timeline.map(renderTimelineEvent).join("") : `<div style="color:${T.textSecondary};font-size:13px;">No price history yet.</div>`;

  const body = `
    <a href="/admin/clubs" style="color:${T.textSecondary};font-size:13px;text-decoration:none;">← Clubs</a>
    <h1 style="margin-top:10px;">${esc(d.name)} <span style="color:${T.textSecondary};font-weight:400;font-size:14px;">(${esc(d.code)})</span></h1>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
      ${statCard("Current Price", fmt(d.currentPrice))}
      ${statCard("Opening Price", fmt(d.startingPrice))}
      ${statCard("24H Change", pct(d.pctChange24h), pctColor(d.pctChange24h))}
      ${statCard("7D Change", pct(d.pctChange7d), pctColor(d.pctChange7d))}
      ${
        d.forwardProjection
          ? statCard(
              `Forward Proj. (${d.forwardProjection.gameweeks} GW)`,
              `${d.forwardProjection.points.toFixed(1)} pts` + (d.forwardProjection.delta != null ? ` <span style="font-size:12px;color:${d.forwardProjection.delta >= 0 ? T.accent : T.red};">${d.forwardProjection.delta >= 0 ? "+" : ""}${d.forwardProjection.delta.toFixed(1)}</span>` : "")
            )
          : statCard(`Forward Proj.`, "—")
      }
    </div>

    <div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:11px;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Price Pressure Score</div>
          <div style="font-size:28px;font-weight:600;color:${scoreColor(d.pressure.score)};">${d.pressure.score ?? "—"}</div>
        </div>
        <div style="font-size:12px;color:${T.textSecondary};text-align:right;line-height:1.9;">
          <div>Price direction (24H): <b style="color:${T.text};">${directionLabel(d.priceDirection)}</b></div>
          <div>Price Pressure direction: <b style="color:${T.text};">${directionLabel(d.ppsDirection)}</b></div>
          <div style="margin-top:4px;">${divergenceBadge}</div>
        </div>
      </div>
      <div style="margin-top:14px;font-size:12px;color:${T.textSecondary};">
        All Users: <b style="color:${T.text};">${d.pressure.score ?? "—"}</b> &nbsp;·&nbsp; Human Only: <b style="color:${T.text};">${d.pressure.humanOnlyScore ?? "—"}</b>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:24px;">
      ${statCard("Form (30%)", d.pressure.form != null ? Math.round(d.pressure.form).toString() : "—", scoreColor(d.pressure.form))}
      ${statCard("Expectation (40%)", d.pressure.expectation != null ? Math.round(d.pressure.expectation).toString() : "—", scoreColor(d.pressure.expectation))}
      ${pressureBreakdown("Market (30%) — All Users", d.pressure.market, Math.round(d.pressure.market.score))}
      ${pressureBreakdown("Market (30%) — Human Only", d.pressure.humanOnlyMarket, Math.round(d.pressure.humanOnlyMarket.score))}
    </div>

    <h1 style="font-size:16px;">Price History</h1>
    ${timeline}

    <script>
      document.querySelectorAll(".local-time").forEach(function (el) {
        var ms = parseInt(el.getAttribute("data-ts"), 10);
        if (!isNaN(ms)) {
          el.textContent = new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        }
      });
    </script>
  `;
  return renderAdminShell({ active: "clubs", title: d.name, bodyHtml: body });
}
