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
