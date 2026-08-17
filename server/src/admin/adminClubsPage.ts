import { renderAdminShell, esc, T } from "./adminShell";

const WARNING = "#F0A202";

export interface AdminClubRow {
  id: string;
  name: string;
  code: string;
  startingPrice: number;
  currentPrice: number;
  pctChange: number;
  ownershipPct: number;
  netDemand: "buying" | "selling" | "flat";
  form: ("W" | "D" | "L")[];
  pricePressure: number | null; // -100..100, or null when not yet eligible
  divergence: "ALIGNED" | "DIVERGENCE" | null; // null when not eligible for the check
}

function fmt(n: number): string {
  return "$" + n.toFixed(2);
}

/** Green up / red down, or nothing when there's no direction to report (flat). */
function arrow(direction: "up" | "down" | "flat"): string {
  if (direction === "flat") return "";
  const color = direction === "up" ? T.accent : T.red;
  return ` <span style="color:${color};">${direction === "up" ? "▲" : "▼"}</span>`;
}

/** Same idea as arrow(), but Price Pressure always shows a glyph (▲/▼/→) rather than omitting it when flat — a score genuinely near 0 still means something (section 25/26). */
function ppsGlyph(score: number | null): string {
  if (score == null) return `<span style="color:${T.textSecondary};">—</span>`;
  const color = score > 20 ? T.accent : score < -20 ? T.red : T.textSecondary;
  const glyph = score > 20 ? "▲" : score < -20 ? "▼" : "→";
  const sign = score > 0 ? "+" : "";
  return `<span style="color:${color};font-weight:600;">${sign}${score} ${glyph}</span>`;
}

const FORM_COLOR: Record<"W" | "D" | "L", string> = { W: T.accent, D: T.textSecondary, L: T.red };

function formBadges(form: ("W" | "D" | "L")[]): string {
  if (form.length === 0) return "";
  return (
    ` <span style="display:inline-flex;gap:3px;vertical-align:middle;">` +
    form
      .map((r) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:4px;background:${FORM_COLOR[r]}22;color:${FORM_COLOR[r]};font-size:10px;font-weight:700;">${r}</span>`)
      .join("") +
    `</span>`
  );
}

export function renderAdminClubsPage(clubs: AdminClubRow[], health: { aligned: number; eligible: number }): string {
  const sorted = clubs.slice().sort((a, b) => b.currentPrice - a.currentPrice);
  const rows = sorted
    .map((c) => {
      const changeCls = c.pctChange > 0 ? "pos" : c.pctChange < 0 ? "neg" : "";
      const changeSign = c.pctChange >= 0 ? "+" : "";
      const changeDir: "up" | "down" | "flat" = c.pctChange > 0 ? "up" : c.pctChange < 0 ? "down" : "flat";
      const demandDir: "up" | "down" | "flat" = c.netDemand === "buying" ? "up" : c.netDemand === "selling" ? "down" : "flat";
      const detailHref = `/admin/clubs/${encodeURIComponent(c.id)}`;
      const divergenceBadge =
        c.divergence === "DIVERGENCE"
          ? ` <span title="Price direction and Price Pressure disagree" style="color:${WARNING};font-size:11px;">⚠</span>`
          : c.divergence === "ALIGNED"
            ? ` <span title="Price direction matches Price Pressure" style="color:${T.accent};font-size:11px;">✓</span>`
            : "";
      return `
        <tr data-name="${esc(c.name)}" data-starting="${c.startingPrice}" data-current="${c.currentPrice}" data-change="${c.pctChange}" data-owned="${c.ownershipPct}" data-pressure="${c.pricePressure ?? ""}">
          <td><a href="${detailHref}" style="color:${T.text};text-decoration:none;">${esc(c.name)}</a> <span style="color:${T.textSecondary};">(${esc(c.code)})</span>${formBadges(c.form)}</td>
          <td>${fmt(c.startingPrice)}</td>
          <td>${fmt(c.currentPrice)}</td>
          <td class="${changeCls}">${changeSign}${c.pctChange.toFixed(1)}%${arrow(changeDir)}</td>
          <td>${c.ownershipPct.toFixed(1)}%${arrow(demandDir)}</td>
          <td><a href="${detailHref}" style="text-decoration:none;">${ppsGlyph(c.pricePressure)}</a>${divergenceBadge}</td>
        </tr>`;
    })
    .join("");

  const cols: { key: string; label: string }[] = [
    { key: "name", label: "Club" },
    { key: "starting", label: "Starting Value" },
    { key: "current", label: "Current Value" },
    { key: "change", label: "% Change" },
    { key: "owned", label: "% Owned" },
    { key: "pressure", label: "Price Pressure" },
  ];
  const headers = cols.map((c) => `<th data-sort-key="${c.key}" style="text-align:center;cursor:pointer;user-select:none;">${esc(c.label)} <span class="sort-caret"></span></th>`).join("");

  const healthPct = health.eligible > 0 ? Math.round((health.aligned / health.eligible) * 100) : null;
  const healthColor = healthPct == null ? T.textSecondary : healthPct >= 80 ? T.accent : healthPct >= 50 ? WARNING : T.red;
  const healthBanner = `
    <div style="display:flex;align-items:center;justify-content:space-between;background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 18px;margin-bottom:16px;">
      <span style="font-size:13px;color:${T.textSecondary};">Market Algorithm Health</span>
      <span style="font-size:15px;font-weight:600;color:${healthColor};">
        ${healthPct == null ? "Not enough data yet" : `${healthPct}%`}
        <span style="font-weight:400;color:${T.textSecondary};font-size:12px;">(${health.aligned}/${health.eligible} clubs aligned)</span>
      </span>
    </div>`;

  const body = `
    <h1>Clubs <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${clubs.length}</span></h1>
    ${healthBanner}
    <div class="table-wrap">
      <table id="clubs-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">No clubs yet.</td></tr>`}</tbody>
      </table>
    </div>

    <script>
      (function () {
        var table = document.getElementById("clubs-table");
        var tbody = table.querySelector("tbody");
        var state = { key: null, dir: 1 };

        table.querySelectorAll("th[data-sort-key]").forEach(function (th) {
          th.addEventListener("click", function () {
            var key = th.getAttribute("data-sort-key");
            state.dir = state.key === key ? -state.dir : 1;
            state.key = key;
            table.querySelectorAll(".sort-caret").forEach(function (c) { c.textContent = ""; });
            th.querySelector(".sort-caret").textContent = state.dir === 1 ? " ▲" : " ▼";

            var rows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
            rows.sort(function (a, b) {
              var av = a.getAttribute("data-" + key), bv = b.getAttribute("data-" + key);
              if (key === "name") return state.dir * av.localeCompare(bv);
              return state.dir * ((parseFloat(av) || -Infinity) - (parseFloat(bv) || -Infinity));
            });
            rows.forEach(function (r) { tbody.appendChild(r); });
          });
        });
      })();
    </script>
  `;
  return renderAdminShell({
    active: "clubs",
    title: "Clubs",
    bodyHtml: body,
    headExtra: `#clubs-table td { text-align: center; }`,
  });
}
