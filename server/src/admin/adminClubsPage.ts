import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminClubRow {
  name: string;
  code: string;
  startingPrice: number;
  currentPrice: number;
  pctChange: number;
}

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}

export function renderAdminClubsPage(clubs: AdminClubRow[]): string {
  const sorted = clubs.slice().sort((a, b) => b.currentPrice - a.currentPrice);
  const rows = sorted
    .map((c) => {
      const cls = c.pctChange > 0 ? "pos" : c.pctChange < 0 ? "neg" : "";
      const sign = c.pctChange >= 0 ? "+" : "";
      return `
        <tr>
          <td>${esc(c.name)} <span style="color:${T.textSecondary};">(${esc(c.code)})</span></td>
          <td>${fmt(c.startingPrice)}</td>
          <td>${fmt(c.currentPrice)}</td>
          <td class="${cls}">${sign}${c.pctChange.toFixed(1)}%</td>
        </tr>`;
    })
    .join("");

  const body = `
    <h1>Clubs <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${clubs.length}</span></h1>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Club</th><th>Starting Value</th><th>Current Value</th><th>% Change</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="empty">No clubs yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
  return renderAdminShell({ active: "clubs", title: "Clubs", bodyHtml: body });
}
