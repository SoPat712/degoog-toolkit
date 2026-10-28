(() => {
  const id = __PLUGIN_ID__;
  const key = `oidc-login:${id}:attempt`;
  const pendingKey = `oidc-login:${id}:pending-search`;
  const origin = window.location.origin;
  const base = new URL(window.__DEGOOG_BASE_URL__ || "/", origin);
  if (base.origin !== origin) return;
  const prefix = base.pathname.replace(/\/+$/, "");
  const loginPath = `${prefix}/api/plugin/${encodeURIComponent(id)}/login`;

  function restoreSearch() {
    let saved;
    try {
      saved = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      sessionStorage.removeItem(pendingKey);
    } catch { return; }
    if (!saved || saved.path !== window.location.pathname + window.location.search || typeof saved.query !== "string" || !saved.query || saved.query.length > 4096 ||
        typeof saved.type !== "string" || !/^[\w:-]{1,100}$/.test(saved.type) || !Number.isFinite(saved.at) || Date.now() - saved.at > 10 * 60 * 1000 || saved.at > Date.now()) return;
    const resume = () => {
      if (typeof window.degoog?.search === "function") {
        window.degoog.search(saved.query, saved.type);
      } else {
        // Preserve POST-search privacy on cores without the programmatic search API.
        const form = document.createElement("form");
        form.method = "post"; form.action = `${prefix}/search`; form.hidden = true;
        for (const [name, value] of [["q", saved.query], ["type", saved.type]]) {
          const input = document.createElement("input"); input.name = name; input.value = value; form.appendChild(input);
        }
        document.body.appendChild(form); form.submit();
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", resume, { once: true });
    else resume();
  }

  async function check() {
    // Core already handles the settings gate. Never interfere with callbacks or other plugin pages.
    if (!document.getElementById("results-page") && !document.getElementById("index-page")) return;
    try {
      const response = await fetch(`${prefix}/api/settings/auth`, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) return;
      const auth = await response.json();
      if (auth.valid === true) {
        // Some browsers omit a Strict cookie on the first document after an IdP
        // redirect. A single same-origin reload refreshes core's server-rendered action flags.
        try {
          if (sessionStorage.getItem(key) === "attempted" && window.__DEGOOG_RESULT_ACTIONS__?.authenticated === false) {
            sessionStorage.setItem(key, "refreshing"); window.location.reload(); return;
          }
        } catch {}
        try { sessionStorage.removeItem(key); } catch {}
        restoreSearch();
        return;
      }
      if (auth.oidcPlugin !== id || auth.automaticSearchLogin !== "silent" || typeof auth.loginUrl !== "string") return;
      const login = new URL(auth.loginUrl, origin);
      if (login.origin !== origin || login.pathname !== loginPath) return;
      try {
        if (sessionStorage.getItem(key)) { restoreSearch(); return; }
        // Non-secret loop guard only. No identity token or admin session is ever placed in JS storage.
        sessionStorage.setItem(key, "attempted");
        const path = window.location.pathname + window.location.search;
        const input = document.getElementById("results-search-input");
        if (!new URL(window.location.href).searchParams.has("q") && input?.value?.trim()) {
          const current = window.degoog?.results?.current?.();
          const type = new URL(window.location.href).searchParams.get("type") || current?.type || "web";
          sessionStorage.setItem(pendingKey, JSON.stringify({ path, query: input.value.slice(0, 4096), type, at: Date.now() }));
        }
      } catch { return; } // Without a persistent loop guard, automatic navigation is unsafe.
      login.search = new URLSearchParams({ mode: "silent", returnTo: window.location.pathname + window.location.search + window.location.hash }).toString();
      window.location.replace(login.href);
    } catch { /* Search remains usable if the auth endpoint cannot be reached. */ }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void check(), { once: true });
  else void check();
})();
