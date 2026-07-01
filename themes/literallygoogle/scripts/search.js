/*
 * LiterallyGoogle — search-page behaviour bundle
 *
 * Loaded by search.html. Each IIFE is self-contained and uses MutationObservers
 * so it stays valid across client-side DOM updates.
 */

const LG_LANG_DICT = {
    en: {
        settings: "Settings",
        prev: "Previous",
        prevImage: "Previous image",
        next: "Next",
        nextImage: "Next image",
        moreOptions: "More options",
        download: "Download",
        copyLink: "Copy link",
        close: "Close",
        imageCopied: "Image link copied!",
        linkCopied: "Link copied!"
    }
};

function getLgTranslation(key) {
    const attrName = `data-t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    const el = document.getElementById("results-page");
    return el?.getAttribute(attrName) || LG_LANG_DICT.en[key] || key;
}

/* ── 1. Sticky header scroll shadow ─────────────────────────────────────── */
(() => {
    const header = document.getElementById("results-header");
    if (!header) return;
    window.addEventListener(
        "scroll",
        () => {
            header.classList.toggle("scrolled", window.scrollY > 50);
        },
        { passive: true },
    );
})();

/* ── 2. Google-style degooooooog pagination ────────────────────────────── */
(() => {
    const ENHANCED_ATTR = "data-lg-pager-enhanced";

    function getPageNumber(node) {
        const raw = node.getAttribute("data-page") || node.textContent || "";
        const page = parseInt(raw.trim(), 10);
        return Number.isFinite(page) && page > 0 ? page : null;
    }

    function getPageNodes(pagination) {
        return [
            ...pagination.querySelectorAll("[data-page]"),
            ...pagination.querySelectorAll(".pagination-current")
        ].filter(node => getPageNumber(node) !== null);
    }

    function isActivePage(node) {
        return (
            node.classList.contains("pagination-current") ||
            node.classList.contains("active") ||
            node.classList.contains("current") ||
            node.classList.contains("selected") ||
            node.getAttribute("aria-current") === "page" ||
            node.disabled
        );
    }

    function classifyControls(nodes) {
        const pages = nodes
            .map(node => ({ node, page: getPageNumber(node) }))
            .filter(item => item.page !== null)
            .sort((a, b) => a.page - b.page);
        const active = pages.find(item => isActivePage(item.node));
        const activePage = active ? active.page : (pages[0]?.page || 1);
        let prev = null;
        let next = null;

        pages.forEach(item => {
            if (item.page < activePage && (!prev || item.page > prev.page)) {
                prev = item;
            }
            if (item.page > activePage && (!next || item.page < next.page)) {
                next = item;
            }
        });

        return { pages, activePage, prev, next };
    }

    const RESULTS_PER_PAGE_HINT = 10;

    function getResultCount() {
        const list = document.getElementById("results-list");
        if (!list) return -1;
        if (list.querySelector(".no-results")) return 0;
        return list.querySelectorAll(".degoog-result").length;
    }

    function isOptimisticMaxPageStrip(pageNodes) {
        if (pageNodes.length !== 10) return false;
        const pages = pageNodes
            .map(getPageNumber)
            .filter(page => page !== null)
            .sort((a, b) => a - b);
        if (pages.length !== 10) return false;
        return pages.every((page, i) => page === i + 1);
    }

    function shouldShowPagination(pagination) {
        const pageNodes = getPageNodes(pagination);
        if (pageNodes.length < 2) return false;

        const resultCount = getResultCount();
        const activePage = classifyControls(pageNodes).activePage;

        if (resultCount === 0 && activePage === 1) return false;

        if (activePage === 1 && isOptimisticMaxPageStrip(pageNodes)) {
            return resultCount >= RESULTS_PER_PAGE_HINT;
        }

        return true;
    }

    function clearPagination(pagination) {
        pagination.removeAttribute(ENHANCED_ATTR);
        pagination.innerHTML = "";
    }

    function makeLetter(char, className) {
        const span = document.createElement("span");
        span.className = `lg-pager-letter ${className}`;
        span.textContent = char;
        return span;
    }

    function makeControlElement(kind, label) {
        const span = document.createElement("span");
        span.className = `lg-pager-control lg-pager-control--${kind}`;
        span.innerHTML =
            `<span class="lg-pager-arrow" aria-hidden="true">${kind === "prev" ? "‹" : "›"}</span>` +
            `<span class="lg-pager-control-label"></span>`;
        span.querySelector(".lg-pager-control-label").textContent = label;
        return span;
    }

    function makeDisabledControl(kind, label) {
        const control = makeControlElement(kind, label);
        control.classList.add("lg-pager-control--disabled");
        control.setAttribute("aria-disabled", "true");
        return control;
    }

    function decorateControl(item, kind, label) {
        if (!item) return makeDisabledControl(kind, label);
        const source = item.node;
        const node = document.createElement(source.tagName === "A" ? "a" : "button");
        node.className = `lg-pager-control lg-pager-control--${kind}`;
        node.setAttribute("data-page", String(item.page));
        if (node.tagName === "BUTTON") node.type = "button";
        const href = source.getAttribute("href");
        if (node.tagName === "A" && href) {
            node.setAttribute("href", href);
        } else {
            node.addEventListener("click", event => {
                event.preventDefault();
                source.click();
            });
        }
        node.innerHTML = makeControlElement(kind, label).innerHTML;
        return node;
    }

    function enhancePagination(pagination, pageNodes) {
        if (!pagination || pagination.hasAttribute(ENHANCED_ATTR)) return;
        if (pagination.querySelector(":scope > .lg-pager")) return;

        const controls = classifyControls(pageNodes);
        pagination.setAttribute(ENHANCED_ATTR, "1");

        const root = document.createElement("nav");
        root.className = "lg-pager";
        root.setAttribute("aria-label", "Search result pages");

        const wordmark = document.createElement("div");
        const lettersLine = document.createElement("div");
        const lettersCore = document.createElement("div");
        const oTrack = document.createElement("div");
        const prefix = document.createElement("div");
        const suffix = document.createElement("div");
        const oColors = [
            "lg-pager-blue",
            "lg-pager-green",
            "lg-pager-red",
            "lg-pager-yellow",
        ];

        wordmark.className = "lg-pager-wordmark";
        wordmark.style.setProperty("--lg-pager-page-count", String(controls.pages.length));
        lettersLine.className = "lg-pager-letters-line";
        lettersCore.className = "lg-pager-letters-core";
        prefix.className = "lg-pager-prefix";
        oTrack.className = "lg-pager-o-track";
        suffix.className = "lg-pager-suffix";

        [
            ["d", "lg-pager-blue"],
            ["e", "lg-pager-red"],
            ["g", "lg-pager-yellow"],
        ].forEach(part => {
            prefix.appendChild(makeLetter(part[0], part[1]));
        });
        controls.pages.forEach((item, index) => {
            const oClass =
                item.page === controls.activePage
                    ? "lg-pager-o lg-pager-o--active"
                    : `lg-pager-o ${oColors[index % oColors.length]}`;
            oTrack.appendChild(makeLetter("o", oClass));
        });
        suffix.appendChild(makeLetter("g", "lg-pager-blue"));

        const numberRow = document.createElement("div");
        numberRow.className = "lg-pager-pages";
        controls.pages.forEach(item => {
            const node = item.node;
            node.classList.add("lg-pager-page");
            node.classList.toggle("lg-pager-page--active", item.page === controls.activePage);
            node.textContent = String(item.page);
            numberRow.appendChild(node);
        });

        lettersCore.appendChild(prefix);
        lettersCore.appendChild(oTrack);
        lettersCore.appendChild(suffix);
        lettersLine.appendChild(decorateControl(controls.prev, "prev", getLgTranslation("prev")));
        lettersLine.appendChild(lettersCore);
        lettersLine.appendChild(decorateControl(controls.next, "next", getLgTranslation("next")));
        wordmark.appendChild(lettersLine);
        wordmark.appendChild(numberRow);
        root.appendChild(wordmark);
        pagination.replaceChildren(root);
    }

    function syncPagination() {
        const pagination = document.getElementById("pagination");
        if (!pagination) return;

        if (!shouldShowPagination(pagination)) {
            if (pagination.childElementCount > 0) clearPagination(pagination);
            return;
        }

        if (pagination.querySelector(":scope > .lg-pager")) return;

        const pageNodes = getPageNodes(pagination);
        if (pageNodes.length < 2) {
            if (pagination.childElementCount > 0) clearPagination(pagination);
            return;
        }

        enhancePagination(pagination, pageNodes);
    }

    function observePagination() {
        const pagination = document.getElementById("pagination");
        if (!pagination) return;
        new MutationObserver(() => {
            window.requestAnimationFrame(syncPagination);
        }).observe(pagination, { childList: true, subtree: false });

        const resultsList = document.getElementById("results-list");
        if (resultsList) {
            new MutationObserver(() => {
                window.requestAnimationFrame(syncPagination);
            }).observe(resultsList, { childList: true, subtree: false });
        }

        window.addEventListener("degoog-results-ready", () => {
            window.requestAnimationFrame(syncPagination);
        });

        syncPagination();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observePagination);
    } else {
        observePagination();
    }
})();

/* ── 3. Result-slot hygiene during pagination ──────────────────────────── */
(() => {
    const SLOT_CONTAINER_IDS = [
        "slot-above-results",
        "slot-below-results",
        "slot-above-sidebar",
        "slot-below-sidebar",
    ];

    function slotContainers() {
        return SLOT_CONTAINER_IDS.map(id => document.getElementById(id)).filter(Boolean);
    }

    function clearResultSlots() {
        slotContainers().forEach(container => {
            container.innerHTML = "";
        });
    }

    function fullWidthKey(panel) {
        const root = panel.querySelector(
            ":scope > .results-slot-panel-body > .slot-full-width",
        );
        if (!root) return "";
        for (let i = 0; i < root.classList.length; i += 1) {
            const className = root.classList[i];
            if (className !== "slot-full-width") return className;
        }
        return root.tagName.toLowerCase();
    }

    function dedupeFullWidthPanels(container) {
        const seen = new Map();
        const panels = [...container.querySelectorAll(":scope > .results-slot-panel")];
        panels.forEach(panel => {
            const key = fullWidthKey(panel);
            if (!key) return;
            const previous = seen.get(key);
            if (previous?.isConnected) {
                previous.remove();
            }
            seen.set(key, panel);
        });
    }

    document.addEventListener(
        "click",
        event => {
            const target = event.target;
            if (
                target &&
                typeof target.closest === "function" &&
                target.closest("#pagination [data-page]")
            ) {
                clearResultSlots();
            }
        },
        true,
    );

    function leadingFullWidthSlotRows() {
        const slot = document.getElementById("slot-above-results");
        if (!slot) return 1;

        let row = 1;
        for (const panel of slot.querySelectorAll(":scope > .results-slot-panel")) {
            if (
                panel.querySelector(
                    ":scope > .results-slot-panel-body > .slot-full-width",
                )
            ) {
                row += 1;
            } else {
                break;
            }
        }
        return row;
    }

    function syncSidebarGridRow() {
        const sidebar = document.getElementById("sidebar-col");
        if (!sidebar) return;

        if (window.matchMedia("(max-width: 767px)").matches) {
            sidebar.style.removeProperty("grid-row");
            return;
        }

        sidebar.style.gridRow = `${leadingFullWidthSlotRows()} / span 30`;
    }

    function observeSlots() {
        syncSidebarGridRow();

        const slot = document.getElementById("slot-above-results");
        if (slot && !slot._lgSidebarRowObserver) {
            slot._lgSidebarRowObserver = true;
            new MutationObserver(() => {
                window.requestAnimationFrame(syncSidebarGridRow);
            }).observe(slot, { childList: true });
        }

        if (!window._lgSidebarRowResizeBound) {
            window._lgSidebarRowResizeBound = true;
            window.addEventListener("resize", syncSidebarGridRow, { passive: true });
            window.addEventListener("degoog-results-ready", syncSidebarGridRow);
        }

        slotContainers().forEach(container => {
            dedupeFullWidthPanels(container);
            new MutationObserver(mutations => {
                const shouldDedupe = mutations.some(mutation => mutation.addedNodes.length > 0);
                if (shouldDedupe) dedupeFullWidthPanels(container);
            }).observe(container, { childList: true });
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeSlots);
    } else {
        observeSlots();
    }
})();

/* ── 4. Move spell-check notices into #results-meta ─────────────────────── */
(() => {
    let spellCheckFrame = 0;

    function wrapResultsStats(meta) {
        if (!meta || meta.querySelector(".results-meta-stats")) return;
        for (let i = 0; i < meta.childNodes.length; i++) {
            const node = meta.childNodes[i];
            if (node.nodeType !== Node.TEXT_NODE) continue;
            const text = node.textContent.trim();
            if (!text) continue;
            const stats = document.createElement("span");
            stats.className = "results-meta-stats";
            stats.textContent = text;
            meta.replaceChild(stats, node);
            return;
        }
    }

    function moveSpellCheck() {
        const notices = document.querySelectorAll(".spell-check-notice");
        const meta = document.getElementById("results-meta");
        wrapResultsStats(meta);
        for (let i = 0; i < notices.length; i++) {
            const notice = notices[i];
            const panel = notice.closest(".results-slot-panel");
            if (meta && notice.parentNode !== meta) {
                meta.appendChild(notice);
                panel?.remove();
            }
        }
    }

    function scheduleSpellCheck() {
        if (spellCheckFrame) return;
        spellCheckFrame = requestAnimationFrame(() => {
            spellCheckFrame = 0;
            moveSpellCheck();
        });
    }

    const target = document.getElementById("results-page") || document.documentElement;
    new MutationObserver(mutations => {
        const shouldCheck = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (shouldCheck) scheduleSpellCheck();
    }).observe(target, {
        childList: true,
        subtree: true,
    });

    moveSpellCheck();
})();

/* ── 4b. Google-style Filters dropdown (tab-row toggle + flyout menus) ─── */
(() => {
    let filtersFrame = 0;

    function unwrapMetaRow() {
        const row = document.getElementById("lg-meta-row");
        const meta = document.getElementById("results-meta");
        const page = document.getElementById("results-page");
        const tabs = document.getElementById("results-tabs");
        if (!page) return;
        if (!row) return;
        if (meta?.parentNode === row) {
            page.insertBefore(meta, row);
        }
        const panel = document.getElementById("tools-panel");
        if (panel?.parentNode === row) {
            tabs?.after(panel);
        }
        row.remove();
    }

    function relabelFiltersToggle(toggle) {
        if (toggle.dataset.lgFiltersLabel === "1") return;
        toggle.querySelector("i")?.remove();
        for (const node of [...toggle.childNodes]) {
            if (node.nodeType === Node.TEXT_NODE) {
                node.remove();
            }
        }
        let label = toggle.querySelector(".lg-filters-label");
        if (!label) {
            label = document.createElement("span");
            label.className = "lg-filters-label";
            toggle.appendChild(label);
        }
        label.textContent = "Filters";
        toggle.dataset.lgFiltersLabel = "1";
    }

    function positionFiltersPanel(panel, toggle, page) {
        if (panel.style.display === "none") return;
        const toggleRect = toggle.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        panel.style.setProperty("--lg-filters-top", `${toggleRect.bottom - pageRect.top + 4}px`);
        panel.style.setProperty("--lg-filters-left", `${toggleRect.left - pageRect.left}px`);
    }

    function setupFiltersDropdown() {
        unwrapMetaRow();

        const page = document.getElementById("results-page");
        const panel = document.getElementById("tools-panel");
        const toggle = document.getElementById("tools-toggle");
        const toolsBar = document.getElementById("tools-bar");
        if (!page || !panel || !toggle) return;

        relabelFiltersToggle(toggle);
        panel.classList.remove("lg-tools-inline");
        panel.classList.add("lg-filters-dropdown");
        toolsBar?.classList.add("lg-filters-wrap");

        positionFiltersPanel(panel, toggle, page);

        if (toggle.dataset.lgFiltersWired === "1") return;
        toggle.dataset.lgFiltersWired = "1";

        toggle.addEventListener("click", () => {
            requestAnimationFrame(() => positionFiltersPanel(panel, toggle, page));
        });
        window.addEventListener("resize", () => positionFiltersPanel(panel, toggle, page));
        window.addEventListener(
            "scroll",
            () => positionFiltersPanel(panel, toggle, page),
            true,
        );
        new MutationObserver(() => positionFiltersPanel(panel, toggle, page)).observe(panel, {
            attributes: true,
            attributeFilter: ["style", "class"],
        });
    }

    function scheduleFiltersDropdown() {
        if (filtersFrame) return;
        filtersFrame = requestAnimationFrame(() => {
            filtersFrame = 0;
            setupFiltersDropdown();
        });
    }

    scheduleFiltersDropdown();
    window.addEventListener("degoog-results-ready", scheduleFiltersDropdown);

    const page = document.getElementById("results-page");
    if (page) {
        new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (
                        node.id === "tools-panel" ||
                        node.id === "tools-toggle" ||
                        node.id === "lg-meta-row" ||
                        node.querySelector?.("#tools-panel, #tools-toggle, #lg-meta-row")
                    ) {
                        scheduleFiltersDropdown();
                        return;
                    }
                }
            }
        }).observe(page, { childList: true, subtree: true });
    }
})();

/* ── 5. Media-preview (mp2) bar enhancements ────────────────────────────── */
(() => {
    let toastTimer = null;

    function showToast(msg) {
        const el = document.getElementById("mp2-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("mp2-toast--visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.classList.remove("mp2-toast--visible");
        }, 2500);
    }

    function fallbackCopy(text) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand("copy");
        } catch (e) {}
        document.body.removeChild(ta);
    }

    function syncMeta(panel) {
        const info = panel.querySelector("#media-preview-info");
        if (!info) return;
        const link = info.querySelector(".media-preview-link");
        if (!link?.href) return;
        const favicon = panel.querySelector("#mp2-favicon");
        const host = panel.querySelector("#mp2-host");
        try {
            const parsed = new URL(link.href);
            const hostname = parsed.hostname;
            if (host) host.textContent = hostname;
            if (favicon) {
                favicon.src = `${parsed.origin}/favicon.ico`;
                favicon.style.display = "block";
                favicon.onerror = () => {
                    favicon.style.display = "none";
                };
            }
        } catch (e) {}
    }

    function isVideosTabActive() {
        return !!document.querySelector(
            '#results-tabs .results-tab[data-type="videos"].active, #results-tabs .results-tab[data-type="videos"][aria-selected="true"]',
        );
    }

    function syncMp2DownloadVisibility(panel) {
        const dl = panel.querySelector("#mp2-download");
        if (!dl) return;
        if (isVideosTabActive()) {
            dl.setAttribute("hidden", "");
            dl.setAttribute("aria-hidden", "true");
        } else {
            dl.removeAttribute("hidden");
            dl.removeAttribute("aria-hidden");
        }
    }

    function bindPanel(panel) {
        if (panel.dataset.mp2 === "1") return;
        panel.dataset.mp2 = "1";

        const info = panel.querySelector("#media-preview-info");
        const dropdown = panel.querySelector("#mp2-dropdown");
        const menuBtn = panel.querySelector("#mp2-menu");
        const dlBtn = panel.querySelector("#mp2-download");
        const shareBtn = panel.querySelector("#mp2-share");

        const prevBtn = panel.querySelector("#media-preview-prev");
        if (prevBtn) {
            prevBtn.setAttribute("aria-label", getLgTranslation("prevImage"));
            prevBtn.setAttribute("title", getLgTranslation("prev"));
        }
        const nextBtn = panel.querySelector("#media-preview-next");
        if (nextBtn) {
            nextBtn.setAttribute("aria-label", getLgTranslation("nextImage"));
            nextBtn.setAttribute("title", getLgTranslation("next"));
        }
        if (menuBtn) {
            menuBtn.setAttribute("aria-label", getLgTranslation("moreOptions"));
            menuBtn.setAttribute("title", getLgTranslation("moreOptions"));
        }
        const closeBtn = panel.querySelector("#media-preview-close");
        if (closeBtn) {
            closeBtn.setAttribute("aria-label", getLgTranslation("close"));
            closeBtn.setAttribute("title", getLgTranslation("close"));
        }
        if (dlBtn) {
            const dlSvg = dlBtn.querySelector("svg");
            dlBtn.innerHTML = "";
            if (dlSvg) dlBtn.appendChild(dlSvg);
            dlBtn.appendChild(document.createTextNode(` ${getLgTranslation("download")}`));
        }
        if (shareBtn) {
            const shareSvg = shareBtn.querySelector("svg");
            shareBtn.innerHTML = "";
            if (shareSvg) shareBtn.appendChild(shareSvg);
            shareBtn.appendChild(document.createTextNode(` ${getLgTranslation("copyLink")}`));
        }

        syncMp2DownloadVisibility(panel);
        new MutationObserver(() => {
            syncMp2DownloadVisibility(panel);
        }).observe(panel, { childList: true, subtree: true });

        const tabs = document.getElementById("results-tabs");
        if (tabs) {
            new MutationObserver(() => {
                syncMp2DownloadVisibility(panel);
            }).observe(tabs, {
                attributes: true,
                subtree: true,
                attributeFilter: ["class", "aria-selected"],
            });
        }

        if (info) {
            syncMeta(panel);
            new MutationObserver(() => {
                syncMeta(panel);
            }).observe(info, { childList: true, subtree: true });
        }

        if (menuBtn && dropdown) {
            menuBtn.addEventListener("click", e => {
                e.stopPropagation();
                const open = !dropdown.hasAttribute("hidden");
                dropdown.toggleAttribute("hidden", open);
                menuBtn.setAttribute("aria-expanded", String(!open));
            });
        }

        document.addEventListener("click", () => {
            if (dropdown) {
                dropdown.setAttribute("hidden", "");
                if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
            }
        });

        if (dlBtn) {
            dlBtn.addEventListener("click", () => {
                if (dropdown) dropdown.setAttribute("hidden", "");
                const dl = info?.querySelector(".media-preview-download");
                dl?.click();
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener("click", () => {
                if (dropdown) dropdown.setAttribute("hidden", "");
                const imgEl = panel.querySelector("#media-preview-img");
                const visit = info?.querySelector(".media-preview-visit");
                let href = "";
                let toastMsg = getLgTranslation("linkCopied");
                if (isVideosTabActive()) {
                    href = visit?.href || "";
                    if (!href) {
                        const ifr = panel.querySelector("iframe");
                        const isrc = String(
                                  ifr?.getAttribute("src") || ifr?.src || "",
                              ).trim();
                        if (isrc && !/^about:blank$/i.test(isrc)) href = isrc;
                    }
                    if (!href) href = location.href;
                } else if (imgEl) {
                    const src = imgEl.currentSrc || imgEl.src || "";
                    if (src && !/^about:blank$/i.test(src)) {
                        href = src;
                        toastMsg = getLgTranslation("imageCopied");
                    }
                }
                if (!href && visit?.href) href = visit.href;
                if (!href) href = location.href;
                if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(href).then(
                        () => showToast(toastMsg),
                        () => {
                            fallbackCopy(href);
                            showToast(toastMsg);
                        },
                    );
                } else {
                    fallbackCopy(href);
                    showToast(toastMsg);
                }
            });
        }
    }

    function tryBind() {
        const panel = document.getElementById("media-preview-panel");
        if (panel?.querySelector(".mp2-bar")) bindPanel(panel);
    }

    const panel = document.getElementById("media-preview-panel");
    new MutationObserver(mutations => {
        const hasAdded = mutations.some(mutation => mutation.addedNodes.length > 0);
        if (hasAdded) tryBind();
    }).observe(panel || document.documentElement, {
        childList: true,
        subtree: true,
    });

    tryBind();
})();

/* ── 6. Immediate search-type state for theme layout ───────────────────── */
(() => {
    const TYPE_ATTR = "data-lg-search-type";
    let observedTabs = null;

    function getRoot() {
        return document.getElementById("results-page");
    }

    function normalizeType(type) {
        if (!type) return "web";
        if (type.startsWith("tab:engine:")) return type.slice(11);
        if (type.startsWith("engine:")) return type.slice(7);
        if (type.startsWith("tab:")) return type.slice(4);
        return type;
    }

    function getTypeFromTabs() {
        const active = document.querySelector(
            '#results-tabs .results-tab.active[data-type], #results-tabs .results-tab[aria-selected="true"][data-type]',
        );
        return active?.dataset.type || null;
    }

    function getTypeFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get("type") || "web";
    }

    function setSearchType(type) {
        const root = getRoot();
        if (!root) return;
        root.setAttribute(TYPE_ATTR, normalizeType(type));
    }

    function syncSearchType() {
        setSearchType(getTypeFromTabs() || getTypeFromUrl());
    }

    function bindTabsClick() {
        const tabs = document.getElementById("results-tabs");
        if (!tabs || tabs === observedTabs) return;
        observedTabs = tabs;

        tabs.addEventListener(
            "click",
            event => {
                const target = event.target;
                if (!target || typeof target.closest !== "function") return;
                const tab = target.closest(".results-tab[data-type]");
                if (!tab || !tabs.contains(tab)) return;
                setSearchType(tab.dataset.type || "web");
            },
            true,
        );

        new MutationObserver(syncSearchType).observe(tabs, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "aria-selected"],
        });
    }

    function init() {
        bindTabsClick();
        new MutationObserver(() => {
            bindTabsClick();
            syncSearchType();
        }).observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        window.addEventListener("popstate", () => {
            window.requestAnimationFrame(syncSearchType);
        });
        syncSearchType();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/* ── 7. Sidebar accordion panels (theme settings) ──────────────────────── */
(() => {
    const ENGINE_MODE_MOBILE = "data-sidebar-panels-mobile";
    const ENGINE_MODE_DESKTOP = "data-sidebar-panels-desktop";
    const RELATED_MODE_MOBILE = "data-related-searches-mobile";
    const RELATED_MODE_DESKTOP = "data-related-searches-desktop";
    const KNOWLEDGE_MODE_MOBILE = "data-knowledge-panel-mobile";
    const KNOWLEDGE_MODE_DESKTOP = "data-knowledge-panel-desktop";
    const DESKTOP_MIN = 768;
    const SEARCHING_ATTR = "data-lg-sidebar-searching";
    const USER_ATTR_ENGINE = "data-lg-sidebar-user-engine";
    const USER_ATTR_RELATED = "data-lg-sidebar-user-related";
    const USER_ATTR_KNOWLEDGE = "data-lg-sidebar-user-knowledge";
    let lastIsDesktop = null;

    function isDesktop() {
        return window.innerWidth >= DESKTOP_MIN;
    }

    function sidebarRoots() {
        return [
            document.getElementById("results-sidebar"),
            document.getElementById("image-engine-panel"),
        ].filter(Boolean);
    }

    function isThemeEnabled() {
        const root = document.documentElement;
        return (
            root.hasAttribute(ENGINE_MODE_MOBILE) ||
            root.hasAttribute(ENGINE_MODE_DESKTOP) ||
            root.hasAttribute(RELATED_MODE_MOBILE) ||
            root.hasAttribute(RELATED_MODE_DESKTOP) ||
            root.hasAttribute(KNOWLEDGE_MODE_MOBILE) ||
            root.hasAttribute(KNOWLEDGE_MODE_DESKTOP)
        );
    }

    function isEnginePerformancePanel(accordion) {
        if (!accordion?.classList) return false;
        return (
            accordion.classList.contains("streaming-engine-panel") ||
            !!accordion.querySelector(".engine-stat-row")
        );
    }

    function isRelatedSearchesPanel(accordion) {
        if (!accordion || isEnginePerformancePanel(accordion)) return false;
        return !!accordion.querySelector(".related-search-link");
    }

    function getEnginePerformancePanels(root) {
        return [...root.querySelectorAll(".sidebar-accordion")].filter(isEnginePerformancePanel);
    }

    function getRelatedSearchesPanels(root) {
        return [...root.querySelectorAll(".sidebar-accordion")].filter(isRelatedSearchesPanel);
    }

    function isKnowledgePanel(accordion) {
        if (
            !accordion ||
            isEnginePerformancePanel(accordion) ||
            isRelatedSearchesPanel(accordion)
        ) {
            return false;
        }
        return !!accordion.querySelector(
            ".kp-title, .kp-description, .kp-image, .wiki-card",
        );
    }

    function getKnowledgePanels(root) {
        return [...root.querySelectorAll(".sidebar-accordion")].filter(isKnowledgePanel);
    }

    function syncKnowledgeAccordion(accordion) {
        if (!accordion.classList.contains("lg-sidebar-knowledge")) {
            accordion.classList.add("lg-sidebar-knowledge");
        }
        if (accordion.hasAttribute(USER_ATTR_KNOWLEDGE)) return;
        const shouldBeOpen = getKnowledgeMode() === "open";
        if (accordion.classList.contains("open") !== shouldBeOpen) {
            accordion.classList.toggle("open", shouldBeOpen);
        }
    }

    function normalizeEngineMode(raw) {
        if (raw === "open" || raw === "collapsed" || raw === "collapse-on-complete") {
            return raw;
        }
        return "collapsed";
    }

    function getEngineMode() {
        const attr = isDesktop() ? ENGINE_MODE_DESKTOP : ENGINE_MODE_MOBILE;
        return normalizeEngineMode(document.documentElement.getAttribute(attr) || "collapsed");
    }

    function getRelatedMode() {
        const attr = isDesktop() ? RELATED_MODE_DESKTOP : RELATED_MODE_MOBILE;
        const fallback = isDesktop() ? "open" : "collapsed";
        const raw = document.documentElement.getAttribute(attr) || fallback;
        return raw === "open" ? "open" : "collapsed";
    }

    function getKnowledgeMode() {
        const attr = isDesktop() ? KNOWLEDGE_MODE_DESKTOP : KNOWLEDGE_MODE_MOBILE;
        const fallback = isDesktop() ? "open" : "collapsed";
        const raw = document.documentElement.getAttribute(attr) || fallback;
        return raw === "open" ? "open" : "collapsed";
    }

    function getMetaText() {
        const meta = document.getElementById("results-meta");
        return meta ? meta.textContent || "" : "";
    }

    function isMetaStreaming(text) {
        return /streaming/i.test(text);
    }

    function isMetaSearching(text) {
        return /^searching/i.test(text.trim());
    }

    function isMetaComplete(text) {
        if (!text.trim() || isMetaStreaming(text) || isMetaSearching(text)) {
            return false;
        }
        return /results/i.test(text) && /seconds?\)/i.test(text);
    }

    function isSearching() {
        if (document.documentElement.hasAttribute(SEARCHING_ATTR)) return true;
        return isMetaStreaming(getMetaText());
    }

    function sidebarMutationHasRelated(nodes) {
        return nodes.some(
            node =>
                node.nodeType === 1 &&
                (node.classList?.contains("related-search-link") ||
                    !!node.querySelector?.(".related-search-link")),
        );
    }

    function shouldEngineBeOpen(mode, searching) {
        if (mode === "open") return true;
        if (mode === "collapsed") return false;
        if (mode === "collapse-on-complete") return searching;
        return false;
    }

    function syncEngineAccordion(accordion) {
        if (accordion.hasAttribute(USER_ATTR_ENGINE)) return;
        const shouldBeOpen = shouldEngineBeOpen(getEngineMode(), isSearching());
        if (accordion.classList.contains("open") !== shouldBeOpen) {
            accordion.classList.toggle("open", shouldBeOpen);
        }
    }

    function syncRelatedAccordion(accordion) {
        if (accordion.hasAttribute(USER_ATTR_RELATED)) return;
        const shouldBeOpen = getRelatedMode() === "open";
        if (accordion.classList.contains("open") !== shouldBeOpen) {
            accordion.classList.toggle("open", shouldBeOpen);
        }
    }

    function syncAll() {
        if (!isThemeEnabled()) return;
        const roots = sidebarRoots();
        if (roots.length === 0) return;
        roots.forEach(root => {
            getEnginePerformancePanels(root).forEach(syncEngineAccordion);
            getRelatedSearchesPanels(root).forEach(syncRelatedAccordion);
            getKnowledgePanels(root).forEach(syncKnowledgeAccordion);
        });
    }

    function bindRoots() {
        sidebarRoots().forEach(bindSidebar);
    }

    function scheduleSync() {
        window.requestAnimationFrame(() => {
            bindRoots();
            window.requestAnimationFrame(syncAll);
        });
        window.setTimeout(() => {
            bindRoots();
            syncAll();
        }, 0);
    }

    function markSearching() {
        document.documentElement.setAttribute(SEARCHING_ATTR, "1");
        scheduleSync();
    }

    function markComplete() {
        document.documentElement.removeAttribute(SEARCHING_ATTR);
        scheduleSync();
    }

    function clearUserOverrides() {
        sidebarRoots().forEach(root => {
            getEnginePerformancePanels(root).forEach(accordion => {
                accordion.removeAttribute(USER_ATTR_ENGINE);
            });
            getRelatedSearchesPanels(root).forEach(accordion => {
                accordion.removeAttribute(USER_ATTR_RELATED);
            });
            getKnowledgePanels(root).forEach(accordion => {
                accordion.removeAttribute(USER_ATTR_KNOWLEDGE);
            });
        });
    }

    function onSearchStart() {
        clearUserOverrides();
        markSearching();
    }

    function nodeStartsSearch(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
            node.classList?.contains("skeleton-results") ||
            node.classList?.contains("skeleton-card") ||
            node.classList?.contains("skeleton-sidebar") ||
            node.classList?.contains("streaming-engine-panel") ||
            !!node.querySelector?.(
                ".skeleton-results, .skeleton-card, .skeleton-sidebar, .streaming-engine-panel",
            )
        );
    }

    function bindSidebar(root) {
        if (!root || root.hasAttribute("data-lg-sidebar-bound")) return;
        root.setAttribute("data-lg-sidebar-bound", "1");

        root.addEventListener(
            "click",
            event => {
                const target = event.target;
                if (!target || typeof target.closest !== "function") return;
                const toggle = target.closest(".sidebar-accordion-toggle");
                if (!toggle || !root.contains(toggle)) return;
                const accordion = toggle.closest(".sidebar-accordion");
                if (!accordion) return;
                if (isEnginePerformancePanel(accordion)) {
                    accordion.setAttribute(USER_ATTR_ENGINE, "1");
                } else if (isRelatedSearchesPanel(accordion)) {
                    accordion.setAttribute(USER_ATTR_RELATED, "1");
                } else if (isKnowledgePanel(accordion)) {
                    accordion.setAttribute(USER_ATTR_KNOWLEDGE, "1");
                }
            },
            true,
        );

        new MutationObserver(mutations => {
            const relatedAdded = mutations.some(mutation =>
                sidebarMutationHasRelated([...mutation.addedNodes]),
            );
            scheduleSync();
            if (relatedAdded && getRelatedMode() === "open") {
                window.setTimeout(syncAll, 0);
                window.setTimeout(syncAll, 50);
            }
        }).observe(root, {
            childList: true,
            subtree: true,
        });
    }

    function observeSearchLifecycle() {
        const resultsList = document.getElementById("results-list");
        if (resultsList) {
            new MutationObserver(mutations => {
                const started = mutations.some(mutation =>
                    [...mutation.addedNodes].some(nodeStartsSearch),
                );
                if (started) onSearchStart();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        const meta = document.getElementById("results-meta");
        if (meta) {
            new MutationObserver(() => {
                const text = getMetaText();
                if (isMetaStreaming(text) || isMetaSearching(text)) {
                    markSearching();
                } else if (isMetaComplete(text)) {
                    markComplete();
                }
            }).observe(meta, { childList: true, characterData: true, subtree: true });
        }

        window.addEventListener("degoog-results-ready", markComplete);

        const searchBtn = document.getElementById("results-search-btn");
        searchBtn?.addEventListener("click", onSearchStart);

        const searchInput = document.getElementById("results-search-input");
        searchInput?.addEventListener("keydown", event => {
            if (event.key === "Enter") onSearchStart();
        });
    }

    function init() {
        if (!isThemeEnabled()) return;
        lastIsDesktop = isDesktop();
        bindRoots();
        new MutationObserver(mutations => {
            const shouldRebind = mutations.some(mutation =>
                [...mutation.addedNodes].some(
                    node =>
                        node.nodeType === 1 &&
                        (node.id === "results-sidebar" ||
                            node.id === "image-engine-panel" ||
                            !!node.querySelector?.(
                                "#results-sidebar, #image-engine-panel",
                            )),
                ),
            );
            if (shouldRebind) scheduleSync();
        }).observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
        observeSearchLifecycle();
        window.addEventListener("resize", () => {
            const nowDesktop = isDesktop();
            if (nowDesktop === lastIsDesktop) return;
            lastIsDesktop = nowDesktop;
            clearUserOverrides();
            scheduleSync();
        });
        scheduleSync();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/* ── 8. Translate settings gear title ───────────────────────────────────── */
(() => {
    function translateSettingsGear() {
        const settingsEl = document.getElementById("nav-settings-results");
        if (settingsEl) {
            settingsEl.setAttribute("title", getLgTranslation("settings"));
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", translateSettingsGear);
    } else {
        translateSettingsGear();
    }
})();
