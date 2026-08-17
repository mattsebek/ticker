import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminLeagueRow {
  id: string;
  name: string;
  isPrivate: boolean;
  code: string | null;
  commissioner: string;
  memberCount: number;
}

export function renderAdminLeaguesPage(leagues: AdminLeagueRow[]): string {
  const rows = leagues
    .map(
      (lg) => `
        <tr>
          <td><a href="/admin/leagues/${encodeURIComponent(lg.id)}">${esc(lg.name)}</a></td>
          <td>${lg.isPrivate ? "Private" : "Public"}</td>
          <td>${lg.code ? esc(lg.code) : "—"}</td>
          <td>${esc(lg.commissioner)}</td>
          <td>${lg.memberCount}</td>
        </tr>`
    )
    .join("");

  const body = `
    <h1>Leagues <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${leagues.length}</span></h1>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Visibility</th><th>Code</th><th>Commissioner</th><th>Members</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="empty">No leagues yet.</td></tr>`}</tbody>
      </table>
    </div>
  `;
  return renderAdminShell({ active: "leagues", title: "Leagues", bodyHtml: body });
}
