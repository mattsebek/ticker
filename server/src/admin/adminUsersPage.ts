import { renderAdminShell, T } from "./adminShell";

/**
 * Table body is populated entirely client-side (fetch to /admin/api/users)
 * rather than server-rendered — the point of paginating is to never load
 * every registered user into one response, so the initial page load can't
 * embed the first batch server-side either without special-casing it.
 */
export function renderAdminUsersPage(): string {
  const body = `
    <h1>Users</h1>
    <input id="search" type="text" placeholder="Search by name or email..." style="
      width: 100%; max-width: 420px; padding: 10px 14px; margin-bottom: 16px;
      border-radius: 10px; border: 1px solid ${T.border}; background: ${T.card};
      color: ${T.text}; font-size: 14px;
    " />
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Email</th><th>Birthday</th><th>Joined</th><th>Onboarded</th><th>Cash</th><th>Holdings</th><th></th></tr>
        </thead>
        <tbody id="rows"></tbody>
      </table>
    </div>
    <div id="sentinel" style="height: 1px;"></div>
    <p id="status" style="color: ${T.textSecondary}; font-size: 13px; margin-top: 12px;"></p>

    <script>
      (function () {
        var rowsEl = document.getElementById("rows");
        var statusEl = document.getElementById("status");
        var searchEl = document.getElementById("search");
        var sentinel = document.getElementById("sentinel");
        var PAGE_SIZE = 20;
        var offset = 0, query = "", loading = false, done = false, searchDebounce = null;

        function esc(s) {
          return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        }
        function fmtDate(ms) {
          return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        }
        function rowHtml(u) {
          return "<tr data-id=\\"" + esc(u.id) + "\\">" +
            "<td>" + esc(u.name) + "</td>" +
            "<td>" + esc(u.email) + "</td>" +
            "<td>" + esc(u.birthday) + "</td>" +
            "<td>" + fmtDate(u.createdAt) + "</td>" +
            "<td>" + (u.onboarded ? "Yes" : "No") + "</td>" +
            "<td>$" + u.cash.toFixed(2) + "</td>" +
            "<td>" + u.holdingsCount + "</td>" +
            "<td><button class=\\"del-btn\\" data-id=\\"" + esc(u.id) + "\\" data-name=\\"" + esc(u.name) + "\\" style=\\"background:none;border:1px solid ${T.red};color:${T.red};border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;\\">Delete</button></td>" +
          "</tr>";
        }

        function load(reset) {
          if (loading || (done && !reset)) return;
          loading = true;
          statusEl.textContent = "Loading...";
          if (reset) { offset = 0; done = false; rowsEl.innerHTML = ""; }
          fetch("/admin/api/users?query=" + encodeURIComponent(query) + "&offset=" + offset + "&limit=" + PAGE_SIZE)
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.users.length === 0 && offset === 0) {
                rowsEl.innerHTML = "<tr><td colspan=\\"8\\" class=\\"empty\\">No users found.</td></tr>";
              } else {
                rowsEl.insertAdjacentHTML("beforeend", data.users.map(rowHtml).join(""));
              }
              offset += data.users.length;
              done = !data.hasMore;
              statusEl.textContent = done ? "" : "Scroll for more...";
              loading = false;
            })
            .catch(function () {
              statusEl.textContent = "Failed to load users.";
              loading = false;
            });
        }

        rowsEl.addEventListener("click", function (e) {
          var btn = e.target.closest(".del-btn");
          if (!btn) return;
          var id = btn.getAttribute("data-id"), name = btn.getAttribute("data-name");
          if (!confirm("Delete " + name + "? This removes their account and every league/team tie. This can't be undone.")) return;
          btn.disabled = true;
          btn.textContent = "...";
          fetch("/admin/users/" + encodeURIComponent(id) + "/delete", { method: "POST" })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.ok) {
                var tr = rowsEl.querySelector('tr[data-id="' + id + '"]');
                if (tr) tr.remove();
              } else {
                alert("Delete failed: " + (data.error || "unknown error"));
                btn.disabled = false;
                btn.textContent = "Delete";
              }
            })
            .catch(function () {
              alert("Delete failed.");
              btn.disabled = false;
              btn.textContent = "Delete";
            });
        });

        searchEl.addEventListener("input", function () {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(function () {
            query = searchEl.value;
            load(true);
          }, 300);
        });

        new IntersectionObserver(function (entries) {
          if (entries[0].isIntersecting) load(false);
        }).observe(sentinel);

        load(true);
      })();
    </script>
  `;
  return renderAdminShell({ active: "users", title: "Users", bodyHtml: body });
}
