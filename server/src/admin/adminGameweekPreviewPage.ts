import { renderAdminShell, esc, T } from "./adminShell";

export interface AdminPreviewRow {
  id: string;
  round: number;
  headline: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  slug: string | null;
  icon: string;
  badge: string;
  background: string;
  color: string;
  generatedAt: number;
  updatedAt: number;
  publishedAt: number | null;
  wordCount: number;
}

export interface AdminGameweekPreviewData {
  recent: AdminPreviewRow[];
  anthropicConfigured: boolean;
}

/** Placeholder filled in client-side, in the viewer's own timezone — see adminClubDetailPage.ts's fmtTime for why this can't be formatted server-side. */
function fmtTime(ms: number): string {
  return `<span class="local-time" data-ts="${ms}"></span>`;
}

/** Renders **bold** and ++green bold++ markers as real tags for the read-only preview — applied to already-escaped text, so it's safe against the raw markers in the escaped string (esc() doesn't touch ** or ++). The edit textarea below keeps the raw markers untouched, since that's what an admin types back. */
function withBoldMarkers(escapedText: string): string {
  return escapedText
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\+\+([^+]+)\+\+/g, `<b style="color:${T.accent};">$1</b>`);
}

/**
 * Icon geometry is real Tabler Icons paths (MIT licensed, tabler.io/icons)
 * — same source as GameweekPreviewArt.tsx in both app and website. This
 * admin picker only decides which of these each article should render;
 * the path data itself is duplicated in three places (here, app, website)
 * by necessity — server-rendered HTML can't share a TS module with RN/React.
 */
const ICON_JS_DATA = `
  const ICONS = {
    football: { label: "Football", paths: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0","M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45","M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45"] },
    trophy: { label: "Trophy", paths: ["M8 21l8 0","M12 17l0 4","M7 4l10 0","M17 4v8a5 5 0 0 1 -10 0v-8","M3 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0","M17 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"] },
    flame: { label: "Flame", paths: ["M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.294 -2.333 5.588c0 3.704 3.134 6.706 7 6.706c3.866 0 7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235"] },
    chartCandle: { label: "Candles", paths: ["M4 7a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3","M6 4l0 2","M6 11l0 9","M10 15a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -3","M12 4l0 10","M12 19l0 1","M16 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -4","M18 4l0 1","M18 11l0 9"] },
    rocket: { label: "Rocket", paths: ["M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3","M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3","M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0"] },
    calendar: { label: "Calendar", paths: ["M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12","M16 3v4","M8 3v4","M4 11h16","M11 15h1","M12 15v3"] },
  };
  const BADGE_PATHS = ["M3 17l6 -6l4 4l8 -8", "M14 7l7 0l0 7"];

  function gwpBgFill(id, background) {
    if (background === "vertical") return '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#12F06F"/><stop offset="100%" stop-color="#00B54F"/></linearGradient>';
    if (background === "radial") return '<radialGradient id="' + id + '" cx="30%" cy="25%" r="85%"><stop offset="0%" stop-color="#3CFF9A"/><stop offset="100%" stop-color="#00A048"/></radialGradient>';
    if (background === "card") return null;
    return '<linearGradient id="' + id + '" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#12F06F"/><stop offset="100%" stop-color="#00B54F"/></linearGradient>';
  }

  function gwpRenderIcon(gradId, icon, badge, background, color) {
    var iconDef = ICONS[icon] || ICONS.football;
    var grad = gwpBgFill(gradId, background);
    var bgRect = background === "card" ? '<rect width="100" height="100" fill="#151718"/>' : '<rect width="100" height="100" fill="url(#' + gradId + ')"/>';
    var strokeColor = color === "white" ? "#FFFFFF" : "#00170c";
    var iconPaths = iconDef.paths.map(function (d) { return '<path d="' + d + '"/>'; }).join("");
    var badgeMarkup = badge === "trending"
      ? '<g transform="translate(69,10)" stroke="' + strokeColor + '" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' + BADGE_PATHS.map(function (d) { return '<path d="' + d + '"/>'; }).join("") + '</g>'
      : "";
    return '<defs>' + (grad || "") + '</defs>' + bgRect +
      '<g transform="translate(19,19) scale(2.6)" stroke="' + strokeColor + '" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">' + iconPaths + '</g>' + badgeMarkup;
  }
`;

const ICON_LABELS: Record<string, string> = { football: "Football", trophy: "Trophy", flame: "Flame", chartCandle: "Candles", rocket: "Rocket", calendar: "Calendar" };
const BADGE_LABELS: Record<string, string> = { none: "No badge", trending: "Trending up" };
const BACKGROUND_LABELS: Record<string, string> = { diagonal: "Diagonal", vertical: "Vertical", radial: "Radial", card: "Flat card" };
const COLOR_LABELS: Record<string, string> = { ink: "Dark ink", white: "White" };

function selectField(fieldName: string, id: string, labels: Record<string, string>, selected: string): string {
  const options = Object.entries(labels)
    .map(([key, label]) => `<option value="${key}" ${key === selected ? "selected" : ""}>${label}</option>`)
    .join("");
  return `<select class="icon-select" data-id="${esc(id)}" data-field="${fieldName}" style="padding:6px 8px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:12.5px;">${options}</select>`;
}

/** Each article's own icon/badge/background/color editor — permanently visible (not toggled behind an Edit click) since it's a small, low-risk control distinct from the copy-edit form. */
function iconEditorSection(p: AdminPreviewRow): string {
  return `
  <div class="icon-editor" data-id="${esc(p.id)}" style="margin-top:12px;padding-top:12px;border-top:1px solid ${T.border};display:flex;gap:14px;align-items:center;flex-wrap:wrap;">
    <svg class="icon-preview-svg" data-id="${esc(p.id)}" viewBox="0 0 100 100" style="width:52px;height:52px;border-radius:12px;flex-shrink:0;"></svg>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;flex:1;min-width:260px;">
      ${selectField("icon", p.id, ICON_LABELS, p.icon)}
      ${selectField("badge", p.id, BADGE_LABELS, p.badge)}
      ${selectField("background", p.id, BACKGROUND_LABELS, p.background)}
      ${selectField("color", p.id, COLOR_LABELS, p.color)}
      <button class="icon-save-btn" data-id="${esc(p.id)}" style="font-size:12px;padding:6px 12px;border-radius:8px;background:${T.accent};color:#00170c;border:none;font-weight:700;cursor:pointer;">Save Icon</button>
      <span class="icon-save-status" data-id="${esc(p.id)}" style="font-size:11px;color:${T.textSecondary};"></span>
    </div>
  </div>`;
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

  const permalink = p.status === "PUBLISHED" && p.slug ? `<div style="font-size:11.5px;color:${T.textSecondary};margin-top:4px;">Permalink: <code style="color:${T.text};">/gameweek-preview/${esc(p.slug)}</code></div>` : "";

  return `
  <div class="preview-card" data-id="${esc(p.id)}" style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px 18px;margin-bottom:12px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
      <div style="font-size:12px;color:${T.textSecondary};">Round ${p.round} · <b style="color:${statusColor};">${esc(p.status)}</b> · ${p.wordCount} words · generated ${fmtTime(p.generatedAt)}${p.publishedAt ? ` · published ${fmtTime(p.publishedAt)}` : ""}</div>
    </div>
    ${permalink}
    <div class="display-copy">
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;margin-top:8px;">${withBoldMarkers(esc(p.headline))}</div>
      <div style="font-size:13px;color:${T.text};line-height:1.6;white-space:pre-wrap;max-height:220px;overflow-y:auto;padding:10px;background:${T.bg};border-radius:8px;">${withBoldMarkers(esc(p.body))}</div>
    </div>
    <form class="edit-form" data-id="${esc(p.id)}" style="display:none;margin-top:10px;">
      <input type="text" name="headline" value="${esc(p.headline)}" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
      <textarea name="body" rows="12" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;font-family:inherit;">${esc(p.body)}</textarea>
      <div style="font-size:11px;color:${T.textSecondary};margin-bottom:8px;">**bold** for bold &nbsp;·&nbsp; ++green bold++ for green bold (headlines)</div>
      <button type="submit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:${T.accent};color:#00170c;border:none;font-weight:700;cursor:pointer;">Save</button>
      <button type="button" class="cancel-edit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:transparent;color:${T.textSecondary};border:1px solid ${T.border};cursor:pointer;">Cancel</button>
    </form>
    <div style="margin-top:12px;">${actions.join("")}</div>
    ${iconEditorSection(p)}
  </div>`;
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
    <p style="color:${T.textSecondary};font-size:13px;margin:-12px 0 20px;">Weekly long-form column — real match data + odds/projections, real AI-generated copy, admin review before it goes live. Each article has its own SEO permalink and its own thumbnail icon.</p>
    ${configWarning}
    <button id="generate-btn" style="padding:9px 20px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:20px;">Generate next preview</button>
    <span id="generate-status" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
    ${cards}

    <script>
      ${ICON_JS_DATA}
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

        function renderIconEditor(editor) {
          var id = editor.getAttribute("data-id");
          var icon = editor.querySelector('[data-field="icon"]').value;
          var badge = editor.querySelector('[data-field="badge"]').value;
          var background = editor.querySelector('[data-field="background"]').value;
          var color = editor.querySelector('[data-field="color"]').value;
          var svg = editor.querySelector(".icon-preview-svg");
          svg.innerHTML = gwpRenderIcon("gwpIconGrad-" + id, icon, badge, background, color);
        }
        document.querySelectorAll(".icon-editor").forEach(function (editor) {
          editor.querySelectorAll(".icon-select").forEach(function (sel) {
            sel.addEventListener("change", function () { renderIconEditor(editor); });
          });
          renderIconEditor(editor);
        });
        document.querySelectorAll(".icon-save-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id");
            var editor = btn.closest(".icon-editor");
            var payload = {
              icon: editor.querySelector('[data-field="icon"]').value,
              badge: editor.querySelector('[data-field="badge"]').value,
              background: editor.querySelector('[data-field="background"]').value,
              color: editor.querySelector('[data-field="color"]').value,
            };
            var status = editor.querySelector(".icon-save-status");
            btn.disabled = true;
            status.textContent = "Saving...";
            fetch("/admin/gameweek-preview/" + encodeURIComponent(id) + "/icon", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
              .then(function (r) { return r.json(); })
              .then(function (d) { btn.disabled = false; status.textContent = d.ok ? "Saved." : "Failed: " + (d.error || "unknown"); })
              .catch(function () { btn.disabled = false; status.textContent = "Request failed."; });
          });
        });
      })();
    </script>
  `;
  return renderAdminShell({ active: "gameweek-preview", title: "Gameweek Preview", bodyHtml: body });
}
