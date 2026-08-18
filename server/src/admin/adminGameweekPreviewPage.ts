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

export interface AdminGameweekPreviewData {
  recent: AdminPreviewRow[];
  anthropicConfigured: boolean;
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
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
      <div style="font-size:16px;font-weight:700;margin-bottom:8px;">${esc(p.headline)}</div>
      <div style="font-size:13px;color:${T.text};line-height:1.6;white-space:pre-wrap;max-height:220px;overflow-y:auto;padding:10px;background:${T.bg};border-radius:8px;">${esc(p.body)}</div>
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
    <button id="generate-btn" style="padding:9px 20px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;margin-bottom:20px;">Generate next preview</button>
    <span id="generate-status" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
    ${cards}

    <script>
      (function () {
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
