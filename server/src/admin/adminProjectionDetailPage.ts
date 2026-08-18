import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminProjectionBookmakerRow {
  bookmakerTitle: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
  impliedHomeProb: number;
  impliedDrawProb: number;
  impliedAwayProb: number;
  overroundPct: number;
  totalsLine: number | null;
  overOdds: number | null;
  underOdds: number | null;
}

export interface AdminProjectionScoreline {
  homeGoals: number;
  awayGoals: number;
  probability: number;
}

export interface AdminProjectionHistoryRow {
  computedAtStr: string;
  lambdaHome: number;
  lambdaAway: number;
  homeProjectedPoints: number;
  awayProjectedPoints: number;
}

export interface AdminProjectionDetail {
  fixtureId: string;
  homeClubName: string;
  awayClubName: string;
  round: number;
  kickoffStr: string;
  status: string;
  latestSnapshot: {
    consensusHomeProb: number;
    consensusDrawProb: number;
    consensusAwayProb: number;
    consensusTotalsLine: number | null;
    consensusOverProb: number | null;
    consensusUnderProb: number | null;
    fetchedAtStr: string;
  } | null;
  bookmakers: AdminProjectionBookmakerRow[];
  latestProjection: { lambdaHome: number; lambdaAway: number; homeProjectedPoints: number; awayProjectedPoints: number; cumulativeProbabilityCovered: number } | null;
  topScorelines: AdminProjectionScoreline[];
  official: {
    homeProjectedPoints: number;
    awayProjectedPoints: number;
    lockedAtStr: string;
    homeActualPoints: number | null;
    awayActualPoints: number | null;
    homePerformanceSurprise: number | null;
    awayPerformanceSurprise: number | null;
    settledAtStr: string | null;
  } | null;
  history: AdminProjectionHistoryRow[];
}

function statCard(label: string, value: string, color?: string): string {
  return `<div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 16px;">
    <div style="font-size:11px;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${esc(label)}</div>
    <div style="font-size:18px;font-weight:600;color:${color ?? T.text};">${value}</div>
  </div>`;
}
function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}
function pts(n: number): string {
  return n.toFixed(2);
}
function surpriseColor(n: number | null): string {
  if (n == null) return T.textSecondary;
  return n > 0 ? T.accent : n < 0 ? T.red : T.textSecondary;
}

export function renderAdminProjectionDetailPage(d: AdminProjectionDetail): string {
  const statCards = d.latestProjection
    ? `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:20px;">
      ${statCard("Consensus 1X2", d.latestSnapshot ? `${pct(d.latestSnapshot.consensusHomeProb)} / ${pct(d.latestSnapshot.consensusDrawProb)} / ${pct(d.latestSnapshot.consensusAwayProb)}` : "—")}
      ${statCard("λ Home / Away", `${d.latestProjection.lambdaHome.toFixed(2)} / ${d.latestProjection.lambdaAway.toFixed(2)}`)}
      ${statCard("Projected Points — Home", pts(d.latestProjection.homeProjectedPoints), T.accent)}
      ${statCard("Projected Points — Away", pts(d.latestProjection.awayProjectedPoints), T.accent)}
      ${statCard("Matrix Coverage", pct(d.latestProjection.cumulativeProbabilityCovered))}
    </div>`
    : `<div style="color:${T.textSecondary};font-size:13px;margin-bottom:20px;">No projection computed yet for this fixture.</div>`;

  const officialCard = d.official
    ? `
    <div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px;margin-bottom:20px;">
      <div style="font-size:13px;font-weight:600;margin-bottom:10px;color:${T.text};">🔒 Official (locked) Projection — immutable, set ${esc(d.official.lockedAtStr)}</div>
      <div style="font-size:12px;color:${T.textSecondary};line-height:1.9;">
        <div>Projected: <b style="color:${T.text};">${pts(d.official.homeProjectedPoints)}</b> (home) / <b style="color:${T.text};">${pts(d.official.awayProjectedPoints)}</b> (away)</div>
        ${
          d.official.settledAtStr
            ? `
        <div>Actual: <b style="color:${T.text};">${pts(d.official.homeActualPoints!)}</b> (home) / <b style="color:${T.text};">${pts(d.official.awayActualPoints!)}</b> (away)</div>
        <div>Performance Surprise: <b style="color:${surpriseColor(d.official.homePerformanceSurprise)};">${d.official.homePerformanceSurprise! >= 0 ? "+" : ""}${pts(d.official.homePerformanceSurprise!)}</b> (home) /
          <b style="color:${surpriseColor(d.official.awayPerformanceSurprise)};">${d.official.awayPerformanceSurprise! >= 0 ? "+" : ""}${pts(d.official.awayPerformanceSurprise!)}</b> (away)</div>
        <div style="color:${T.textSecondary};">Settled ${esc(d.official.settledAtStr)}</div>`
            : `<div style="font-style:italic;">Not settled yet — fixture hasn't finished.</div>`
        }
      </div>
    </div>`
    : "";

  const bookmakerRows = d.bookmakers
    .map(
      (b) => `
      <tr>
        <td>${esc(b.bookmakerTitle)}</td>
        <td>${b.homeOdds.toFixed(2)} / ${b.drawOdds.toFixed(2)} / ${b.awayOdds.toFixed(2)}</td>
        <td>${pct(b.impliedHomeProb)} / ${pct(b.impliedDrawProb)} / ${pct(b.impliedAwayProb)}</td>
        <td>${b.overroundPct.toFixed(1)}%</td>
        <td>${b.totalsLine != null ? `${b.totalsLine} (${b.overOdds!.toFixed(2)} / ${b.underOdds!.toFixed(2)})` : "—"}</td>
      </tr>`
    )
    .join("");

  const scorelineRows = d.topScorelines
    .map(
      (s) => `
      <tr>
        <td>${s.homeGoals}-${s.awayGoals}</td>
        <td>${pct(s.probability)}</td>
      </tr>`
    )
    .join("");

  const historyItems = d.history
    .map(
      (h) => `
      <details style="background:${T.card};border:1px solid ${T.border};border-radius:10px;margin-bottom:6px;">
        <summary style="padding:10px 14px;cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;">
          <span style="color:${T.textSecondary};font-size:12px;">${esc(h.computedAtStr)}</span>
          <span style="font-weight:600;color:${T.text};">${pts(h.homeProjectedPoints)} / ${pts(h.awayProjectedPoints)}</span>
        </summary>
        <div style="padding:0 14px 12px;font-size:12.5px;color:${T.textSecondary};line-height:1.7;">
          <div>λ Home: <b>${h.lambdaHome.toFixed(3)}</b> · λ Away: <b>${h.lambdaAway.toFixed(3)}</b></div>
        </div>
      </details>`
    )
    .join("");

  const body = `
    <a href="/admin/projections" style="color:${T.textSecondary};font-size:13px;text-decoration:none;">← Projections</a>
    <h1 style="margin-top:10px;">${esc(d.homeClubName)} vs ${esc(d.awayClubName)}
      <span style="color:${T.textSecondary};font-weight:400;font-size:14px;">Round ${d.round} · ${esc(d.kickoffStr)} · ${esc(d.status)}</span>
    </h1>

    ${statCards}
    ${officialCard}

    <h2 style="font-size:15px;">Per-Bookmaker Odds (latest snapshot, vig removed)</h2>
    <div class="table-wrap" style="margin-bottom:20px;">
      <table>
        <thead><tr><th>Bookmaker</th><th>Odds H/D/A</th><th>Implied Prob H/D/A</th><th>Overround</th><th>Totals (O/U)</th></tr></thead>
        <tbody>${bookmakerRows || `<tr><td colspan="5" class="empty">No bookmaker data yet.</td></tr>`}</tbody>
      </table>
    </div>

    <h2 style="font-size:15px;">Score Matrix Trace <span style="color:${T.textSecondary};font-weight:400;font-size:12px;">(top 15 by probability, recomputed live from λ)</span></h2>
    <div class="table-wrap" style="margin-bottom:20px;max-width:320px;">
      <table>
        <thead><tr><th>Score</th><th>Probability</th></tr></thead>
        <tbody>${scorelineRows || `<tr><td colspan="2" class="empty">No projection yet.</td></tr>`}</tbody>
      </table>
    </div>

    <h2 style="font-size:15px;">Projection History <span style="color:${T.textSecondary};font-weight:400;font-size:12px;">(newest first, material changes only)</span></h2>
    ${historyItems || `<div style="color:${T.textSecondary};font-size:13px;">No history yet.</div>`}
  `;
  return renderAdminShell({ active: "projections", title: `${d.homeClubName} vs ${d.awayClubName}`, bodyHtml: body });
}
