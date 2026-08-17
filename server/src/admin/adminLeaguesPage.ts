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
    .map((lg) => {
      const search = `${lg.name} ${lg.commissioner} ${lg.code ?? ""}`.toLowerCase();
      return `
        <tr data-search="${esc(search)}">
          <td><a href="/admin/leagues/${encodeURIComponent(lg.id)}">${esc(lg.name)}</a></td>
          <td>${lg.isPrivate ? "Private" : "Public"}</td>
          <td>${lg.code ? esc(lg.code) : "—"}</td>
          <td>${esc(lg.commissioner)}</td>
          <td>${lg.memberCount}</td>
        </tr>`;
    })
    .join("");

  const body = `
    <h1>Leagues <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${leagues.length}</span></h1>
    <input id="search" type="text" placeholder="Search by name, commissioner, or code..." style="
      width: 100%; max-width: 420px; padding: 10px 14px; margin-bottom: 16px;
      border-radius: 10px; border: 1px solid ${T.border}; background: ${T.card};
      color: ${T.text}; font-size: 14px;
    " />
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Visibility</th><th>Code</th><th>Commissioner</th><th>Members</th></tr></thead>
        <tbody id="rows">${rows || `<tr><td colspan="5" class="empty">No leagues yet.</td></tr>`}</tbody>
      </table>
    </div>
    <p id="status" style="color: ${T.textSecondary}; font-size: 13px; margin-top: 12px;"></p>

    <script>
      (function () {
        var searchEl = document.getElementById("search");
        var rowsEl = document.getElementById("rows");
        var statusEl = document.getElementById("status");
        var allRows = Array.prototype.slice.call(rowsEl.querySelectorAll("tr[data-search]"));

        searchEl.addEventListener("input", function () {
          var query = searchEl.value.trim().toLowerCase();
          var visible = 0;
          allRows.forEach(function (row) {
            var match = !query || row.getAttribute("data-search").indexOf(query) !== -1;
            row.style.display = match ? "" : "none";
            if (match) visible++;
          });
          statusEl.textContent = query ? "" + visible + " of " + allRows.length + " leagues" : "";
        });
      })();
    </script>
  `;
  return renderAdminShell({ active: "leagues", title: "Leagues", bodyHtml: body });
}
