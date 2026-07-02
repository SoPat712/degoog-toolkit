(function () {
  const API_BASE = `/api/plugin/${__PLUGIN_ID__}`;
  const MOUNT_ID = "degoog-oidc-user";
  const BUTTON_CLASS = "oidc-settings-gate__button";
  const WRAP_CLASS = "oidc-settings-gate__actions";
  const HINT_CLASS = "oidc-settings-gate__hint";
  const DEBUG_FLAG = "degoog-oidc-debug";
  const DEBUG_BOOT = "degoog-oidc-debug-boot";
  const SETTINGS_TOKEN_KEY = "degoog-settings-token";

  const normalizePath = (path) => {
    const value = String(path || "").trim();
    if (!value) return "/";
    const withSlash = value.startsWith("/") ? value : `/${value}`;
    return withSlash === "/" ? withSlash : withSlash.replace(/\/+$/, "");
  };

  const settingsAuthHeaders = () => {
    const headers = { accept: "application/json" };
    try {
      const token = sessionStorage.getItem(SETTINGS_TOKEN_KEY);
      if (token) headers["x-settings-token"] = token;
    } catch {}
    return headers;
  };

  const mapLegacyToAdmin = (pathname, legacyPath, adminPath) => {
    const legacy = normalizePath(legacyPath);
    const admin = normalizePath(adminPath);
    const current = normalizePath(pathname);
    if (current === legacy) return admin;
    if (current.startsWith(`${legacy}/`)) {
      return `${admin}${current.slice(legacy.length)}`;
    }
    return admin;
  };

  const maybeRedirectSettingsToAdmin = async () => {
    const pathname = normalizePath(window.location.pathname);
    const current = `${pathname}${window.location.search}${window.location.hash}`;

    try {
      const authRes = await fetch(
        `/api/settings/auth?returnTo=${encodeURIComponent(current)}`,
        { credentials: "same-origin", headers: settingsAuthHeaders() },
      );
      if (!authRes.ok) return false;
      const auth = await authRes.json();

      const redirectTo =
        typeof auth.redirectToAdmin === "string" ? auth.redirectToAdmin.trim() : "";
      if (redirectTo && normalizePath(redirectTo) !== pathname) {
        log("settings-alias.redirect", { from: pathname, to: redirectTo, via: "gate" });
        window.location.replace(`${redirectTo}${window.location.search}${window.location.hash}`);
        return true;
      }

      const legacyPath =
        typeof auth.legacySettingsPath === "string" ? auth.legacySettingsPath : "";
      const adminPath = typeof auth.adminPath === "string" ? auth.adminPath : "";
      if (!legacyPath || !adminPath) return false;
      if (normalizePath(legacyPath) === normalizePath(adminPath)) return false;
      if (
        pathname !== normalizePath(legacyPath) &&
        !pathname.startsWith(`${normalizePath(legacyPath)}/`)
      ) {
        return false;
      }

      const targetAdmin = mapLegacyToAdmin(pathname, legacyPath, adminPath);
      const [adminAuthRes, meRes] = await Promise.all([
        fetch(`/api/settings/auth?returnTo=${encodeURIComponent(targetAdmin)}`, {
          credentials: "same-origin",
          headers: settingsAuthHeaders(),
        }),
        fetch(`${API_BASE}/me`, { credentials: "same-origin" }),
      ]);
      if (!adminAuthRes.ok || !meRes.ok) return false;
      const adminAuth = await adminAuthRes.json();
      const me = await meRes.json();
      if (!adminAuth.valid || !me.authenticated) return false;

      log("settings-alias.redirect", { from: pathname, to: targetAdmin, via: "client" });
      window.location.replace(`${targetAdmin}${window.location.search}${window.location.hash}`);
      return true;
    } catch (err) {
      console.error("[oidc] settings alias redirect failed", err);
      return false;
    }
  };

  let debugEnabled = false;
  let mountObserver = null;
  let mountQueued = false;

  const bootCount = (() => {
    try {
      const next = 1 + Number(sessionStorage.getItem(DEBUG_BOOT) || "0");
      sessionStorage.setItem(DEBUG_BOOT, String(next));
      debugEnabled = sessionStorage.getItem(DEBUG_FLAG) === "1";
      return next;
    } catch {
      return 1;
    }
  })();

  const escapeHtml = (s) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const navType = () => {
    try {
      return performance.getEntriesByType("navigation")[0]?.type || "";
    } catch {
      return "";
    }
  };

  const setDebugEnabled = (value, source, meta) => {
    if (!value) return;
    debugEnabled = true;
    try {
      sessionStorage.setItem(DEBUG_FLAG, "1");
    } catch {}
    console.info("[oidc]", "debug enabled", {
      source,
      boot: bootCount,
      path: window.location.pathname,
      navType: navType(),
      ...(meta || {}),
    });
  };

  const log = (event, data) => {
    if (!debugEnabled) return;
    console.debug("[oidc]", event, {
      boot: bootCount,
      path: window.location.pathname,
      search: window.location.search,
      navType: navType(),
      ...(data || {}),
    });
  };

  const initials = (name, email) => {
    const base = (name || email || "?").trim();
    const parts = base.split(/\s+/);
    const chars =
      parts.length > 1 ? parts[0][0] + parts[1][0] : base.slice(0, 2);
    return chars.toUpperCase();
  };

  const icon = () => `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10.75 4a.75.75 0 0 1 0 1.5H6.5A1.5 1.5 0 0 0 5 7v10a1.5 1.5 0 0 0 1.5 1.5h4.25a.75.75 0 0 1 0 1.5H6.5A3 3 0 0 1 3.5 17V7a3 3 0 0 1 3-3h4.25Z" />
      <path d="M13.72 7.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 1 1-1.06-1.06l2.97-2.97H8.75a.75.75 0 0 1 0-1.5h7.94l-2.97-2.97a.75.75 0 0 1 0-1.06Z" />
    </svg>`;

  const avatarMarkup = (me, className = "degoog-oidc-avatar") =>
    me.picture
      ? `<img class="${escapeHtml(className)}" src="${escapeHtml(me.picture)}" alt="" referrerpolicy="no-referrer" data-oidc-avatar-image="true">`
      : `<span class="${escapeHtml(className)} degoog-oidc-avatar-initials">${escapeHtml(
          initials(me.name, me.email),
        )}</span>`;

  const findMount = () => {
    const resultsSettings = document.getElementById("nav-settings-results");
    if (resultsSettings && resultsSettings.parentElement) {
      return {
        target: resultsSettings.parentElement,
        before: resultsSettings.nextElementSibling,
        mode: "cluster",
      };
    }

    const homeSettings = document.getElementById("nav-settings-top");
    if (homeSettings && homeSettings.parentElement) {
      return {
        target: homeSettings.parentElement,
        before: homeSettings.nextElementSibling,
        mode: "cluster",
      };
    }

    const appsPocket = document.querySelector(".apps-pocket-wrapper");
    if (appsPocket) {
      return {
        target: appsPocket,
        before: appsPocket.querySelector("#apps-pocket-panel"),
        mode: "cluster",
      };
    }

    const headerRight = document.querySelector("#header .header-right");
    if (headerRight) {
      return { target: headerRight, before: null, mode: "inline" };
    }

    const resultsHeader = document.getElementById("results-header");
    if (resultsHeader) {
      return { target: resultsHeader, before: null, mode: "inline" };
    }

    const header = document.getElementById("header");
    if (header) {
      return { target: header, before: null, mode: "inline" };
    }

    return { target: document.body, before: null, mode: "floating" };
  };

  const mount = (wrap) => {
    const { target, before, mode } = findMount();
    if (!target) return;
    const alreadyPlaced =
      wrap.parentElement === target &&
      (!before || wrap.nextElementSibling === before);
    if (!alreadyPlaced) {
      if (before && before.parentElement === target) {
        target.insertBefore(wrap, before);
      } else {
        target.appendChild(wrap);
      }
    }
    wrap.classList.toggle("degoog-oidc-user--floating", mode === "floating");
    wrap.classList.toggle("degoog-oidc-user--inline", mode !== "floating");
    wrap.dataset.mountMode = mode;
    log("avatar.mount", {
      mode,
      targetId: target.id || "",
      targetClass: target.className || "",
      beforeId: before?.id || "",
    });
  };

  const queueMount = (wrap) => {
    if (!wrap || mountQueued) return;
    mountQueued = true;
    window.requestAnimationFrame(() => {
      mountQueued = false;
      mount(wrap);
    });
  };

  const observeMount = (wrap) => {
    if (mountObserver || !document.body) return;
    mountObserver = new MutationObserver(() => {
      queueMount(wrap);
    });
    mountObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    window.addEventListener(
      "pagehide",
      () => {
        mountObserver?.disconnect();
        mountObserver = null;
      },
      { once: true },
    );
  };

  const wireAvatarFallbacks = (wrap, me) => {
    wrap.querySelectorAll("[data-oidc-avatar-image='true']").forEach((img) => {
      img.addEventListener("error", () => {
        const replacement = document.createElement("span");
        replacement.className = `${img.className} degoog-oidc-avatar-initials`;
        replacement.textContent = initials(me.name, me.email);
        img.replaceWith(replacement);
        log("avatar.image-error", {
          src: img.getAttribute("src") || "",
        });
      });
    });
  };

  const wire = (wrap) => {
    const trigger = wrap.querySelector(".degoog-oidc-trigger");
    const menu = wrap.querySelector(".degoog-oidc-menu");
    const close = () => {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const opening = menu.hidden;
      menu.hidden = !opening;
      trigger.setAttribute("aria-expanded", String(opening));
      log("menu.toggle", { open: opening });
    });
    document.addEventListener("click", (e) => {
      if (wrap.contains(e.target)) return;
      close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      close();
    });
    wrap.querySelector(".degoog-oidc-logout").addEventListener("click", async () => {
      log("logout.click", { apiBase: API_BASE });
      try {
        await fetch(`${API_BASE}/logout`, {
          method: "POST",
          credentials: "same-origin",
        });
      } catch (err) {
        console.error("[oidc] logout failed", err);
      }
      log("logout.reload");
      window.location.reload();
    });
  };

  const enhanceSettingsGate = async () => {
    const form = document.getElementById("settings-auth-form");
    const gate = document.querySelector(".settings-auth-gate-inner");
    const errorEl = document.getElementById("settings-auth-error");
    if (!form || !gate || !errorEl) return;

    try {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      log("settings-gate.fetch.start", {
        hasForm: Boolean(form),
        hasGate: Boolean(gate),
        hasError: Boolean(errorEl),
        returnTo,
      });
      const response = await fetch(`/api/settings/auth?returnTo=${encodeURIComponent(returnTo)}`, {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json();
      setDebugEnabled(data?.debug === true, "settings-auth", {
        responseStatus: response.status,
        providerLabel: data?.providerLabel || "",
      });
      log("settings-gate.fetch.response", {
        status: response.status,
        ok: response.ok,
        data,
      });
      if (!data || typeof data.loginUrl !== "string" || !data.loginUrl) return;

      const providerLabel =
        typeof data.providerLabel === "string" && data.providerLabel.trim()
          ? data.providerLabel.trim()
          : "OIDC";

      form.hidden = true;
      form.setAttribute("aria-hidden", "true");

      const wrapper = document.createElement("div");
      wrapper.className = WRAP_CLASS;

      const button = document.createElement("button");
      button.type = "button";
      button.className = BUTTON_CLASS;
      const icon = document.createElement("i");
      icon.className = "fa-solid fa-right-to-bracket";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = `Sign in with ${providerLabel}`;
      button.appendChild(icon);
      button.appendChild(label);
      button.addEventListener("click", function () {
        window.location.assign(data.loginUrl);
      });

      const hint = document.createElement("p");
      hint.className = HINT_CLASS;
      hint.textContent =
        data.autoRedirect === true
          ? "Redirecting to your OpenID Connect provider."
          : "This degoog admin panel is protected by OpenID Connect.";

      wrapper.appendChild(button);
      wrapper.appendChild(hint);
      errorEl.insertAdjacentElement("beforebegin", wrapper);
      log("settings-gate.rendered", {
        providerLabel,
        loginUrl: data.loginUrl,
        autoRedirect: data.autoRedirect === true,
      });

      if (data.autoRedirect === true) {
        log("settings-gate.redirect", { loginUrl: data.loginUrl });
        window.location.assign(data.loginUrl);
      }
    } catch (err) {
      console.error("[oidc] settings gate check failed", err);
    }
  };

  const render = (me) => {
    const existing = document.getElementById(MOUNT_ID);
    if (existing) {
      mount(existing);
      return;
    }
    log("avatar.render", {
      email: me.email || "",
      name: me.name || "",
      hasPicture: Boolean(me.picture),
    });
    const wrap = document.createElement("div");
    wrap.id = MOUNT_ID;
    wrap.className = "degoog-oidc-user";
    wrap.innerHTML = `
      <button type="button" class="degoog-oidc-trigger" aria-haspopup="true" aria-expanded="false" aria-label="Open account menu">
        ${avatarMarkup(me)}
      </button>
      <div class="degoog-oidc-menu" hidden role="menu">
        <div class="degoog-oidc-menu-profile">
          ${avatarMarkup(me, "degoog-oidc-avatar degoog-oidc-avatar--menu")}
          <div class="degoog-oidc-menu-copy">
            <p class="degoog-oidc-name">${escapeHtml(me.name || me.email)}</p>
            ${me.email ? `<p class="degoog-oidc-email">${escapeHtml(me.email)}</p>` : ""}
          </div>
        </div>
        <div class="degoog-oidc-menu-rows">
          <button type="button" class="degoog-oidc-row degoog-oidc-logout" role="menuitem">
            <span class="degoog-oidc-row-icon">${icon()}</span>
            <span class="degoog-oidc-row-label">Sign out</span>
          </button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wireAvatarFallbacks(wrap, me);
    mount(wrap);
    observeMount(wrap);
    wire(wrap);
  };

  const boot = async () => {
    log("boot.start", { apiBase: API_BASE });
    if (await maybeRedirectSettingsToAdmin()) return;
    await enhanceSettingsGate();
    try {
      const res = await fetch(`${API_BASE}/me`, { credentials: "same-origin" });
      let me = null;
      if (res.ok) {
        me = await res.json();
        setDebugEnabled(me?.debug === true, "me", {
          responseStatus: res.status,
          providerLabel: me?.providerLabel || "",
        });
      }
      log("me.response", {
        status: res.status,
        ok: res.ok,
        body: me,
      });
      if (!res.ok) return;
      if (me && me.authenticated) render(me);
    } catch (err) {
      console.error("[oidc] session check failed", err);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
