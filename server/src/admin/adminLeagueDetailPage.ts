import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminLeagueStandingRow {
  rank: number;
  name: string;
  points: number;
  portfolio: number;
  isBot: boolean;
}

export function renderAdminLeagueDetailPage(opts: {
  id: string;
  name: string;
  isPrivate: boolean;
  code: string | null;
  commissioner: string;
  standings: AdminLeagueStandingRow[];
  deletable: boolean;
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

  const deleteSection = opts.deletable
    ? `
    <div style="margin:20px 0;padding-top:16px;border-top:1px solid ${T.border};">
      <button id="delete-league-btn" data-id="${esc(opts.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;background:transparent;color:${T.red};border:1px solid ${T.red};font-weight:500;">Delete League</button>
      <span style="font-size:11.5px;color:${T.textSecondary};margin-left:8px;">Removes all ${opts.standings.length} member(s) from this league and deletes it permanently.</span>
    </div>
    <script>
      document.getElementById("delete-league-btn").addEventListener("click", function () {
        if (!confirm("Delete " + ${JSON.stringify(opts.name)} + "? This removes all members and cannot be undone.")) return;
        var btn = this;
        btn.disabled = true;
        fetch("/admin/leagues/" + btn.dataset.id + "/delete", { method: "POST" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            if (!data.ok) { alert(data.error || "Delete failed."); btn.disabled = false; return; }
            window.location.href = "/admin/leagues";
          })
          .catch(function () { alert("Delete failed."); btn.disabled = false; });
      });
    </script>`
    : "";

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
    ${deleteSection}
  `;
  return renderAdminShell({ active: "leagues", title: opts.name, bodyHtml: body });
}
