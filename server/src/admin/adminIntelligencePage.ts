import { renderAdminShell, esc, T } from "./adminShell";

export type IntelligenceFilter = "new" | "published" | "pinned" | "dismissed" | "expired";

export interface AdminNuggetRow {
  id: string;
  signalType: string;
  clubId: string | null;
  clubName: string | null;
  interestScore: number;
  category: string;
  emoji: string;
  headline: string;
  body: string;
  isEdited: boolean;
  sourceDataJson: string;
  status: string;
  isPinned: boolean;
  generatedAt: number;
  publishedAt: number | null;
  expiresAt: number | null;
}

export interface AdminIntelligenceData {
  filter: IntelligenceFilter;
  counts: { new: number; published: number; pinned: number; dismissed: number };
  nuggets: AdminNuggetRow[];
  clubs: { id: string; name: string }[];
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function factsTable(sourceDataJson: string): string {
  let facts: Record<string, unknown> = {};
  try {
    facts = JSON.parse(sourceDataJson);
  } catch {
    // MANUAL nuggets store '{}' — nothing to show
  }
  const entries = Object.entries(facts);
  if (entries.length === 0) return "";
  const rows = entries
    .map(([k, v]) => `<div>${esc(k)}: <b style="color:${T.text};">${esc(typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v))}</b></div>`)
    .join("");
  return `<div style="font-size:12px;color:${T.textSecondary};line-height:1.7;margin-top:8px;">${rows}</div>`;
}

const FILTERS: { key: IntelligenceFilter; label: string }[] = [
  { key: "new", label: "New Candidates" },
  { key: "published", label: "Published" },
  { key: "pinned", label: "Pinned" },
  { key: "dismissed", label: "Dismissed" },
  { key: "expired", label: "Expired" },
];

type ButtonVariant = "solid" | "ghost" | "ghostActive" | "danger";

/**
 * One shared button builder — every action button gets exactly one `style`
 * attribute (base pill styling merged with its variant's color/border),
 * never two. The previous version built a base style string and a
 * per-button style string separately and spliced them into the same tag
 * via string replace, which silently produced two `style` attributes on
 * one element — HTML only honors the first, so every button's intended
 * color/border was discarded and everything rendered with generic default
 * styling regardless of variant.
 */
function actionButton(label: string, opts: { className: string; dataAction?: string; id: string; variant: ButtonVariant }): string {
  const variantStyle: Record<ButtonVariant, string> = {
    solid: `background:${T.accent};color:#00170c;border:none;font-weight:700;`,
    ghost: `background:transparent;color:${T.text};border:1px solid ${T.border};font-weight:500;`,
    ghostActive: `background:${T.elevated};color:${T.text};border:1px solid ${T.border};font-weight:500;`,
    danger: `background:transparent;color:${T.red};border:1px solid ${T.red};font-weight:500;`,
  };
  const dataAction = opts.dataAction ? ` data-action="${esc(opts.dataAction)}"` : "";
  return `<button class="${opts.className}"${dataAction} data-id="${esc(opts.id)}" style="font-size:12px;padding:7px 14px;border-radius:100px;cursor:pointer;margin-right:6px;transition:opacity 0.15s;${variantStyle[opts.variant]}">${esc(label)}</button>`;
}

function nuggetCard(n: AdminNuggetRow): string {
  const scoreColor = n.interestScore >= 85 ? T.accent : n.interestScore >= 70 ? T.text : T.textSecondary;
  const actions: string[] = [];
  if (n.status === "CANDIDATE") {
    actions.push(actionButton("Publish", { className: "act-btn", dataAction: "publish", id: n.id, variant: "solid" }));
    if (n.signalType !== "MANUAL") {
      actions.push(actionButton("Regenerate", { className: "act-btn", dataAction: "regenerate", id: n.id, variant: "ghost" }));
    }
    actions.push(actionButton("Edit", { className: "edit-btn", id: n.id, variant: "ghost" }));
    actions.push(actionButton("Dismiss", { className: "act-btn", dataAction: "dismiss", id: n.id, variant: "danger" }));
  } else if (n.status === "PUBLISHED") {
    actions.push(actionButton(n.isPinned ? "Unpin" : "Pin", { className: "act-btn", dataAction: n.isPinned ? "unpin" : "pin", id: n.id, variant: n.isPinned ? "ghostActive" : "ghost" }));
    actions.push(actionButton("Edit", { className: "edit-btn", id: n.id, variant: "ghost" }));
    actions.push(actionButton("Retract", { className: "act-btn", dataAction: "dismiss", id: n.id, variant: "danger" }));
  }
  const actionsHtml = actions.join("");

  return `
  <div class="nugget-card" data-id="${esc(n.id)}" style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px 18px;margin-bottom:10px;">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="font-size:20px;font-weight:700;color:${scoreColor};min-width:32px;">${n.interestScore}</div>
        <div>
          <div style="font-size:13px;font-weight:600;">${n.emoji} ${esc(n.category.replace(/_/g, " "))}</div>
          <div style="font-size:12px;color:${T.textSecondary};">${n.clubName ? esc(n.clubName) : "—"} · ${esc(n.signalType)} · ${fmtTime(n.generatedAt)}${n.isPinned ? " · 📌 pinned" : ""}${n.isEdited ? " · edited" : ""}</div>
        </div>
      </div>
    </div>
    <div class="display-copy" style="margin-top:10px;">
      <div style="font-size:14px;font-weight:600;margin-bottom:4px;">${esc(n.headline)}</div>
      <div style="font-size:13.5px;color:${T.text};line-height:1.5;">${esc(n.body)}</div>
    </div>
    <form class="edit-form" data-id="${esc(n.id)}" style="display:none;margin-top:10px;">
      <input type="text" name="headline" value="${esc(n.headline)}" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
      <textarea name="body" rows="2" style="width:100%;padding:7px 10px;margin-bottom:6px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;">${esc(n.body)}</textarea>
      <button type="submit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:${T.accent};color:#00170c;border:none;font-weight:700;cursor:pointer;">Save</button>
      <button type="button" class="cancel-edit" style="font-size:12px;padding:6px 12px;border-radius:8px;background:transparent;color:${T.textSecondary};border:1px solid ${T.border};cursor:pointer;">Cancel</button>
    </form>
    ${factsTable(n.sourceDataJson)}
    <div style="margin-top:12px;">${actionsHtml}</div>
  </div>`;
}

export function renderAdminIntelligencePage(d: AdminIntelligenceData): string {
  const pills = FILTERS.map((f) => {
    const active = f.key === d.filter;
    const count = f.key === "new" ? d.counts.new : f.key === "published" ? d.counts.published : f.key === "pinned" ? d.counts.pinned : f.key === "dismissed" ? d.counts.dismissed : null;
    return `<a href="/admin/intelligence?filter=${f.key}" style="
      display:inline-block;padding:6px 14px;border-radius:100px;border:1px solid ${T.border};
      background:${active ? T.elevated : "transparent"};color:${active ? T.text : T.textSecondary};
      font-size:13px;font-weight:${active ? 600 : 400};text-decoration:none;margin-right:8px;margin-bottom:8px;
    ">${esc(f.label)}${count != null ? ` (${count})` : ""}</a>`;
  }).join("");

  const clubOptions = d.clubs.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");

  const manualForm = `
    <details style="margin-bottom:20px;">
      <summary style="cursor:pointer;font-size:13px;color:${T.textSecondary};">+ Create nugget manually</summary>
      <form id="manual-form" style="background:${T.card};border:1px solid ${T.border};border-radius:12px;padding:16px;margin-top:10px;max-width:480px;">
        <label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">Category label</label>
        <input type="text" name="category" placeholder="HEATING_UP" required style="width:100%;padding:7px 10px;margin-bottom:10px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
        <label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">Emoji</label>
        <input type="text" name="emoji" placeholder="🔥" required style="width:100%;padding:7px 10px;margin-bottom:10px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
        <label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">Headline</label>
        <input type="text" name="headline" required style="width:100%;padding:7px 10px;margin-bottom:10px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;" />
        <label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">Body</label>
        <textarea name="body" rows="2" required style="width:100%;padding:7px 10px;margin-bottom:10px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;"></textarea>
        <label style="display:block;font-size:12px;color:${T.textSecondary};margin-bottom:4px;">Club (also used as the CTA target)</label>
        <select name="clubId" style="width:100%;padding:7px 10px;margin-bottom:10px;border-radius:8px;border:1px solid ${T.border};background:${T.bg};color:${T.text};font-size:13px;">
          <option value="">— None —</option>
          ${clubOptions}
        </select>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;"><input type="checkbox" name="isPinned" /> Pin immediately on publish</label>
        <button type="submit" style="padding:8px 18px;border-radius:100px;border:none;background:${T.accent};color:#00170c;font-weight:700;font-size:13px;cursor:pointer;">Create as candidate</button>
        <span id="manual-status" style="margin-left:10px;font-size:12px;color:${T.textSecondary};"></span>
      </form>
    </details>`;

  const cards = d.nuggets.map(nuggetCard).join("");

  const body = `
    <h1>Intelligence</h1>
    <p style="color:${T.textSecondary};font-size:13px;margin:-12px 0 20px;">Market Nuggets — deterministic signal detection over real marketplace data, templated copy, admin review before anything goes live.</p>
    <div style="margin-bottom:16px;">${pills}</div>
    ${manualForm}
    ${cards || `<div style="color:${T.textSecondary};font-size:13px;padding:24px;text-align:center;background:${T.card};border:1px solid ${T.border};border-radius:12px;">Nothing here yet.</div>`}

    <script>
      (function () {
        document.querySelectorAll(".edit-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var card = btn.closest(".nugget-card");
            card.querySelector(".display-copy").style.display = "none";
            card.querySelector(".edit-form").style.display = "block";
          });
        });
        document.querySelectorAll(".cancel-edit").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var card = btn.closest(".nugget-card");
            card.querySelector(".display-copy").style.display = "block";
            card.querySelector(".edit-form").style.display = "none";
          });
        });
        document.querySelectorAll(".edit-form").forEach(function (form) {
          form.addEventListener("submit", function (e) {
            e.preventDefault();
            var id = form.getAttribute("data-id");
            var fd = new FormData(form);
            fetch("/admin/nuggets/" + encodeURIComponent(id) + "/edit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ headline: fd.get("headline"), body: fd.get("body") }),
            })
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d.ok) location.reload(); else alert("Failed: " + (d.error || "unknown")); })
              .catch(function () { alert("Request failed."); });
          });
        });
        document.querySelectorAll(".act-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.getAttribute("data-id"), action = btn.getAttribute("data-action");
            btn.disabled = true;
            fetch("/admin/nuggets/" + encodeURIComponent(id) + "/" + action, { method: "POST" })
              .then(function (r) { return r.json(); })
              .then(function (d) {
                if (!d.ok) { btn.disabled = false; alert("Failed: " + (d.error || "unknown")); return; }
                location.reload();
              })
              .catch(function () { btn.disabled = false; alert("Request failed."); });
          });
        });
        var manualForm = document.getElementById("manual-form");
        if (manualForm) {
          manualForm.addEventListener("submit", function (e) {
            e.preventDefault();
            var fd = new FormData(manualForm);
            var status = document.getElementById("manual-status");
            status.textContent = "Creating...";
            fetch("/admin/nuggets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                category: fd.get("category"), emoji: fd.get("emoji"), headline: fd.get("headline"), body: fd.get("body"),
                clubId: fd.get("clubId") || null, isPinned: manualForm.querySelector("[name=isPinned]").checked,
              }),
            })
              .then(function (r) { return r.json(); })
              .then(function (d) { if (d.ok) location.reload(); else { status.textContent = "Failed: " + (d.error || "unknown"); } })
              .catch(function () { status.textContent = "Request failed."; });
          });
        }
      })();
    </script>
  `;
  return renderAdminShell({ active: "intelligence", title: "Intelligence", bodyHtml: body });
}
