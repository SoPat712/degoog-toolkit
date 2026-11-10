// Result header (site line + breadcrumb) and the About this result panel.
// degoog wraps each theme script in its own function, so the few helpers
// shared with search.js are repeated here.
const LG_LANG_DICT = {
    en: {
        close: "Close",
        aboutResult: "About this result",
        foundBy: "Found by",
        connection: "Connection",
        secure: "Secure (HTTPS)",
        notSecure: "Not secure (HTTP)",
        moreFromSite: "More results from {site}",
        translatePage: "Translate this page",
        archivedCopy: "Open archived copy"
    }
};
const CLOSE_ICON =
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
const PHONE_SHEET_QUERY = window.matchMedia("(max-width: 767px)");

function getLgTranslation(key) {
    const attrName = `data-t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    return document.getElementById("results-page")?.getAttribute(attrName) || LG_LANG_DICT.en[key] || key;
}

function setSheetScrim(owner, on) {
    let scrim = document.getElementById("lg-sheet-scrim");
    if (!on) {
        if (scrim?.dataset.owner === owner) scrim.remove();
        return;
    }
    if (!scrim) {
        scrim = document.createElement("div");
        scrim.id = "lg-sheet-scrim";
        scrim.className = "lg-sheet-scrim";
        scrim.setAttribute("aria-hidden", "true");
        document.body.appendChild(scrim);
    }
    scrim.dataset.owner = owner;
}

(() => {
    const READY_CLASS = "lg-about-ready";
    const OPEN_CLASS = "lg-about-open";
    const PANEL_SELECTOR = ".lg-result-about-panel";
    const ICON = (path, extra = "") =>
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${path}</svg>`;
    const DOTS_ICON =
        `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
    const LINK_ICONS = {
        site: ICON(`<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>`),
        translate: ICON(`<path d="M4 5h10M9 3v2M11 5c-1 4-3 7-6 9M7 9c1 2 3 4 6 5M13 21l4-9 4 9M14.5 18h5"/>`),
        archive: ICON(`<path d="M3 7h18v13H3zM3 7l2-4h14l2 4M10 12h4"/>`),
    };
    const LOCK_ICON = ICON(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>`);
    const OPEN_LOCK_ICON = ICON(`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>`);

    function siteName(host) {
        return host.replace(/^www\./i, "");
    }

    function parseResultUrl(href) {
        try {
            const url = new URL(href);
            return /^https?:$/.test(url.protocol) ? url : null;
        } catch {
            return null;
        }
    }

    function breadcrumbParts(url) {
        // Google-style "https://host › seg › seg"; query and hash stay in the
        // full URL shown in the panel.
        const segments = url.pathname
            .split("/")
            .filter(Boolean)
            .map(segment => {
                try {
                    return decodeURIComponent(segment);
                } catch {
                    return segment;
                }
            });
        return [`${url.protocol}//${url.host}`, ...segments];
    }

    function aboutLinks(url, lang) {
        const site = siteName(url.hostname);
        const base = typeof window.__DEGOOG_BASE_URL__ === "string" ? window.__DEGOOG_BASE_URL__ : "";
        const page = url.href.split("#")[0];
        const target = /^zh/i.test(lang) ? lang : lang.split("-")[0] || "en";
        return {
            site: `${base}/search?q=${encodeURIComponent(`site:${site}`)}`,
            translate: `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(target)}&u=${encodeURIComponent(page)}`,
            archive: `https://web.archive.org/web/*/${page}`,
        };
    }

    function renderHeader(item, link, url) {
        const name = item.querySelector(".lg-result-site-name");
        const cite = item.querySelector(".result-cite");
        if (name) name.textContent = siteName(url.hostname);
        if (!cite) return;
        // Segments wrap onto a clipped second line, so the visible crumb
        // always ends at a segment boundary at any width.
        cite.classList.add("lg-result-crumbs");
        cite.replaceChildren(
            ...breadcrumbParts(url).map((part, index) => {
                const crumb = document.createElement("span");
                crumb.className = index ? "lg-crumb" : "lg-crumb lg-crumb--origin";
                crumb.textContent = part;
                return crumb;
            }),
        );
        item.dataset.lgAboutUrl = link.href;
    }

    // A wrapped flex row spans its whole container, which would strand the ⋮
    // far from the visible URL. Shrink the crumbs to their first line.
    const fitObserver = new ResizeObserver(entries => entries.forEach(entry => fitCrumbs(entry.target)));

    function fitCrumbs(line) {
        const cite = line.querySelector(".lg-result-crumbs");
        if (!cite?.firstElementChild) return;
        cite.style.maxWidth = "";
        const box = cite.getBoundingClientRect();
        const top = cite.firstElementChild.getBoundingClientRect().top;
        const rtl = getComputedStyle(cite).direction === "rtl";
        let extent = 0;
        for (const crumb of cite.children) {
            const rect = crumb.getBoundingClientRect();
            if (rect.top - top > 1) break;
            extent = Math.max(extent, rtl ? box.right - rect.left : rect.right - box.left);
        }
        if (extent && extent < box.width - 1) cite.style.maxWidth = `${Math.ceil(extent)}px`;
    }

    function ensureToggle(item) {
        // Core renders its own ⋮ only when domain actions are available.
        let wrap = item.querySelector(".lg-result-about");
        if (wrap) return wrap;
        // The ⋮ follows the URL, as on Google.
        const row = item.querySelector(".lg-result-site-line") || item.querySelector(".result-url-row");
        if (!row) return null;
        wrap = document.createElement("div");
        wrap.className = "result-actions lg-result-about";
        wrap.innerHTML =
            `<button type="button" class="result-actions-toggle lg-result-about-toggle" aria-haspopup="dialog" aria-expanded="false">${DOTS_ICON}</button>` +
            `<div class="result-actions-menu lg-result-about-panel" role="dialog" tabindex="-1" hidden></div>`;
        const label = getLgTranslation("aboutResult");
        wrap.firstElementChild.setAttribute("aria-label", label);
        wrap.lastElementChild.setAttribute("aria-label", label);
        row.appendChild(wrap);
        return wrap;
    }

    function enhanceResult(item) {
        const link = item.querySelector("a.result-title");
        const url = link && parseResultUrl(link.href);
        if (!url) return;
        if (item.dataset.lgAboutUrl !== link.href) {
            renderHeader(item, link, url);
            item.querySelector(".lg-result-about-content")?.remove();
            const line = item.querySelector(".lg-result-site-line");
            if (line) {
                fitCrumbs(line);
                fitObserver.observe(line);
            }
        }
        if (!ensureToggle(item)) return;
        item.classList.add(READY_CLASS);
    }

    function buildContent(item, url) {
        const content = document.createElement("div");
        content.className = "lg-result-about-content";
        content.innerHTML =
            `<div class="lg-result-about-head"><h2 class="lg-result-about-title"></h2>` +
            `<button type="button" class="lg-result-about-close">${CLOSE_ICON}</button></div>` +
            `<div class="lg-result-about-site"><span class="lg-result-about-favicon" aria-hidden="true"></span>` +
            `<span class="lg-result-about-site-text"><span class="lg-result-about-site-name"></span>` +
            `<span class="lg-result-about-url"></span></span></div>` +
            `<dl class="lg-result-about-facts"></dl>` +
            `<div class="lg-result-about-links"></div>`;
        const site = siteName(url.hostname);
        content.querySelector(".lg-result-about-title").textContent = getLgTranslation("aboutResult");
        content.querySelector(".lg-result-about-close").setAttribute("aria-label", getLgTranslation("close"));
        content.querySelector(".lg-result-about-site-name").textContent = site;
        let shown = url.href;
        try {
            shown = decodeURI(url.href);
        } catch {
            /* Keep the encoded URL. */
        }
        content.querySelector(".lg-result-about-url").textContent = shown.replace(/^https?:\/\//, "");

        const favicon = content.querySelector(".lg-result-about-favicon");
        const img = item.querySelector("img.result-favicon");
        if (img?.complete && img.naturalWidth > 0) {
            const copy = document.createElement("img");
            copy.src = img.currentSrc || img.src;
            copy.alt = "";
            favicon.appendChild(copy);
        } else {
            favicon.textContent = site.charAt(0).toUpperCase();
        }

        const facts = content.querySelector(".lg-result-about-facts");
        const engines = item.querySelector(".result-engines");
        if (engines?.childElementCount) {
            const dt = document.createElement("dt");
            dt.textContent = getLgTranslation("foundBy");
            const dd = document.createElement("dd");
            dd.appendChild(engines);
            facts.append(dt, dd);
        }
        const dt = document.createElement("dt");
        dt.textContent = getLgTranslation("connection");
        const dd = document.createElement("dd");
        const secure = url.protocol === "https:";
        dd.className = secure ? "lg-result-about-secure" : "lg-result-about-insecure";
        dd.innerHTML = secure ? LOCK_ICON : OPEN_LOCK_ICON;
        dd.append(getLgTranslation(secure ? "secure" : "notSecure"));
        facts.append(dt, dd);

        const titleLink = item.querySelector("a.result-title");
        const linkTarget = titleLink?.getAttribute("target") || "_self";
        const hrefs = aboutLinks(url, document.documentElement.lang || navigator.language || "en");
        const labels = {
            site: getLgTranslation("moreFromSite").replace("{site}", site),
            translate: getLgTranslation("translatePage"),
            archive: getLgTranslation("archivedCopy"),
        };
        content.querySelector(".lg-result-about-links").append(
            ...Object.keys(hrefs).map(kind => {
                const a = document.createElement("a");
                a.className = "lg-result-about-link";
                a.href = hrefs[kind];
                a.dataset.lgAbout = kind;
                if (kind === "site") {
                    a.dataset.query = `site:${site}`;
                } else {
                    a.target = linkTarget;
                    a.rel = "noopener noreferrer";
                }
                a.innerHTML = LINK_ICONS[kind];
                a.append(labels[kind]);
                return a;
            }),
        );
        return content;
    }

    function syncPanel(panel) {
        const item = panel.closest(".result-item");
        const wrap = panel.closest(".lg-result-about");
        const toggle = wrap?.querySelector(".lg-result-about-toggle");
        if (!item || !toggle) return;
        const open = !panel.hidden;
        item.classList.toggle(OPEN_CLASS, open);
        toggle.setAttribute("aria-expanded", String(open));
        if (!open) {
            panel.classList.remove("lg-result-about-panel--above", "lg-result-about-panel--end");
            if (!document.querySelector(`#results-list ${PANEL_SELECTOR}:not([hidden])`)) setSheetScrim("about", false);
            if (panel.contains(document.activeElement)) toggle.focus({ preventScroll: true });
            return;
        }
        const url = parseResultUrl(item.querySelector("a.result-title")?.href || "");
        if (url && !panel.querySelector(".lg-result-about-content")) {
            panel.prepend(buildContent(item, url));
        }
        closeOthers(panel);
        const sheet = PHONE_SHEET_QUERY.matches;
        panel.classList.toggle("lg-sheet", sheet);
        setSheetScrim("about", sheet);
        panel.focus({ preventScroll: true });
        if (sheet) return;
        // Open from the ⋮ towards the line end; flip when that runs off screen.
        const box = panel.getBoundingClientRect();
        const rtl = getComputedStyle(panel).direction === "rtl";
        if (rtl ? box.left < 8 : box.right > document.documentElement.clientWidth - 8) {
            panel.classList.add("lg-result-about-panel--end");
        }
        // Open upwards when only that fits; otherwise bring it into view.
        const rect = panel.getBoundingClientRect();
        if (rect.bottom <= window.innerHeight - 8) return;
        if (toggle.getBoundingClientRect().top - rect.height - 8 > 96) {
            panel.classList.add("lg-result-about-panel--above");
        } else {
            panel.scrollIntoView({ block: "nearest" });
        }
    }

    function closePanel(panel) {
        // Same effect as core's own close: hide the menu, collapse its toggle.
        if (panel && !panel.hidden) panel.hidden = true;
    }

    function closeOthers(except) {
        document.querySelectorAll(`#results-list ${PANEL_SELECTOR}:not([hidden])`).forEach(panel => {
            if (panel !== except) closePanel(panel);
        });
    }

    function onClick(event) {
        const target = event.target;
        if (!target?.closest) return;
        const toggle = target.closest(".lg-result-about-toggle");
        if (toggle && !toggle.id) {
            // Core drives its own toggle (result-actions-toggle-N).
            const panel = toggle.parentElement.querySelector(PANEL_SELECTOR);
            if (panel) panel.hidden = !panel.hidden;
            return;
        }
        const close = target.closest(".lg-result-about-close");
        if (close) {
            closePanel(close.closest(PANEL_SELECTOR));
            return;
        }
        const site = target.closest('.lg-result-about-link[data-lg-about="site"]');
        if (site && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            if (typeof window.degoog?.search !== "function") return;
            event.preventDefault();
            closePanel(site.closest(PANEL_SELECTOR));
            window.degoog.search(site.dataset.query, "web");
        }
    }

    function onKeydown(event) {
        if (event.key !== "Escape") return;
        const wrap = document.activeElement?.closest?.(".lg-result-about");
        const panel = wrap?.querySelector(PANEL_SELECTOR);
        if (!panel || panel.hidden) return;
        event.preventDefault();
        wrap.querySelector(".lg-result-about-toggle")?.focus({ preventScroll: true });
        closePanel(panel);
    }

    function onPointerDown(event) {
        document.querySelectorAll(`#results-list ${PANEL_SELECTOR}:not([hidden])`).forEach(panel => {
            if (!panel.closest(".lg-result-about")?.contains(event.target)) closePanel(panel);
        });
    }

    function onFocusOut(event) {
        const wrap = event.target?.closest?.(".lg-result-about");
        const next = event.relatedTarget;
        if (!wrap || !next || wrap.contains(next)) return;
        closePanel(wrap.querySelector(PANEL_SELECTOR));
    }

    function enhanceAll(root) {
        root.querySelectorAll(".result-item").forEach(enhanceResult);
    }

    function onMutations(mutations) {
        const items = new Set();
        for (const mutation of mutations) {
            const target = mutation.target;
            if (mutation.type === "attributes") {
                if (target.matches?.(PANEL_SELECTOR)) syncPanel(target);
                else if (target.matches?.("a.result-title")) items.add(target.closest(".result-item"));
                continue;
            }
            const owner = target.closest?.(".result-item");
            if (owner) items.add(owner);
            mutation.addedNodes.forEach(node => {
                if (node.nodeType !== 1) return;
                if (node.matches(".result-item")) items.add(node);
                else node.querySelectorAll?.(".result-item").forEach(item => items.add(item));
            });
        }
        items.forEach(item => item && enhanceResult(item));
    }

    function init() {
        const list = document.getElementById("results-list");
        if (!list) return;
        new MutationObserver(onMutations).observe(list, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["hidden", "href"],
        });
        enhanceAll(list);
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKeydown, true);
        document.addEventListener("pointerdown", onPointerDown, true);
        list.addEventListener("focusout", onFocusOut);
        PHONE_SHEET_QUERY.addEventListener?.("change", () => closeOthers(null));
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();
})();
