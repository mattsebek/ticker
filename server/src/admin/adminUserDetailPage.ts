import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminUserLedgerRow {
  entryType: "BUY" | "SELL" | "SHORT" | "COVER" | "SEED";
  clubName: string | null;
  amount: number;
  cashDelta: number;
  balanceAfter: number;
  createdAt: number;
  /** Realized profit/loss for this sale/cover (sell/cover proceeds minus the matching entry price) — null for BUY/SHORT/SEED rows, and for a SELL/COVER with no matching entry in the ledger (e.g. a pre-ledger seeded holding). */
  pnl: number | null;
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
  /** Sum of every SELL's and COVER's realized P&L — unrealized gains/losses on still-open positions aren't included. Don't read this in isolation as "overall performance" — pair it with unrealizedPnl, which is usually the larger of the two for an active account. */
  realizedPnl: number;
  /** Gain/loss still sitting in currently-open long holdings and short positions, marked to current price. Sums with realizedPnl to the account's real total return. */
  unrealizedPnl: number;
  ledger: AdminUserLedgerRow[]; // newest first
  /** Null when the account isn't currently in margin call. */
  marginCall: { since: number; shortfall: number } | null;
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

// Opening a position (BUY, SHORT) reads red; closing one (SELL, COVER) reads
// green — the same convention regardless of which direction the position was.
function typeBadge(entryType: AdminUserLedgerRow["entryType"]): string {
  const color = entryType === "BUY" || entryType === "SHORT" ? T.red : entryType === "SELL" || entryType === "COVER" ? T.accent : T.textSecondary;
  return `<span style="color:${color};font-weight:600;">${entryType}</span>`;
}

function pnlCell(pnl: number | null): string {
  if (pnl == null) return `<td>—</td>`;
  const color = pnl > 0 ? T.accent : pnl < 0 ? T.red : T.textSecondary;
  const sign = pnl >= 0 ? "+" : "";
  return `<td style="color:${color};font-weight:600;">${sign}${fmt(pnl)}</td>`;
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
      ${pnlCell(row.pnl)}
    </tr>`;
}

export function renderAdminUserDetailPage(d: AdminUserDetail): string {
  const rows = d.ledger.map(ledgerRow).join("");
  const buyCount = d.ledger.filter((r) => r.entryType === "BUY").length;
  const sellCount = d.ledger.filter((r) => r.entryType === "SELL").length;
  const totalReturn = d.realizedPnl + d.unrealizedPnl;

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
      ${statCard("Realized P&L", `${d.realizedPnl >= 0 ? "+" : ""}${fmt(d.realizedPnl)}`, d.realizedPnl > 0 ? T.accent : d.realizedPnl < 0 ? T.red : T.textSecondary)}
      ${statCard("Unrealized P&L", `${d.unrealizedPnl >= 0 ? "+" : ""}${fmt(d.unrealizedPnl)}`, d.unrealizedPnl > 0 ? T.accent : d.unrealizedPnl < 0 ? T.red : T.textSecondary)}
      ${d.marginCall ? statCard("Margin Call", `Active — short ${fmt(d.marginCall.shortfall)}`, T.red) : statCard("Margin Call", "None", T.textSecondary)}
    </div>
    <p style="color:${T.textSecondary};font-size:12px;margin:-16px 0 20px;">
      Realized + Unrealized = ${totalReturn >= 0 ? "+" : ""}${fmt(totalReturn)} total return — Realized alone only reflects closed trades, not gains still sitting in current holdings.
    </p>

    <h1 style="font-size:16px;">Transaction Activity</h1>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Club</th><th>Amount</th><th>Cash Δ</th><th>Balance After</th><th>P&amp;L</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No transactions yet.</td></tr>`}</tbody>
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
