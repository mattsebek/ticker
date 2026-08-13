import { UserRow } from "../shared/usersRepo";
import { LeagueRow } from "../fantasy/repo";

// Colors copied 1:1 from app/src/theme/theme.ts's DARK_THEME — kept as a
// standalone constant here rather than importing the app's theme file,
// since this is a separate TypeScript project (server/) with its own build.
const T = {
  bg: "#000000",
  card: "#151718",
  text: "#F5F6F5",
  textSecondary: "#8E9296",
  border: "#2A2C2E",
  borderLight: "#222425",
  accent: "#00C805",
  red: "#E0393E",
  elevated: "#1C1E1F",
};

export interface AdminUserRow extends UserRow {
  cash: number;
  holdingsCount: number;
}

export interface AdminLeagueRow extends LeagueRow {
  members: { member_id: string; member_name: string; is_bot: number }[];
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function usersTable(users: AdminUserRow[]): string {
  const rows = users
    .map(
      (u) => `
        <tr>
          <td>${esc(u.name)}</td>
          <td>${esc(u.email)}</td>
          <td>${esc(u.birthday)}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td>${u.onboarded ? "Yes" : "No"}</td>
          <td>$${u.cash.toFixed(2)}</td>
          <td>${u.holdingsCount}</td>
        </tr>`
    )
    .join("");
  return `
    <h2>Users <span class="count">${users.length}</span></h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Birthday</th><th>Joined</th><th>Onboarded</th><th>Cash</th><th>Holdings</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No users yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

function leaguesTable(leagues: AdminLeagueRow[]): string {
  const rows = leagues
    .map((lg) => {
      const memberNames = lg.members.map((m) => esc(m.member_name) + (m.is_bot ? " (bot)" : "")).join(", ");
      return `
        <tr>
          <td>${esc(lg.name)}</td>
          <td>${lg.is_private ? "Private" : "Public"}</td>
          <td>${lg.code ? esc(lg.code) : "—"}</td>
          <td>${esc(lg.commissioner)}</td>
          <td>${lg.members.length}</td>
          <td class="members">${memberNames || "—"}</td>
        </tr>`;
    })
    .join("");
  return `
    <h2>Leagues <span class="count">${leagues.length}</span></h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Visibility</th><th>Code</th><th>Commissioner</th><th>Members</th><th>Roster</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">No leagues yet.</td></tr>`}</tbody>
      </table>
    </div>`;
}

export function renderAdminPage(data: { users: AdminUserRow[]; leagues: AdminLeagueRow[] }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticker Admin</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${T.bg};
    color: ${T.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Georgia, serif;
    padding: 24px 16px 60px;
  }
  h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
  .subtitle { color: ${T.textSecondary}; font-size: 13px; margin: 0 0 28px; }
  h2 { font-size: 16px; font-weight: 600; margin: 32px 0 12px; }
  .count { color: ${T.textSecondary}; font-weight: 400; font-size: 13px; }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid ${T.border};
    border-radius: 12px;
    background: ${T.card};
  }
  table { border-collapse: collapse; width: 100%; min-width: 640px; }
  th, td {
    text-align: left;
    padding: 10px 14px;
    font-size: 13px;
    border-bottom: 1px solid ${T.borderLight};
    white-space: nowrap;
  }
  td.members { white-space: normal; max-width: 360px; color: ${T.textSecondary}; }
  th {
    color: ${T.textSecondary};
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-size: 11px;
    font-weight: 600;
    background: ${T.elevated};
  }
  tr:last-child td { border-bottom: none; }
  td.empty { color: ${T.textSecondary}; text-align: center; padding: 20px; }
  a { color: ${T.accent}; }
</style>
</head>
<body>
  <h1>Ticker Admin</h1>
  <p class="subtitle">Read-only view of registered users and leagues.</p>
  ${usersTable(data.users)}
  ${leaguesTable(data.leagues)}
</body>
</html>`;
}
