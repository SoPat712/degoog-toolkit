/*
 * LiterallyGoogle — search-page behaviour bundle
 *
 * Loaded by search.html. Each IIFE is self-contained and uses MutationObservers
 * so it stays valid across client-side DOM updates.
 */

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

/* ── 4. Google-style degooooooog pagination ────────────────────────────── */
(function () {
    var ENHANCED_ATTR = "data-lg-pager-enhanced";

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

    function enhancePagination() {
        var pagination = document.getElementById("pagination");
        if (!pagination || pagination.hasAttribute(ENHANCED_ATTR)) return;
        if (pagination.querySelector(":scope > .lg-pager")) return;
        var pageNodes = getPageNodes(pagination);
        if (pageNodes.length < 2) return;

        var controls = classifyControls(pageNodes);
        pagination.setAttribute(ENHANCED_ATTR, "1");

        var root = document.createElement("nav");
        root.className = "lg-pager";
        root.setAttribute("aria-label", "Search result pages");

        var prevWrap = document.createElement("div");
        prevWrap.className = "lg-pager-side lg-pager-side--prev";
        prevWrap.appendChild(decorateControl(controls.prev, "prev", "Previous"));

        var center = document.createElement("div");
        center.className = "lg-pager-center";

        var wordmark = document.createElement("div");
        wordmark.className = "lg-pager-wordmark";
        [
            ["d", "lg-pager-blue"],
            ["e", "lg-pager-red"],
            ["g", "lg-pager-yellow"],
            ["o", "lg-pager-blue"],
            ["o", "lg-pager-green"],
            ["o", "lg-pager-red"],
            ["o", "lg-pager-yellow"],
            ["o", "lg-pager-blue"],
            ["o", "lg-pager-green"],
            ["o", "lg-pager-red"],
            ["g", "lg-pager-blue"],
        ].forEach(function (part) {
            wordmark.appendChild(makeLetter(part[0], part[1]));
        });

        var numberRow = document.createElement("div");
        numberRow.className = "lg-pager-pages";
        controls.pages.forEach(function (item) {
            var node = item.node;
            node.classList.add("lg-pager-page");
            node.classList.toggle("lg-pager-page--active", item.page === controls.activePage);
            node.textContent = String(item.page);
            numberRow.appendChild(node);
        });

        center.appendChild(wordmark);
        center.appendChild(numberRow);

        var nextWrap = document.createElement("div");
        nextWrap.className = "lg-pager-side lg-pager-side--next";
        nextWrap.appendChild(decorateControl(controls.next, "next", "Next"));

        root.appendChild(prevWrap);
        root.appendChild(center);
        root.appendChild(nextWrap);
        pagination.replaceChildren(root);
    }

    function observePagination() {
        var pagination = document.getElementById("pagination");
        if (!pagination) return;
        new MutationObserver(function () {
            if (pagination.querySelector(":scope > .lg-pager")) return;
            pagination.removeAttribute(ENHANCED_ATTR);
            window.requestAnimationFrame(enhancePagination);
        }).observe(pagination, { childList: true, subtree: false });
        enhancePagination();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observePagination);
    } else {
        observePagination();
    }
})();

/* ── 2. Move spell-check notices into #results-meta ─────────────────────── */
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

/* ── 3. Media-preview (mp2) bar enhancements ────────────────────────────── */
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
                var toastMsg = "Link copied!";
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
                        toastMsg = "Image link copied!";
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
