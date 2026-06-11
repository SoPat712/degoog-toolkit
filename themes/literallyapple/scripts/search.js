/*
 * LiterallyApple — search-page behaviour bundle
 *
 * Loaded by search.html. Each IIFE is self-contained and uses MutationObservers
 * so it stays valid across client-side DOM updates.
 */

var LA_LANG_DICT = {
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

function getLaTranslation(key) {
    var attrName = "data-t-" + key.replace(/([A-Z])/g, "-$1").toLowerCase();
    var el = document.getElementById("results-page");
    return (el && el.getAttribute(attrName)) || LA_LANG_DICT["en"][key] || key;
}

/* ── 1. Sticky header scroll shadow ─────────────────────────────────────── */
(function () {
    var header = document.getElementById("results-header");
    if (!header) return;
    window.addEventListener(
        "scroll",
        function () {
            header.classList.toggle("scrolled", window.scrollY > 50);
        },
        { passive: true },
    );
})();

/* ── 2. Google-style degooooooog pagination ────────────────────────────── */
(function () {
    var ENHANCED_ATTR = "data-la-pager-enhanced";

    function getPageNumber(node) {
        var raw = node.getAttribute("data-page") || node.textContent || "";
        var page = parseInt(String(raw).trim(), 10);
        return Number.isFinite(page) && page > 0 ? page : null;
    }

    function getPageNodes(pagination) {
        return Array.prototype.slice
            .call(pagination.querySelectorAll("[data-page]"))
            .concat(Array.prototype.slice.call(pagination.querySelectorAll(".pagination-current")))
            .filter(function (node) {
                return getPageNumber(node) !== null;
            });
    }

    function isActivePage(node) {
        return (
            node.classList.contains("pagination-current") ||
            node.classList.contains("active") ||
            node.classList.contains("current") ||
            node.classList.contains("selected") ||
            node.getAttribute("aria-current") === "page" ||
            node.disabled === true
        );
    }

    function classifyControls(nodes) {
        var pages = nodes
            .map(function (node) {
                return { node: node, page: getPageNumber(node) };
            })
            .filter(function (item) {
                return item.page !== null;
            })
            .sort(function (a, b) {
                return a.page - b.page;
            });
        var active = pages.find(function (item) {
            return isActivePage(item.node);
        });
        var activePage = active ? active.page : (pages[0] && pages[0].page) || 1;
        var prev = null;
        var next = null;

        pages.forEach(function (item) {
            if (item.page < activePage && (!prev || item.page > prev.page)) {
                prev = item;
            }
            if (item.page > activePage && (!next || item.page < next.page)) {
                next = item;
            }
        });

        return { pages: pages, activePage: activePage, prev: prev, next: next };
    }

    var RESULTS_PER_PAGE_HINT = 10;

    function getResultCount() {
        var list = document.getElementById("results-list");
        if (!list) return -1;
        if (list.querySelector(".no-results")) return 0;
        return list.querySelectorAll(".degoog-result").length;
    }

    function isOptimisticMaxPageStrip(pageNodes) {
        if (pageNodes.length !== 10) return false;
        var pages = pageNodes
            .map(getPageNumber)
            .filter(function (page) {
                return page !== null;
            })
            .sort(function (a, b) {
                return a - b;
            });
        if (pages.length !== 10) return false;
        for (var i = 0; i < 10; i++) {
            if (pages[i] !== i + 1) return false;
        }
        return true;
    }

    function shouldShowPagination(pagination) {
        var pageNodes = getPageNodes(pagination);
        if (pageNodes.length < 2) return false;

        var resultCount = getResultCount();
        var activePage = classifyControls(pageNodes).activePage;

        if (resultCount === 0 && activePage === 1) return false;

        // Degoog renders a 1–10 link strip even when only one page of results exists.
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
        var span = document.createElement("span");
        span.className = "lg-pager-letter " + className;
        span.textContent = char;
        return span;
    }

    function makeControlElement(kind, label) {
        var span = document.createElement("span");
        span.className = "lg-pager-control lg-pager-control--" + kind;
        span.innerHTML =
            '<span class="lg-pager-arrow" aria-hidden="true">' +
            (kind === "prev" ? "‹" : "›") +
            '</span><span class="lg-pager-control-label">' +
            label +
            "</span>";
        return span;
    }

    function makeDisabledControl(kind, label) {
        var control = makeControlElement(kind, label);
        control.classList.add("lg-pager-control--disabled");
        control.setAttribute("aria-disabled", "true");
        return control;
    }

    function decorateControl(item, kind, label) {
        if (!item) return makeDisabledControl(kind, label);
        var source = item.node;
        var node = source.tagName === "A" ? document.createElement("a") : document.createElement("button");
        node.className = "lg-pager-control lg-pager-control--" + kind;
        node.setAttribute("data-page", String(item.page));
        if (node.tagName === "BUTTON") node.type = "button";
        if (node.tagName === "A" && source.getAttribute("href")) {
            node.setAttribute("href", source.getAttribute("href"));
        } else {
            node.addEventListener("click", function (event) {
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

        var controls = classifyControls(pageNodes);
        pagination.setAttribute(ENHANCED_ATTR, "1");

        var root = document.createElement("nav");
        root.className = "lg-pager";
        root.setAttribute("aria-label", "Search result pages");

        var wordmark = document.createElement("div");
        var lettersLine = document.createElement("div");
        var lettersCore = document.createElement("div");
        var oTrack = document.createElement("div");
        var prefix = document.createElement("div");
        var suffix = document.createElement("div");
        var oColors = [
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
        ].forEach(function (part) {
            prefix.appendChild(makeLetter(part[0], part[1]));
        });
        controls.pages.forEach(function (item, index) {
            var oClass =
                item.page === controls.activePage
                    ? "lg-pager-o lg-pager-o--active"
                    : "lg-pager-o " + oColors[index % oColors.length];
            oTrack.appendChild(makeLetter("o", oClass));
        });
        suffix.appendChild(makeLetter("g", "lg-pager-blue"));

        var numberRow = document.createElement("div");
        numberRow.className = "lg-pager-pages";
        controls.pages.forEach(function (item) {
            var node = item.node;
            node.classList.add("lg-pager-page");
            node.classList.toggle("lg-pager-page--active", item.page === controls.activePage);
            node.textContent = String(item.page);
            numberRow.appendChild(node);
        });

        lettersCore.appendChild(prefix);
        lettersCore.appendChild(oTrack);
        lettersCore.appendChild(suffix);
        lettersLine.appendChild(decorateControl(controls.prev, "prev", getLaTranslation("prev")));
        lettersLine.appendChild(lettersCore);
        lettersLine.appendChild(decorateControl(controls.next, "next", getLaTranslation("next")));
        wordmark.appendChild(lettersLine);
        wordmark.appendChild(numberRow);
        root.appendChild(wordmark);
        pagination.replaceChildren(root);
    }

    function syncPagination() {
        var pagination = document.getElementById("pagination");
        if (!pagination) return;

        if (!shouldShowPagination(pagination)) {
            if (pagination.childElementCount > 0) clearPagination(pagination);
            return;
        }

        if (pagination.querySelector(":scope > .lg-pager")) return;

        var pageNodes = getPageNodes(pagination);
        if (pageNodes.length < 2) {
            if (pagination.childElementCount > 0) clearPagination(pagination);
            return;
        }

        enhancePagination(pagination, pageNodes);
    }

    function observePagination() {
        var pagination = document.getElementById("pagination");
        if (!pagination) return;
        new MutationObserver(function () {
            window.requestAnimationFrame(syncPagination);
        }).observe(pagination, { childList: true, subtree: false });

        var resultsList = document.getElementById("results-list");
        if (resultsList) {
            new MutationObserver(function () {
                window.requestAnimationFrame(syncPagination);
            }).observe(resultsList, { childList: true, subtree: false });
        }

        window.addEventListener("degoog-results-ready", function () {
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
(function () {
    var SLOT_CONTAINER_IDS = [
        "slot-above-results",
        "slot-below-results",
        "slot-above-sidebar",
        "slot-below-sidebar",
    ];

    function slotContainers() {
        return SLOT_CONTAINER_IDS.map(function (id) {
            return document.getElementById(id);
        }).filter(Boolean);
    }

    function clearResultSlots() {
        slotContainers().forEach(function (container) {
            container.innerHTML = "";
        });
    }

    function fullWidthKey(panel) {
        var root = panel.querySelector(
            ":scope > .results-slot-panel-body > .slot-full-width",
        );
        if (!root) return "";
        for (var i = 0; i < root.classList.length; i += 1) {
            var className = root.classList[i];
            if (className !== "slot-full-width") return className;
        }
        return root.tagName.toLowerCase();
    }

    function dedupeFullWidthPanels(container) {
        var seen = new Map();
        var panels = Array.prototype.slice.call(
            container.querySelectorAll(":scope > .results-slot-panel"),
        );
        panels.forEach(function (panel) {
            var key = fullWidthKey(panel);
            if (!key) return;
            var previous = seen.get(key);
            if (previous && previous.isConnected) {
                previous.remove();
            }
            seen.set(key, panel);
        });
    }

    document.addEventListener(
        "click",
        function (event) {
            var target = event.target;
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

    function observeSlots() {
        slotContainers().forEach(function (container) {
            dedupeFullWidthPanels(container);
            new MutationObserver(function (mutations) {
                var shouldDedupe = mutations.some(function (mutation) {
                    return mutation.addedNodes.length > 0;
                });
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
(function () {
    function wrapResultsStats(meta) {
        if (!meta || meta.querySelector(".results-meta-stats")) return;
        for (var i = 0; i < meta.childNodes.length; i++) {
            var node = meta.childNodes[i];
            if (node.nodeType !== Node.TEXT_NODE) continue;
            var text = node.textContent.trim();
            if (!text) continue;
            var stats = document.createElement("span");
            stats.className = "results-meta-stats";
            stats.textContent = text;
            meta.replaceChild(stats, node);
            return;
        }
    }

    function moveSpellCheck() {
        var notices = document.querySelectorAll(".spell-check-notice");
        var meta = document.getElementById("results-meta");
        wrapResultsStats(meta);
        for (var i = 0; i < notices.length; i++) {
            var notice = notices[i];
            var panel = notice.closest(".results-slot-panel");
            if (meta && notice.parentNode !== meta) {
                meta.appendChild(notice);
                if (panel) panel.remove();
            }
        }
    }

    var target = document.getElementById("results-page") || document.documentElement;
    new MutationObserver(function (mutations) {
        var shouldCheck = false;
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length > 0) {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) moveSpellCheck();
    }).observe(target, {
        childList: true,
        subtree: true,
    });

    moveSpellCheck();
})();

/* ── 5. Media-preview (mp2) bar enhancements ────────────────────────────── */
(function () {
    var toastTimer = null;

    function showToast(msg) {
        var el = document.getElementById("mp2-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("mp2-toast--visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            el.classList.remove("mp2-toast--visible");
        }, 2500);
    }

    function fallbackCopy(text) {
        var ta = document.createElement("textarea");
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
        var info = panel.querySelector("#media-preview-info");
        if (!info) return;
        var link = info.querySelector(".media-preview-link");
        if (!link || !link.href) return;
        var favicon = panel.querySelector("#mp2-favicon");
        var host = panel.querySelector("#mp2-host");
        try {
            var parsed = new URL(link.href);
            var hostname = parsed.hostname;
            if (host) host.textContent = hostname;
            if (favicon) {
                favicon.src = parsed.origin + "/favicon.ico";
                favicon.style.display = "block";
                favicon.onerror = function () {
                    this.style.display = "none";
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
        var dl = panel.querySelector("#mp2-download");
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

        var info = panel.querySelector("#media-preview-info");
        var dropdown = panel.querySelector("#mp2-dropdown");
        var menuBtn = panel.querySelector("#mp2-menu");
        var dlBtn = panel.querySelector("#mp2-download");
        var shareBtn = panel.querySelector("#mp2-share");

        var prevBtn = panel.querySelector("#media-preview-prev");
        if (prevBtn) {
            prevBtn.setAttribute("aria-label", getLaTranslation("prevImage"));
            prevBtn.setAttribute("title", getLaTranslation("prev"));
        }
        var nextBtn = panel.querySelector("#media-preview-next");
        if (nextBtn) {
            nextBtn.setAttribute("aria-label", getLaTranslation("nextImage"));
            nextBtn.setAttribute("title", getLaTranslation("next"));
        }
        if (menuBtn) {
            menuBtn.setAttribute("aria-label", getLaTranslation("moreOptions"));
            menuBtn.setAttribute("title", getLaTranslation("moreOptions"));
        }
        var closeBtn = panel.querySelector("#media-preview-close");
        if (closeBtn) {
            closeBtn.setAttribute("aria-label", getLaTranslation("close"));
            closeBtn.setAttribute("title", getLaTranslation("close"));
        }
        if (dlBtn) {
            var dlSvg = dlBtn.querySelector("svg");
            dlBtn.innerHTML = "";
            if (dlSvg) dlBtn.appendChild(dlSvg);
            dlBtn.appendChild(document.createTextNode(" " + getLaTranslation("download")));
        }
        if (shareBtn) {
            var shareSvg = shareBtn.querySelector("svg");
            shareBtn.innerHTML = "";
            if (shareSvg) shareBtn.appendChild(shareSvg);
            shareBtn.appendChild(document.createTextNode(" " + getLaTranslation("copyLink")));
        }

        syncMp2DownloadVisibility(panel);
        new MutationObserver(function () {
            syncMp2DownloadVisibility(panel);
        }).observe(panel, { childList: true, subtree: true });

        var tabs = document.getElementById("results-tabs");
        if (tabs) {
            new MutationObserver(function () {
                syncMp2DownloadVisibility(panel);
            }).observe(tabs, {
                attributes: true,
                subtree: true,
                attributeFilter: ["class", "aria-selected"],
            });
        }

        if (info) {
            syncMeta(panel);
            new MutationObserver(function () {
                syncMeta(panel);
            }).observe(info, { childList: true, subtree: true });
        }

        if (menuBtn && dropdown) {
            menuBtn.addEventListener("click", function (e) {
                e.stopPropagation();
                var open = !dropdown.hasAttribute("hidden");
                dropdown.toggleAttribute("hidden", open);
                menuBtn.setAttribute("aria-expanded", String(!open));
            });
        }

        document.addEventListener("click", function () {
            if (dropdown) {
                dropdown.setAttribute("hidden", "");
                if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
            }
        });

        if (dlBtn) {
            dlBtn.addEventListener("click", function () {
                if (dropdown) dropdown.setAttribute("hidden", "");
                var dl = info && info.querySelector(".media-preview-download");
                if (dl) dl.click();
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener("click", function () {
                if (dropdown) dropdown.setAttribute("hidden", "");
                var imgEl = panel.querySelector("#media-preview-img");
                var visit = info && info.querySelector(".media-preview-visit");
                var href = "";
                 var toastMsg = getLaTranslation("linkCopied");
                if (isVideosTabActive()) {
                    href = (visit && visit.href) || "";
                    if (!href) {
                        var ifr = panel.querySelector("iframe");
                        var isrc = ifr
                            ? String(
                                  ifr.getAttribute("src") || ifr.src || "",
                              ).trim()
                            : "";
                        if (isrc && !/^about:blank$/i.test(isrc)) href = isrc;
                    }
                    if (!href) href = location.href;
                } else if (imgEl) {
                    var src = imgEl.currentSrc || imgEl.src || "";
                    if (src && !/^about:blank$/i.test(src)) {
                        href = src;
                        toastMsg = getLaTranslation("imageCopied");
                    }
                }
                if (!href && visit && visit.href) href = visit.href;
                if (!href) href = location.href;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(href).then(
                        function () {
                            showToast(toastMsg);
                        },
                        function () {
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
        var panel = document.getElementById("media-preview-panel");
        if (panel && panel.querySelector(".mp2-bar")) bindPanel(panel);
    }

    var panel = document.getElementById("media-preview-panel");
    new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes.length) {
                tryBind();
                break;
            }
        }
    }).observe(panel || document.documentElement, {
        childList: true,
        subtree: true,
    });

    tryBind();
})();

/* ── 6. Sidebar accordion panels (theme settings) ──────────────────────── */
(function () {
    var ENGINE_MODE_MOBILE = "data-sidebar-panels-mobile";
    var ENGINE_MODE_DESKTOP = "data-sidebar-panels-desktop";
    var RELATED_MODE_MOBILE = "data-related-searches-mobile";
    var RELATED_MODE_DESKTOP = "data-related-searches-desktop";
    var DESKTOP_MIN = 768;
    var SEARCHING_ATTR = "data-lg-sidebar-searching";
    var USER_ATTR_ENGINE = "data-lg-sidebar-user-engine";
    var USER_ATTR_RELATED = "data-lg-sidebar-user-related";
    var lastIsDesktop = null;

    function isDesktop() {
        return window.innerWidth >= DESKTOP_MIN;
    }

    function sidebarRoot() {
        return document.getElementById("results-sidebar");
    }

    function isThemeEnabled() {
        var root = document.documentElement;
        return (
            root.hasAttribute(ENGINE_MODE_MOBILE) ||
            root.hasAttribute(ENGINE_MODE_DESKTOP) ||
            root.hasAttribute(RELATED_MODE_MOBILE) ||
            root.hasAttribute(RELATED_MODE_DESKTOP)
        );
    }

    function isEnginePerformancePanel(accordion) {
        if (!accordion || !accordion.classList) return false;
        if (accordion.classList.contains("streaming-engine-panel")) return true;
        return !!accordion.querySelector(".engine-stat-row");
    }

    function isRelatedSearchesPanel(accordion) {
        if (!accordion || isEnginePerformancePanel(accordion)) return false;
        return !!accordion.querySelector(".related-search-link");
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

    function getEnginePerformancePanels(root) {
        return Array.prototype.slice
            .call(root.querySelectorAll(".sidebar-accordion"))
            .filter(isEnginePerformancePanel);
    }

    function getRelatedSearchesPanels(root) {
        return Array.prototype.slice
            .call(root.querySelectorAll(".sidebar-accordion"))
            .filter(isRelatedSearchesPanel);
    }

    function getKnowledgePanels(root) {
        return Array.prototype.slice
            .call(root.querySelectorAll(".sidebar-accordion"))
            .filter(isKnowledgePanel);
    }

    function normalizeEngineMode(raw) {
        if (raw === "open" || raw === "collapsed" || raw === "collapse-on-complete") {
            return raw;
        }
        return "collapsed";
    }

    function getEngineMode() {
        var attr = isDesktop() ? ENGINE_MODE_DESKTOP : ENGINE_MODE_MOBILE;
        return normalizeEngineMode(document.documentElement.getAttribute(attr) || "collapsed");
    }

    function getRelatedMode() {
        var attr = isDesktop() ? RELATED_MODE_DESKTOP : RELATED_MODE_MOBILE;
        var fallback = isDesktop() ? "open" : "collapsed";
        var raw = document.documentElement.getAttribute(attr) || fallback;
        return raw === "open" ? "open" : "collapsed";
    }

    function isSearching() {
        if (document.documentElement.hasAttribute(SEARCHING_ATTR)) return true;
        var meta = document.getElementById("results-meta");
        return !!(meta && /streaming/i.test(meta.textContent || ""));
    }

    function shouldEngineBeOpen(mode, searching) {
        if (mode === "open") return true;
        if (mode === "collapsed") return false;
        if (mode === "collapse-on-complete") return searching;
        return false;
    }

    function syncEngineAccordion(accordion) {
        if (accordion.hasAttribute(USER_ATTR_ENGINE)) return;
        accordion.classList.toggle(
            "open",
            shouldEngineBeOpen(getEngineMode(), isSearching()),
        );
    }

    function syncRelatedAccordion(accordion) {
        if (accordion.hasAttribute(USER_ATTR_RELATED)) return;
        accordion.classList.toggle("open", getRelatedMode() === "open");
    }

    function syncKnowledgePanel(accordion) {
        accordion.classList.add("open", "lg-sidebar-knowledge");
    }

    function syncAll() {
        if (!isThemeEnabled()) return;
        var root = sidebarRoot();
        if (!root) return;
        getEnginePerformancePanels(root).forEach(syncEngineAccordion);
        getRelatedSearchesPanels(root).forEach(syncRelatedAccordion);
        getKnowledgePanels(root).forEach(syncKnowledgePanel);
    }

    function scheduleSync() {
        window.requestAnimationFrame(function () {
            window.requestAnimationFrame(syncAll);
        });
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
        var root = sidebarRoot();
        if (!root) return;
        getEnginePerformancePanels(root).forEach(function (accordion) {
            accordion.removeAttribute(USER_ATTR_ENGINE);
        });
        getRelatedSearchesPanels(root).forEach(function (accordion) {
            accordion.removeAttribute(USER_ATTR_RELATED);
        });
    }

    function onSearchStart() {
        clearUserOverrides();
        markSearching();
    }

    function nodeStartsSearch(node) {
        if (!node || node.nodeType !== 1) return false;
        if (node.classList) {
            if (
                node.classList.contains("skeleton-results") ||
                node.classList.contains("skeleton-card") ||
                node.classList.contains("skeleton-sidebar") ||
                node.classList.contains("streaming-engine-panel")
            ) {
                return true;
            }
        }
        if (node.querySelector) {
            return !!node.querySelector(
                ".skeleton-results, .skeleton-card, .skeleton-sidebar, .streaming-engine-panel",
            );
        }
        return false;
    }

    function bindSidebar(root) {
        if (!root || root.hasAttribute("data-lg-sidebar-bound")) return;
        root.setAttribute("data-lg-sidebar-bound", "1");

        root.addEventListener("click", function (event) {
            var target = event.target;
            if (!target || typeof target.closest !== "function") return;
            var toggle = target.closest(".sidebar-accordion-toggle");
            if (!toggle || !root.contains(toggle)) return;
            var accordion = toggle.closest(".sidebar-accordion");
            if (!accordion) return;
            window.requestAnimationFrame(function () {
                if (isEnginePerformancePanel(accordion)) {
                    accordion.setAttribute(USER_ATTR_ENGINE, "1");
                } else if (isRelatedSearchesPanel(accordion)) {
                    accordion.setAttribute(USER_ATTR_RELATED, "1");
                }
            });
        });

        new MutationObserver(function () {
            scheduleSync();
        }).observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    function observeSearchLifecycle() {
        var resultsList = document.getElementById("results-list");
        if (resultsList) {
            new MutationObserver(function (mutations) {
                var started = mutations.some(function (mutation) {
                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        if (nodeStartsSearch(mutation.addedNodes[i])) return true;
                    }
                    return false;
                });
                if (started) onSearchStart();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        var meta = document.getElementById("results-meta");
        if (meta) {
            new MutationObserver(function () {
                var text = meta.textContent || "";
                if (/streaming/i.test(text)) {
                    markSearching();
                } else if (text.trim()) {
                    markComplete();
                }
            }).observe(meta, { childList: true, characterData: true, subtree: true });
        }

        window.addEventListener("degoog-results-ready", markComplete);

        var searchBtn = document.getElementById("results-search-btn");
        if (searchBtn) searchBtn.addEventListener("click", onSearchStart);

        var searchInput = document.getElementById("results-search-input");
        if (searchInput) {
            searchInput.addEventListener("keydown", function (event) {
                if (event.key === "Enter") onSearchStart();
            });
        }
    }

    function init() {
        if (!isThemeEnabled()) return;
        lastIsDesktop = isDesktop();
        var root = sidebarRoot();
        if (root) bindSidebar(root);
        observeSearchLifecycle();
        window.addEventListener("resize", function () {
            var nowDesktop = isDesktop();
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

/* ── 7. Translate settings gear title ───────────────────────────────────── */
(function () {
    function translateSettingsGear() {
        var settingsEl = document.getElementById("nav-settings-results");
        if (settingsEl) {
            settingsEl.setAttribute("title", getLaTranslation("settings"));
        }
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", translateSettingsGear);
    } else {
        translateSettingsGear();
    }
})();
