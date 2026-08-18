import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminProjectionRow {
  fixtureId: string;
  homeClubName: string;
  awayClubName: string;
  round: number;
  kickoffStr: string;
  status: string;
  consensusHomeProb: number | null;
  consensusDrawProb: number | null;
  consensusAwayProb: number | null;
  lambdaHome: number | null;
  lambdaAway: number | null;
  homeProjectedPoints: number | null;
  awayProjectedPoints: number | null;
  locked: boolean;
  settled: boolean;
}

function pct(n: number | null): string {
  return n == null ? "—" : (n * 100).toFixed(0) + "%";
}
function num(n: number | null, digits = 1): string {
  return n == null ? "—" : n.toFixed(digits);
}

export function renderAdminProjectionsPage(rows: AdminProjectionRow[], availableRounds: number[], selectedRound: number | null): string {
  const roundOptions = availableRounds
    .map((r) => `<option value="${r}"${r === selectedRound ? " selected" : ""}>Gameweek ${r}</option>`)
    .join("");
  const filterHtml = `
    <select onchange="location.href = '/admin/projections' + (this.value ? '?round=' + this.value : '')" style="
      background:${T.card};border:1px solid ${T.border};border-radius:10px;color:${T.text};
      font-size:13px;padding:7px 12px;cursor:pointer;
    ">
      <option value=""${selectedRound == null ? " selected" : ""}>All Gameweeks</option>
      ${roundOptions}
    </select>`;

  const sorted = rows.slice().sort((a, b) => a.round - b.round || a.kickoffStr.localeCompare(b.kickoffStr));
  const body = sorted
    .map((r) => {
      const detailHref = `/admin/projections/${encodeURIComponent(r.fixtureId)}`;
      const statusBadge = r.settled
        ? `<span style="color:${T.accent};font-size:11px;">✓ Settled</span>`
        : r.locked
          ? `<span style="color:${T.textSecondary};font-size:11px;">🔒 Locked</span>`
          : `<span style="color:${T.textSecondary};font-size:11px;">${esc(r.status)}</span>`;
      return `
        <tr>
          <td><a href="${detailHref}" style="color:${T.text};text-decoration:none;">${esc(r.homeClubName)} (h) vs ${esc(r.awayClubName)} (a)</a></td>
          <td style="text-align:center;">${r.round}</td>
          <td>${esc(r.kickoffStr)}</td>
          <td>${pct(r.consensusHomeProb)} / ${pct(r.consensusDrawProb)} / ${pct(r.consensusAwayProb)}</td>
          <td>${num(r.lambdaHome, 2)} / ${num(r.lambdaAway, 2)}</td>
          <td>${num(r.homeProjectedPoints)} / ${num(r.awayProjectedPoints)}</td>
          <td>${statusBadge}</td>
        </tr>`;
    })
    .join("");

  const html = `
    <h1>Projections <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${rows.length}</span></h1>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin:-12px 0 20px;">
      <p style="color:${T.textSecondary};font-size:13px;margin:0;">Market-calibrated Points Projection Engine — shadow mode. These numbers do not affect live club pricing yet.</p>
      ${filterHtml}
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Fixture</th><th style="text-align:center;">GW</th><th>Kickoff</th><th>Consensus H/D/A</th><th>λ Home/Away</th><th>Projected Pts H/A</th><th>Status</th></tr></thead>
        <tbody>${body || `<tr><td colspan="7" class="empty">No projections computed yet — run the odds-refresh job or POST /internal/refresh-odds-projections.</td></tr>`}</tbody>
      </table>
    </div>
  `;
  return renderAdminShell({ active: "projections", title: "Projections", bodyHtml: html });
}
