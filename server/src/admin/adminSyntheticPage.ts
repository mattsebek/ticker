import { renderAdminShell, esc, T } from "./adminShell";
import { SyntheticSystemConfig, SyntheticStatus, StrategyType } from "../synthetic/syntheticRepo";

export interface AdminSyntheticUserRow {
  id: string;
  name: string;
  strategyType: StrategyType;
  activityLevel: string;
  status: SyntheticStatus;
  favoriteClubName: string | null;
  nextActivityAt: number;
}

export interface AdminSyntheticData {
  accountCounts: Record<string, number>;
  statusCounts: Record<SyntheticStatus, number>;
  actionsLast24h: Record<string, number>;
  config: SyntheticSystemConfig;
  users: AdminSyntheticUserRow[];
  totalProfiles: number;
}

function statCard(label: string, value: string | number): string {
  return `<div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 16px;">
    <div style="font-size:11px;color:${T.textSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">${esc(label)}</div>
    <div style="font-size:20px;font-weight:600;">${value}</div>
  </div>`;
}

function toggleField(name: string, label: string, checked: boolean): string {
  return `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;">
    <input type="checkbox" name="${name}" ${checked ? "checked" : ""} /> ${esc(label)}
  </label>`;
}

function numberField(name: string, label: string, value: number, step = "1"): string {
  return `<label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">${esc(label)}</label>
    <input type="number" step="${step}" name="${name}" value="${value}" style="
      width:100%;padding:8px 10px;margin-bottom:14px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;
    " />`;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function renderAdminSyntheticPage(d: AdminSyntheticData): string {
  const summary = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:24px;">
      ${statCard("Human accounts", d.accountCounts.human ?? 0)}
      ${statCard("Synthetic accounts", d.accountCounts.synthetic ?? 0)}
      ${statCard("Active", d.statusCounts.active)}
      ${statCard("Paused", d.statusCounts.paused)}
      ${statCard("Retired", d.statusCounts.retired)}
    </div>`;

  const actionRows = Object.entries(d.actionsLast24h)
    .map(([type, n]) => `<div>${esc(type)}: <b>${n}</b></div>`)
    .join("");

  const configForm = `
    <form id="config-form" style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:18px;margin-bottom:24px;max-width:520px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <h2 style="margin:0;font-size:15px;">System Configuration</h2>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;">
          <input type="checkbox" name="enabled" ${d.config.enabled ? "checked" : ""} /> Enabled (global kill switch)
        </label>
      </div>
      ${numberField("targetActiveUsers", "Target active users", d.config.targetActiveUsers)}
      ${numberField("activityMultiplier", "Activity multiplier", d.config.activityMultiplier, "0.05")}
      ${numberField("maxSyntheticPercentagePerPublicLeague", "Max synthetic % per public league", d.config.maxSyntheticPercentagePerPublicLeague, "0.05")}
      ${numberField("minimumPublicLeaguePopulation", "Minimum public league population", d.config.minimumPublicLeaguePopulation)}
      ${toggleField("autoCreateUsersEnabled", "Auto-create users", d.config.autoCreateUsersEnabled)}
      ${toggleField("autoJoinLeaguesEnabled", "Auto-join leagues", d.config.autoJoinLeaguesEnabled)}
      ${toggleField("tradingEnabled", "Trading enabled", d.config.tradingEnabled)}
      ${toggleField("lineupUpdatesEnabled", "Lineup updates enabled", d.config.lineupUpdatesEnabled)}
      <button type="submit" style="margin-top:8px;padding:10px 20px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;">Save</button>
      <span id="config-status" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
    </form>`;

  const rows = d.users
    .map(
      (u) => `
      <tr data-id="${esc(u.id)}">
        <td>${esc(u.name)}</td>
        <td>${esc(u.strategyType)}</td>
        <td>${esc(u.activityLevel)}</td>
        <td>${esc(u.status)}</td>
        <td>${u.favoriteClubName ? esc(u.favoriteClubName) : "—"}</td>
        <td>${fmtTime(u.nextActivityAt)}</td>
        <td style="white-space:nowrap;">
          <button class="act-btn" data-action="pause" data-id="${esc(u.id)}" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid ${T.border};background:transparent;color:${T.text};cursor:pointer;">Pause</button>
          <button class="act-btn" data-action="resume" data-id="${esc(u.id)}" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid ${T.border};background:transparent;color:${T.text};cursor:pointer;">Resume</button>
          <button class="act-btn" data-action="retire" data-id="${esc(u.id)}" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid ${T.red};background:transparent;color:${T.red};cursor:pointer;">Retire</button>
          <button class="act-btn" data-action="force" data-id="${esc(u.id)}" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid ${T.accent};background:transparent;color:${T.accent};cursor:pointer;">Force Evaluate</button>
        </td>
      </tr>`
    )
    .join("");

  const body = `
    <h1>Synthetic Ecosystem</h1>
    ${summary}
    <div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:14px 18px;margin-bottom:24px;font-size:12px;color:${T.textSecondary};">
      <div style="margin-bottom:6px;color:${T.text};font-weight:600;">Actions, last 24h</div>
      ${actionRows || "No activity logged yet."}
    </div>
    ${configForm}
    <h2 style="font-size:15px;">Synthetic Users <span style="color:${T.textSecondary};font-weight:400;">(showing ${d.users.length} of ${d.totalProfiles}, soonest due first)</span></h2>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Strategy</th><th>Activity</th><th>Status</th><th>Favorite Club</th><th>Next Activity</th><th>Actions</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" class="empty">No synthetic users yet.</td></tr>`}</tbody>
      </table>
    </div>

    <script>
      (function () {
        var form = document.getElementById("config-form");
        var status = document.getElementById("config-status");
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var fd = new FormData(form);
          var body = {};
          form.querySelectorAll("input[type=number]").forEach(function (el) { body[el.name] = parseFloat(el.value); });
          form.querySelectorAll("input[type=checkbox]").forEach(function (el) { body[el.name] = el.checked; });
          status.textContent = "Saving...";
          fetch("/admin/synthetic/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            .then(function (r) { return r.json(); })
            .then(function (d) { status.textContent = d.ok ? "Saved." : "Failed: " + (d.error || "unknown"); })
            .catch(function () { status.textContent = "Failed to save."; });
        });

        document.querySelectorAll(".act-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id"), action = btn.getAttribute("data-action");
            btn.disabled = true;
            fetch("/admin/synthetic/users/" + encodeURIComponent(id) + "/" + action, { method: "POST" })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                btn.disabled = false;
                if (!d.ok) { alert("Failed: " + (d.error || "unknown")); return; }
                if (action === "pause" || action === "resume" || action === "retire") location.reload();
                else alert("Evaluated: " + JSON.stringify(d.result || d));
              })
              .catch(function () { btn.disabled = false; alert("Request failed."); });
          });
        });
      })();
    </script>
  `;
  return renderAdminShell({ active: "synthetic", title: "Synthetic Ecosystem", bodyHtml: body });
}
