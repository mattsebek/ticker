import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminClubRow {
  name: string;
  code: string;
  startingPrice: number;
  currentPrice: number;
  pctChange: number;
  ownershipPct: number;
  netDemand: "buying" | "selling" | "flat";
  form: ("W" | "D" | "L")[];
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

export function renderAdminClubsPage(clubs: AdminClubRow[]): string {
  const sorted = clubs.slice().sort((a, b) => b.currentPrice - a.currentPrice);
  const rows = sorted
    .map((c) => {
      const changeCls = c.pctChange > 0 ? "pos" : c.pctChange < 0 ? "neg" : "";
      const changeSign = c.pctChange >= 0 ? "+" : "";
      const changeDir: "up" | "down" | "flat" = c.pctChange > 0 ? "up" : c.pctChange < 0 ? "down" : "flat";
      const demandDir: "up" | "down" | "flat" = c.netDemand === "buying" ? "up" : c.netDemand === "selling" ? "down" : "flat";
      return `
        <tr data-name="${esc(c.name)}" data-starting="${c.startingPrice}" data-current="${c.currentPrice}" data-change="${c.pctChange}" data-owned="${c.ownershipPct}">
          <td>${esc(c.name)} <span style="color:${T.textSecondary};">(${esc(c.code)})</span>${formBadges(c.form)}</td>
          <td>${fmt(c.startingPrice)}</td>
          <td>${fmt(c.currentPrice)}</td>
          <td class="${changeCls}">${changeSign}${c.pctChange.toFixed(1)}%${arrow(changeDir)}</td>
          <td>${c.ownershipPct.toFixed(1)}%${arrow(demandDir)}</td>
        </tr>`;
    })
    .join("");

  const cols: { key: string; label: string }[] = [
    { key: "name", label: "Club" },
    { key: "starting", label: "Starting Value" },
    { key: "current", label: "Current Value" },
    { key: "change", label: "% Change" },
    { key: "owned", label: "% Owned" },
  ];
  const headers = cols.map((c) => `<th data-sort-key="${c.key}" style="text-align:center;cursor:pointer;user-select:none;">${esc(c.label)} <span class="sort-caret"></span></th>`).join("");

  const body = `
    <h1>Clubs <span style="color:${T.textSecondary};font-weight:400;font-size:13px;">${clubs.length}</span></h1>
    <div class="table-wrap">
      <table id="clubs-table">
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows || `<tr><td colspan="5" class="empty">No clubs yet.</td></tr>`}</tbody>
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
              return state.dir * (parseFloat(av) - parseFloat(bv));
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
