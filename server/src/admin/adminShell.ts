// Shared look for every admin page: colors copied 1:1 from
// app/src/theme/theme.ts's DARK_THEME (see adminLoginPage.ts for the same
// convention on the login page).
export const T = {
  bg: "#000000",
  card: "#151718",
  text: "#F5F6F5",
  textSecondary: "#8E9296",
  border: "#2A2C2E",
  borderLight: "#222425",
  accent: "#00C805",
  red: "#E0393E",
  elevated: "#1C1E1F",
};

export function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const NAV_ITEMS: { key: string; label: string; href: string }[] = [
  { key: "users", label: "Users", href: "/admin/users" },
  { key: "leagues", label: "Leagues", href: "/admin/leagues" },
  { key: "clubs", label: "Clubs", href: "/admin/clubs" },
];

/** Icon + wordmark lockup, ported from ticker-website's Logo.tsx (same gradient square + arrow glyph). */
const LOGO_HTML = `
  <div style="display:flex;align-items:center;gap:12px;">
    <div style="width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#12F06F,#00B54F);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <svg viewBox="0 0 22 22" fill="none" stroke="#00170c" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" style="width:58%;height:58%;">
        <polyline points="3,16 8,10 12,13 19,4" />
        <polyline points="13,4 19,4 19,10" />
      </svg>
    </div>
    <span style="font-family:'Newsreader',serif;font-size:19px;font-weight:600;letter-spacing:0.02em;color:${T.text};">Ticker</span>
  </div>`;

/**
 * Every admin page is a full server-rendered document (no client router) —
 * consistent with the rest of this Express app, and simple enough that a
 * shared page reload between sections is a non-issue for an internal tool.
 * `active` highlights the current section in the sidebar.
 */
export function renderAdminShell(opts: { active: "users" | "leagues" | "clubs"; title: string; bodyHtml: string; headExtra?: string }): string {
  const navLinks = NAV_ITEMS.map(
    (item) => `
      <a href="${item.href}" style="
        display:block;padding:10px 14px;border-radius:10px;margin-bottom:2px;
        font-size:14px;font-weight:${item.key === opts.active ? 600 : 400};
        color:${item.key === opts.active ? T.text : T.textSecondary};
        background:${item.key === opts.active ? T.elevated : "transparent"};
        text-decoration:none;
      ">${esc(item.label)}</a>`
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticker Admin — ${esc(opts.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;600&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: ${T.bg};
    color: ${T.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    min-height: 100vh;
  }
  a { color: ${T.accent}; }
  .layout { display: flex; min-height: 100vh; }
  .sidebar {
    width: 220px;
    flex-shrink: 0;
    padding: 20px 14px;
    border-right: 1px solid ${T.border};
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .sidebar-logo { padding: 6px 10px 24px; }
  .main { flex: 1; min-width: 0; padding: 28px 32px 60px; }
  h1 { font-size: 20px; font-weight: 600; margin: 0 0 20px; }
  .table-wrap { overflow-x: auto; border: 1px solid ${T.border}; border-radius: 12px; background: ${T.card}; }
  table { border-collapse: collapse; width: 100%; min-width: 480px; }
  th, td { text-align: left; padding: 10px 14px; font-size: 13px; border-bottom: 1px solid ${T.borderLight}; white-space: nowrap; }
  th { color: ${T.textSecondary}; text-transform: uppercase; letter-spacing: 0.5px; font-size: 11px; font-weight: 600; background: ${T.elevated}; }
  tr:last-child td { border-bottom: none; }
  td.empty { color: ${T.textSecondary}; text-align: center; padding: 20px; }
  .pos { color: ${T.accent}; }
  .neg { color: ${T.red}; }
  ${opts.headExtra ?? ""}
</style>
</head>
<body>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-logo">${LOGO_HTML}</div>
      <nav>${navLinks}</nav>
    </div>
    <div class="main">
      ${opts.bodyHtml}
    </div>
  </div>
</body>
</html>`;
}
