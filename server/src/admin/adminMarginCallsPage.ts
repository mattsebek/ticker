import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminMarginCallRow {
  userId: string;
  name: string;
  email: string;
  since: number;
  cash: number;
  shortValue: number;
}

function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Same viewer-local-timezone placeholder pattern used across the admin pages. */
function fmtTime(ms: number): string {
  return `<span class="local-time" data-ts="${ms}"></span>`;
}

export function renderAdminMarginCallsPage(rows: AdminMarginCallRow[]): string {
  const tableRows = rows
    .map((r) => {
      const shortfall = r.shortValue - r.cash;
      return `
        <tr>
          <td><a href="/admin/users/${encodeURIComponent(r.userId)}" style="color:${T.text};text-decoration:none;">${esc(r.name)}</a></td>
          <td style="color:${T.textSecondary};">${esc(r.email)}</td>
          <td>${fmtTime(r.since)}</td>
          <td>${fmt(r.cash)}</td>
          <td>${fmt(r.shortValue)}</td>
          <td style="color:${T.red};font-weight:600;">${fmt(shortfall)}</td>
        </tr>`;
    })
    .join("");

  const body = `
    <h1>Margin Calls <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${rows.length} active</span></h1>
    <p style="color:${T.textSecondary};font-size:13px;margin:-8px 0 20px;">
      Accounts whose cash can't currently cover their open shorts at market price. Cleared automatically once the manager sells a holding or covers a short and cash recovers — no action needed unless one has been open a long time with nothing left to sell.
    </p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Manager</th><th>Email</th><th>Since</th><th>Cash</th><th>Short Value</th><th>Shortfall</th></tr></thead>
        <tbody>${tableRows || `<tr><td colspan="6" class="empty">No accounts currently in margin call.</td></tr>`}</tbody>
      </table>
    </div>

    <script>
      document.querySelectorAll(".local-time").forEach(function (el) {
        var ms = parseInt(el.getAttribute("data-ts"), 10);
        if (!isNaN(ms)) {
          el.textContent = new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
        }
      });
    </script>
  `;
  return renderAdminShell({ active: "margin-calls", title: "Margin Calls", bodyHtml: body });
}
