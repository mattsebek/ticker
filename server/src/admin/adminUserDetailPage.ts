import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminUserLedgerRow {
  entryType: "BUY" | "SELL" | "SEED";
  clubName: string | null;
  amount: number;
  cashDelta: number;
  balanceAfter: number;
  createdAt: number;
}

export interface AdminUserDetail {
  id: string;
  name: string;
  email: string;
  accountType: string;
  birthday: string;
  createdAt: number;
  cash: number;
  holdingsCount: number;
  ledger: AdminUserLedgerRow[]; // newest first
}

function fmt(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Same viewer-local-timezone placeholder pattern as adminClubDetailPage.ts's fmtTime — a server-rendered toLocaleString() would format in the Node process's own timezone (UTC on Railway), not the admin's. */
function fmtTime(ms: number): string {
  return `<span class="local-time" data-ts="${ms}"></span>`;
}

function statCard(label: string, value: string, color?: string): string {
  return `<div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 16px;">
    <div style="font-size:11px;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${esc(label)}</div>
    <div style="font-size:18px;font-weight:600;color:${color ?? T.text};">${value}</div>
  </div>`;
}

function typeBadge(entryType: AdminUserLedgerRow["entryType"]): string {
  const color = entryType === "BUY" ? T.red : entryType === "SELL" ? T.accent : T.textSecondary;
  return `<span style="color:${color};font-weight:600;">${entryType}</span>`;
}

function ledgerRow(row: AdminUserLedgerRow): string {
  return `
    <tr>
      <td>${fmtTime(row.createdAt)}</td>
      <td>${typeBadge(row.entryType)}</td>
      <td>${row.clubName ? esc(row.clubName) : "—"}</td>
      <td>${row.entryType === "SEED" ? "—" : fmt(row.amount)}</td>
      <td style="color:${row.cashDelta >= 0 ? T.accent : T.red};">${row.cashDelta >= 0 ? "+" : ""}${fmt(row.cashDelta)}</td>
      <td>${fmt(row.balanceAfter)}</td>
    </tr>`;
}

export function renderAdminUserDetailPage(d: AdminUserDetail): string {
  const rows = d.ledger.map(ledgerRow).join("");
  const buyCount = d.ledger.filter((r) => r.entryType === "BUY").length;
  const sellCount = d.ledger.filter((r) => r.entryType === "SELL").length;

  const body = `
    <p style="margin: 0 0 16px;"><a href="/admin/users">&larr; Users</a></p>
    <h1>${esc(d.name)}</h1>
    <p style="color:${T.textSecondary};font-size:13px;margin:-12px 0 20px;">
      ${esc(d.email)} &middot; ${esc(d.accountType)} &middot; Joined ${fmtTime(d.createdAt)}
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px;">
      ${statCard("Cash", fmt(d.cash))}
      ${statCard("Holdings", String(d.holdingsCount))}
      ${statCard("Buys", String(buyCount))}
      ${statCard("Sells", String(sellCount))}
    </div>

    <h1 style="font-size:16px;">Transaction Activity</h1>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Club</th><th>Amount</th><th>Cash Δ</th><th>Balance After</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">No transactions yet.</td></tr>`}</tbody>
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
  return renderAdminShell({ active: "users", title: d.name, bodyHtml: body });
}
