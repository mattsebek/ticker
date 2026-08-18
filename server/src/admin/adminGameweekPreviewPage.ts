import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminPreviewRow {
  id: string;
  round: number;
  headline: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  generatedAt: number;
  updatedAt: number;
  publishedAt: number | null;
  wordCount: number;
}

export interface AdminIconConfig {
  icon: string;
  badge: string;
  background: string;
  color: string;
}

export interface AdminGameweekPreviewData {
  recent: AdminPreviewRow[];
  anthropicConfigured: boolean;
  iconConfig: AdminIconConfig;
}

/** Placeholder filled in client-side, in the viewer's own timezone — see adminClubDetailPage.ts's fmtTime for why this can't be formatted server-side. */
function fmtTime(ms: number): string {
  return `<span class="local-time" data-ts="${ms}"></span>`;
}

/** Renders **bold** markers as real <b> tags for the read-only preview — applied to already-escaped text, so it's safe against the raw ** in the escaped string (esc() doesn't touch asterisks). The edit textarea below keeps the raw markers untouched, since that's what an admin types back. */
function withBoldMarkers(escapedText: string): string {
  return escapedText.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}

function previewCard(p: AdminPreviewRow, isLatest: boolean): string {
  const statusColor = p.status === "PUBLISHED" ? T.accent : T.textSecondary;
  const actions: string[] = [];
  if (p.status === "DRAFT") {
    actions.push(`<button class="act-btn" data-action="publish" data-id="${esc(p.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;margin-right:6px;background:${T.accent};color:#00170c;border:none;font-weight:700;">Publish</button>`);
    if (isLatest) actions.push(`<button class="regen-btn" data-id="${esc(p.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;margin-right:6px;background:transparent;color:${T.text};border:1px solid ${T.border};font-weight:500;">Regenerate</button>`);
  } else {
    actions.push(`<button class="act-btn" data-action="unpublish" data-id="${esc(p.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;margin-right:6px;background:transparent;color:${T.red};border:1px solid ${T.red};font-weight:500;">Retract</button>`);
  }
  actions.push(`<button class="edit-btn" data-id="${esc(p.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;background:transparent;color:${T.text};border:1px solid ${T.border};font-weight:500;">Edit</button>`);

  return `
  <div class="preview-card" data-id="${esc(p.id)}" style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px 18px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
      <div style="font-size:12px;color:${T.textSecondary};">Round ${p.round} · <b style="color:${statusColor};">${esc(p.status)}</b> · ${p.wordCount} words · generated ${fmtTime(p.generatedAt)}${p.publishedAt ? ` · published ${fmtTime(p.publishedAt)}` : ""}</div>
    </div>
    <div class="display-copy">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${withBoldMarkers(esc(p.headline))}</div>
      <div style="font-size:13px;color:${T.text};line-height:1.6;white-space:pre-wrap;max-height:220px;overflow-y:auto;padding:10px;background:${T.bg};border-radius:8px;">${withBoldMarkers(esc(p.body))}</div>
    </div>
    <form class="edit-form" data-id="${esc(p.id)}" style="display:none;margin-top:10px;">
      <input type="text" name="headline" value="${esc(p.headline)}" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
      <textarea name="body" rows="12" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;font-family:inherit;">${esc(p.body)}</textarea>
      <button type="submit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:${T.accent};color:#00170c;border:none;font-weight:700;cursor:pointer;">Save</button>
      <button type="button" class="cancel-edit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:transparent;color:${T.textSecondary};border:1px solid ${T.border};cursor:pointer;">Cancel</button>
    </form>
    <div style="margin-top:12px;">${actions.join("")}</div>
  </div>`;
}

/**
 * Icon geometry is real Tabler Icons paths (MIT licensed, tabler.io/icons)
 * — same source as GameweekPreviewArt.tsx in both app and website. This
 * admin picker only decides which of these the clients should render; the
 * path data itself is duplicated in three places (here, app, website) by
 * necessity — server-rendered HTML can't share a TS module with RN/React.
 */
const ICON_JS_DATA = `
  const ICONS = {
    football: { label: "Football", paths: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45","M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45"] },
    trophy: { label: "Trophy", paths: ["M8 21l8 0","M12 17l0 4","M7 4l10 0","M17 4v8a5 5 0 0 1 -10 0v-8","M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"] },
    flame: { label: "Flame", paths: ["M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"] },
    chartCandle: { label: "Candles", paths: ["M4 7a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3","M6 4l0 2","M6 11l0 9","M10 15a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3","M12 4l0 10","M12 19l0 1","M16 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -4","M18 4l0 1","M18 11l0 9"] },
    rocket: { label: "Rocket", paths: ["M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3","M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3","M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"] },
  };
  const BADGE_PATHS = ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"];
`;

function iconPickerSection(config: AdminIconConfig): string {
  const iconLabels: Record<string, string> = { football: "Football", trophy: "Trophy", flame: "Flame", chartCandle: "Candles", rocket: "Rocket" };
  const iconButtons = Object.keys(iconLabels)
    .map(
      (key) => `<div class="icon-opt" data-icon="${key}" style="background:${T.elevated};border:1.5px solid ${T.border};border-radius:10px;padding:10px 4px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;stroke:${T.textSecondary};"></svg><span style="font-size:9.5px;color:${T.textSecondary};">${iconLabels[key]}</span></div>`
    )
    .join("");

  const pillRow = (rowId: string, options: { key: string; label: string }[]) =>
    `<div class="pill-row" id="${rowId}" style="display:flex;gap:8px;flex-wrap:wrap;">${options
      .map(
        (o) =>
          `<div class="opt-pill" data-value="${o.key}" style="background:${T.elevated};border:1.5px solid ${T.border};border-radius:100px;padding:7px 13px;font-size:12.5px;font-weight:500;color:${T.textSecondary};cursor:pointer;">${o.label}</div>`
      )
      .join("")}</div>`;

  return `
  <div style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:18px 20px;margin-bottom:24px;">
    <h2 style="font-size:14px;margin:0 0 4px;">Thumbnail Icon</h2>
    <p style="color:${T.textSecondary};font-size:12.5px;margin:0 0 16px;">Shared across every preview — the Portfolio card, Market News, and the article hero. Real icons from Tabler Icons (MIT licensed).</p>
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div style="flex-shrink:0;">
        <svg id="iconShowcase" viewBox="0 0 100 100" style="width:96px;height:96px;border-radius:20px;"></svg>
      </div>
      <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:14px;">
        <div>
          <div style="font-size:11px;color:${T.textSecondary};margin-bottom:8px;">Icon</div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-width:340px;">${iconButtons}</div>
        </div>
        <div>
          <div style="font-size:11px;color:${T.textSecondary};margin-bottom:8px;">Badge</div>
          ${pillRow("badgeRow", [
            { key: "none", label: "None" },
            { key: "trending", label: "Trending up" },
          ])}
        </div>
        <div>
          <div style="font-size:11px;color:${T.textSecondary};margin-bottom:8px;">Background</div>
          ${pillRow("bgRow", [
            { key: "diagonal", label: "Diagonal" },
            { key: "vertical", label: "Vertical" },
            { key: "radial", label: "Radial" },
            { key: "card", label: "Flat card" },
          ])}
        </div>
        <div>
          <div style="font-size:11px;color:${T.textSecondary};margin-bottom:8px;">Icon color</div>
          ${pillRow("colorRow", [
            { key: "ink", label: "Dark ink" },
            { key: "white", label: "White" },
          ])}
        </div>
        <div>
          <button id="iconSaveBtn" style="padding:9px 20px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;">Save</button>
          <span id="iconSaveStatus" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
        </div>
      </div>
    </div>
  </div>
  <script>
    ${ICON_JS_DATA}
    (function () {
      var state = { icon: ${JSON.stringify(config.icon)}, badge: ${JSON.stringify(config.badge)}, background: ${JSON.stringify(config.background)}, color: ${JSON.stringify(config.color)} };

      function bgFill(id) {
        if (state.background === "vertical") return '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#12F06F"/><stop offset="100%" stop-color="#00B54F"/></linearGradient>';
        if (state.background === "radial") return '<radialGradient id="' + id + '" cx="30%" cy="25%" r="85%"><stop offset="0%" stop-color="#3CFF9A"/><stop offset="100%" stop-color="#00A048"/></radialGradient>';
        if (state.background === "card") return null;
        return '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#12F06F"/><stop offset="100%" stop-color="#00B54F"/></linearGradient>';
      }

      function renderMarkup() {
        var icon = ICONS[state.icon];
        var grad = bgFill("gwpAdminBg");
        var bgRect = state.background === "card" ? '<rect width="100" height="100" fill="#151718"/>' : '<rect width="100" height="100" fill="url(#gwpAdminBg)"/>';
        var strokeColor = state.color === "white" ? "#FFFFFF" : "#00170c";
        var iconPaths = icon.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
        var badge = state.badge === "trending"
          ? '<g transform="translate(69,10)" stroke="' + strokeColor + '" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' + BADGE_PATHS.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + '</g>'
          : "";
        return '<defs>' + (grad || "") + '</defs>' + bgRect +
          '<g transform="translate(19,19) scale(2.6)" stroke="' + strokeColor + '" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' + iconPaths + '</g>' + badge;
      }

      function renderAll() {
        document.getElementById("iconShowcase").innerHTML = renderMarkup();
        document.querySelectorAll(".icon-opt").forEach(function (el) {
          var active = el.getAttribute("data-icon") === state.icon;
          el.style.borderColor = active ? "${T.accent}" : "${T.border}";
          el.style.background = active ? "rgba(0,200,5,0.08)" : "${T.elevated}";
          var svg = el.querySelector("svg");
          svg.innerHTML = ICONS[el.getAttribute("data-icon")].paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
          svg.style.stroke = active ? "${T.accent}" : "${T.textSecondary}";
        });
        [["badgeRow", state.badge], ["bgRow", state.background], ["colorRow", state.color]].forEach(function (pair) {
          document.querySelectorAll("#" + pair[0] + " .opt-pill").forEach(function (el) {
            var active = el.getAttribute("data-value") === pair[1];
            el.style.borderColor = active ? "${T.accent}" : "${T.border}";
            el.style.color = active ? "${T.text}" : "${T.textSecondary}";
            el.style.background = active ? "rgba(0,200,5,0.08)" : "${T.elevated}";
          });
        });
      }

      document.querySelectorAll(".icon-opt").forEach(function (el) {
        el.addEventListener("click", function () { state.icon = el.getAttribute("data-icon"); renderAll(); });
      });
      document.querySelectorAll("#badgeRow .opt-pill").forEach(function (el) {
        el.addEventListener("click", function () { state.badge = el.getAttribute("data-value"); renderAll(); });
      });
      document.querySelectorAll("#bgRow .opt-pill").forEach(function (el) {
        el.addEventListener("click", function () { state.background = el.getAttribute("data-value"); renderAll(); });
      });
      document.querySelectorAll("#colorRow .opt-pill").forEach(function (el) {
        el.addEventListener("click", function () { state.color = el.getAttribute("data-value"); renderAll(); });
      });
      document.getElementById("iconSaveBtn").addEventListener("click", function () {
        var btn = this, status = document.getElementById("iconSaveStatus");
        btn.disabled = true;
        status.textContent = "Saving...";
        fetch("/admin/gameweek-preview/icon", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state) })
          .then(function (r) { return r.json(); })
          .then(function (d) { btn.disabled = false; status.textContent = d.ok ? "Saved." : "Failed: " + (d.error || "unknown"); })
          .catch(function () { btn.disabled = false; status.textContent = "Request failed."; });
      });

      renderAll();
    })();
  </script>`;
}

export function renderAdminGameweekPreviewPage(d: AdminGameweekPreviewData): string {
  const configWarning = d.anthropicConfigured
    ? ""
    : `<div style="background:${T.card};border:1px solid ${T.red};border-radius:12px;padding:14px 16px;margin-bottom:16px;color:${T.red};font-size:13px;">ANTHROPIC_API_KEY isn't configured on this server — Generate will fail until it's set.</div>`;

  const cards = d.recent.length
    ? d.recent.map((p, i) => previewCard(p, i === 0)).join("")
    : `<div style="color:${T.textSecondary};font-size:13px;padding:24px;text-align:center;background:${T.card};border:1px solid ${T.border};border-radius:12px;">Nothing generated yet.</div>`;

  const body = `
    <h1>Gameweek Preview</h1>
    <p style="color:${T.textSecondary};font-size:13px;margin:-12px 0 20px;">Weekly long-form column — real match data + odds/projections, real AI-generated copy, admin review before it goes live.</p>
    ${configWarning}
    ${iconPickerSection(d.iconConfig)}
    <button id="generate-btn" style="padding:9px 20px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:20px;">Generate next preview</button>
    <span id="generate-status" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
    ${cards}

    <script>
      (function () {
        document.querySelectorAll(".local-time").forEach(function (el) {
          var ms = parseInt(el.getAttribute("data-ts"), 10);
          if (!isNaN(ms)) {
            el.textContent = new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
          }
        });
        function post(url) {
          return fetch(url, { method: "POST" }).then(function (r) { return r.json(); });
        }
        document.getElementById("generate-btn").addEventListener("click", function () {
          var btn = this, status = document.getElementById("generate-status");
          btn.disabled = true;
          status.textContent = "Generating — this calls a real model, may take 10-30s...";
          post("/admin/gameweek-preview/generate")
            .then(function (d) {
              if (!d.ok) { status.textContent = "Failed: " + (d.error || "unknown"); btn.disabled = false; return; }
              location.reload();
            })
            .catch(function () { status.textContent = "Request failed."; btn.disabled = false; });
        });
        document.querySelectorAll(".regen-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var status = document.getElementById("generate-status");
            btn.disabled = true;
            status.textContent = "Regenerating...";
            post("/admin/gameweek-preview/generate")
              .then(function (d) {
                if (!d.ok) { status.textContent = "Failed: " + (d.error || "unknown"); btn.disabled = false; return; }
                location.reload();
              })
              .catch(function () { status.textContent = "Request failed."; btn.disabled = false; });
          });
        });
        document.querySelectorAll(".act-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id"), action = btn.getAttribute("data-action");
            btn.disabled = true;
            post("/admin/gameweek-preview/" + encodeURIComponent(id) + "/" + action)
              .then(function (d) {
                if (!d.ok) { btn.disabled = false; alert("Failed: " + (d.error || "unknown")); return; }
                location.reload();
              })
              .catch(function () { btn.disabled = false; alert("Request failed."); });
          });
        });
        document.querySelectorAll(".edit-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var card = btn.closest(".preview-card");
            card.querySelector(".display-copy").style.display = "none";
            card.querySelector(".edit-form").style.display = "block";
          });
        });
        document.querySelectorAll(".cancel-edit").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var card = btn.closest(".preview-card");
            card.querySelector(".display-copy").style.display = "block";
            card.querySelector(".edit-form").style.display = "none";
          });
        });
        document.querySelectorAll(".edit-form").forEach(function (form) {
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            var id = form.getAttribute("data-id");
            var fd = new FormData(form);
            fetch("/admin/gameweek-preview/" + encodeURIComponent(id) + "/edit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ headline: fd.get("headline"), body: fd.get("body") }),
            })
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d.ok) location.reload(); else alert("Failed: " + (d.error || "unknown")); })
              .catch(function () { alert("Request failed."); });
          });
        });
      })();
    </script>
  `;
  return renderAdminShell({ active: "gameweek-preview", title: "Gameweek Preview", bodyHtml: body });
}
