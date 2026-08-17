// Styled to match the public site's own login/verification card (see
// ticker-website/src/components/AuthCard.tsx) rather than the browser's
// native HTTP Basic Auth dialog — same dark theme, serif headline, single
// input, green pill button.
const T = {
  bg: "#000000",
  card: "#151718",
  text: "#F5F6F5",
  textSecondary: "#8E9296",
  border: "#2A2C2E",
  accent: "#00C805",
  red: "#E0393E",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderAdminLoginPage(opts: { next: string; error: boolean }): string {
  const nextAttr = esc(opts.next);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticker Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:wght@400;600&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    background: ${T.bg};
    color: ${T.text};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    width: 100%;
    max-width: 380px;
    background: ${T.card};
    border: 1px solid ${T.border};
    border-radius: 20px;
    padding: 32px;
  }
  h1 {
    font-family: "Newsreader", serif;
    font-weight: 400;
    font-size: 28px;
    margin: 0 0 8px;
  }
  p.sub { color: ${T.textSecondary}; font-size: 13px; margin: 0 0 20px; line-height: 1.5; }
  p.error { color: ${T.red}; font-size: 13px; margin: 0 0 14px; }
  input[type="password"] {
    width: 100%;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid ${T.border};
    background: ${T.bg};
    color: ${T.text};
    font-size: 15px;
    margin-bottom: 16px;
  }
  input[type="password"]:focus { outline: none; border-color: ${T.accent}; }
  button {
    width: 100%;
    padding: 13px 16px;
    border-radius: 12px;
    border: none;
    background: ${T.accent};
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
</head>
<body>
  <form class="card" method="POST" action="/admin/login">
    <h1>Admin</h1>
    <p class="sub">Enter the admin password to continue.</p>
    ${opts.error ? `<p class="error">Incorrect password.</p>` : ""}
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
    <input type="hidden" name="next" value="${nextAttr}" />
    <button type="submit">Continue</button>
  </form>
</body>
</html>`;
}
