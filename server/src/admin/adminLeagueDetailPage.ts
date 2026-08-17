import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminLeagueStandingRow {
  rank: number;
  name: string;
  points: number;
  portfolio: number;
  isBot: boolean;
}

export function renderAdminLeagueDetailPage(opts: {
  name: string;
  isPrivate: boolean;
  code: string | null;
  commissioner: string;
  standings: AdminLeagueStandingRow[];
}): string {
  const rows = opts.standings
    .map(
      (s) => `
        <tr>
          <td>${s.rank}</td>
          <td>${esc(s.name)}${s.isBot ? ` <span style="color:${T.textSecondary};">(bot)</span>` : ""}</td>
          <td>${s.points}</td>
          <td>$${s.portfolio.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const body = `
    <p style="margin: 0 0 16px;"><a href="/admin/leagues">&larr; Leagues</a></p>
    <h1>${esc(opts.name)}</h1>
    <p style="color:${T.textSecondary};font-size:13px;margin:-12px 0 20px;">
      ${opts.isPrivate ? "Private" : "Public"} &middot; Code: ${opts.code ? esc(opts.code) : "—"} &middot; Commissioner: ${esc(opts.commissioner)} &middot; ${opts.standings.length} members
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Rank</th><th>Manager</th><th>Points</th><th>Portfolio</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="4" class="empty">No standings yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
  return renderAdminShell({ active: "leagues", title: opts.name, bodyHtml: body });
}
