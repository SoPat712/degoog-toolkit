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
        prev10: "Back 10 pages",
        prevImage: "Previous image",
        next: "Next",
        next10: "Forward 10 pages",
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
    let pageClickDriver = null;
    const clientPager = {
        enabled: false,
        currentPage: 1,
        queryKey: "",
    };
    const RESULTS_PER_PAGE_HINT = 10;
    const MIN_DEGOOG_PAGES = 2;
    const MAX_DEGOOG_PAGES = 10;
    const PAGE_JUMP = MAX_DEGOOG_PAGES;

    function getSearchQueryKey() {
        return (document.getElementById("results-search-input")?.value || "").trim();
    }

    function getUrlPage() {
        const raw = new URLSearchParams(window.location.search).get("page");
        const page = parseInt(raw || "1", 10);
        return Number.isFinite(page) && page > 0 ? page : 1;
    }

    function isWebTab() {
        const page = document.getElementById("results-page");
        const layoutType = page?.getAttribute("data-lg-search-type");
        if (layoutType && layoutType !== "web") return false;
        const activeTab = document.querySelector(
            ".results-tab.active[data-type], .results-tab[aria-selected='true'][data-type]",
        );
        const tabType = activeTab?.getAttribute("data-type");
        return !tabType || tabType === "web";
    }

    function getResultItems() {
        const list = document.getElementById("results-list");
        if (!list) return [];
        return [...list.querySelectorAll(".result-item, .degoog-result")].filter(
            el => !el.classList.contains("lg-engine-filtered-out"),
        );
    }

    function shouldEnableClientPagination(resultCount) {
        if (!isWebTab()) return false;
        if (getUrlPage() > 1) return false;
        return resultCount > RESULTS_PER_PAGE_HINT;
    }

    function resetClientPagination() {
        clientPager.enabled = false;
        clientPager.currentPage = 1;
        clientPager.queryKey = "";
        document.querySelectorAll(".lg-client-page-hidden").forEach(el => {
            el.classList.remove("lg-client-page-hidden");
        });
        document.getElementById("results-list")?.removeAttribute("data-lg-client-page");
    }

    function applyClientPage(page, options = {}) {
        const items = getResultItems();
        const totalPages = Math.max(1, Math.ceil(items.length / RESULTS_PER_PAGE_HINT));
        const target = wrapPage(page, totalPages);
        const start = (target - 1) * RESULTS_PER_PAGE_HINT;
        const end = start + RESULTS_PER_PAGE_HINT;

        clientPager.enabled = true;
        clientPager.currentPage = target;
        clientPager.queryKey = getSearchQueryKey();

        items.forEach((el, index) => {
            el.classList.toggle("lg-client-page-hidden", index < start || index >= end);
        });

        document
            .getElementById("results-list")
            ?.setAttribute("data-lg-client-page", String(target));

        if (!options.preserveScroll) {
            window.scrollTo(0, 0);
        }

        if (!options.skipPagerSync) {
            window.requestAnimationFrame(syncPagination);
        }

        window.dispatchEvent(
            new CustomEvent("lg-client-page-change", {
                detail: { page: target, totalPages },
            }),
        );
    }

    function syncClientResultsPage() {
        const list = document.getElementById("results-list");
        if (!list) return;

        if (list.querySelector(".skeleton-card, .skeleton, .no-results")) {
            resetClientPagination();
            return;
        }

        const queryKey = getSearchQueryKey();
        if (clientPager.queryKey && queryKey !== clientPager.queryKey) {
            resetClientPagination();
        }

        const resultCount = getResultCount();
        if (resultCount < 0) return;

        if (!shouldEnableClientPagination(resultCount)) {
            if (clientPager.enabled) resetClientPagination();
            return;
        }

        if (!clientPager.enabled) {
            applyClientPage(1, { skipPagerSync: true, preserveScroll: true });
            return;
        }

        applyClientPage(clientPager.currentPage, {
            skipPagerSync: true,
            preserveScroll: true,
        });
    }

    function buildClientControls(totalPages, activePage) {
        const pages = [];
        for (let page = 1; page <= totalPages; page += 1) {
            pages.push({ page, node: null });
        }
        return {
            pages,
            activePage,
            prev: activePage > 1 ? { page: activePage - 1, node: null } : null,
            next: activePage < totalPages ? { page: activePage + 1, node: null } : null,
        };
    }

    function usesClientPagination(resultCount) {
        return clientPager.enabled || shouldEnableClientPagination(resultCount);
    }

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

    function getResultCount() {
        const list = document.getElementById("results-list");
        if (!list) return -1;
        if (list.querySelector(".no-results")) return 0;
        return list.querySelectorAll(
            ".result-item:not(.lg-engine-filtered-out), .degoog-result:not(.lg-engine-filtered-out)",
        ).length;
    }

    function isOptimisticMaxPageStrip(pageNodes) {
        if (pageNodes.length !== MAX_DEGOOG_PAGES) return false;
        const pages = pageNodes
            .map(getPageNumber)
            .filter(page => page !== null)
            .sort((a, b) => a - b);
        if (pages.length !== MAX_DEGOOG_PAGES) return false;
        return pages.every((page, i) => page === i + 1);
    }

    function wrapPage(page, totalPages) {
        if (totalPages < 1) return Math.max(1, page);
        return ((page - 1) % totalPages + totalPages) % totalPages + 1;
    }

    function resolveTotalPages(pageNodes, resultCount, activePage, hasNext, storedTotal) {
        let total = storedTotal || 0;

        if (pageNodes.length < MIN_DEGOOG_PAGES && total < MIN_DEGOOG_PAGES) {
            if (resultCount === 0 && activePage === 1) return 0;
            if (pageNodes.length === 0) return 0;
        }

        if (isOptimisticMaxPageStrip(pageNodes)) {
            if (activePage === 1 && resultCount < RESULTS_PER_PAGE_HINT) return 0;
            if (activePage === 1) {
                total = Math.max(total, Math.ceil(resultCount / RESULTS_PER_PAGE_HINT));
            }
            if (hasNext) total = Math.max(total, activePage + 1);
            total = Math.max(total, activePage);
        } else if (pageNodes.length > 0) {
            const listedMax = Math.max(
                ...pageNodes.map(getPageNumber).filter(page => page !== null),
            );
            total = Math.max(total, listedMax, pageNodes.length);
        }

        total = Math.max(total, activePage);
        return total < MIN_DEGOOG_PAGES ? 0 : total;
    }

    function resolveVisibleOCount(totalPages) {
        return Math.max(MIN_DEGOOG_PAGES, Math.min(MAX_DEGOOG_PAGES, totalPages));
    }

    function buildDisplayPages(controls, totalPages) {
        const visibleCount = resolveVisibleOCount(totalPages);
        const activePage = controls.activePage;
        const activeOIndex = (activePage - 1) % visibleCount;
        const windowStart = Math.floor((activePage - 1) / visibleCount) * visibleCount + 1;
        const loops = totalPages > MAX_DEGOOG_PAGES;
        const displayPages = [];

        for (let i = 0; i < visibleCount; i++) {
            const page = loops
                ? wrapPage(windowStart + i, totalPages)
                : windowStart + i;
            const existing = controls.pages.find(item => item.page === page);
            displayPages.push({
                page,
                node: existing?.node || null,
                oActive: i === activeOIndex,
            });
        }

        return { displayPages, visibleCount };
    }

    function rememberPageClickDriver(pageNodes) {
        for (const node of pageNodes) {
            if (!isActivePage(node)) {
                pageClickDriver = node;
                return;
            }
        }
        if (pageNodes[0]) pageClickDriver = pageNodes[0];
    }

    function navigateToPage(targetPage) {
        const resultCount = getResultCount();
        if (usesClientPagination(resultCount)) {
            applyClientPage(targetPage);
            return;
        }

        const pagination = document.getElementById("pagination");
        if (!pagination) return;

        const existing = pagination.querySelector(
            `[data-page="${targetPage}"]:not(.lg-pager-control)`,
        );
        if (existing) {
            existing.click();
            return;
        }

        if (pageClickDriver) {
            const probe = pageClickDriver.cloneNode(false);
            probe.setAttribute("data-page", String(targetPage));
            if (pageClickDriver.className) probe.className = pageClickDriver.className;
            probe.textContent = String(targetPage);
            pagination.appendChild(probe);
            probe.click();
            probe.remove();
            return;
        }

        const input = document.getElementById("results-search-input");
        const query = input?.value?.trim();
        if (!query) return;

        const url = new URL(window.location.href);
        url.searchParams.set("q", query);
        if (targetPage > 1) url.searchParams.set("page", String(targetPage));
        else url.searchParams.delete("page");

        const activeTab = document.querySelector(
            ".results-tab.active[data-type], .results-tab[aria-selected='true'][data-type]",
        );
        const type = activeTab?.getAttribute("data-type");
        if (type && type !== "web") url.searchParams.set("type", type);
        else url.searchParams.delete("type");

        window.location.assign(url.toString());
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

    const CONTROL_ARROWS = {
        prev: "‹",
        next: "›",
        prev10: "‹‹",
        next10: "››",
    };

    function makeControlElement(kind, label) {
        const span = document.createElement("span");
        span.className = `lg-pager-control lg-pager-control--${kind}`;
        span.innerHTML =
            `<span class="lg-pager-arrow" aria-hidden="true">${CONTROL_ARROWS[kind] || ""}</span>` +
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
        const node = document.createElement("button");
        node.type = "button";
        node.className = `lg-pager-control lg-pager-control--${kind}`;
        node.setAttribute("data-page", String(item.page));
        node.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            navigateToPage(item.page);
        });
        node.innerHTML = makeControlElement(kind, label).innerHTML;
        return node;
    }

    function decorateJumpControl(kind, delta, activePage, totalPages, label) {
        const targetPage = wrapPage(activePage + delta, totalPages);
        const node = document.createElement("button");
        node.type = "button";
        node.className = `lg-pager-control lg-pager-control--${kind}`;
        node.setAttribute("data-lg-jump-to", String(targetPage));
        node.setAttribute("aria-label", label);
        node.innerHTML = makeControlElement(kind, "").innerHTML;
        node.addEventListener("click", event => {
            event.preventDefault();
            navigateToPage(targetPage);
        });
        return node;
    }

    function renderOPages(oTrack, displayPages) {
        oTrack.replaceChildren();
        for (const item of displayPages) {
            const oClass = item.oActive
                ? "lg-pager-o lg-pager-o--active"
                : "lg-pager-o";
            oTrack.appendChild(makeLetter("o", oClass));
        }
    }

    function renderNumberRow(numberRow, displayPages, activePage) {
        numberRow.replaceChildren();
        for (const item of displayPages) {
            let node = item.node;
            if (!node) {
                node = document.createElement("button");
                node.type = "button";
                node.className = "lg-pager-page";
                node.setAttribute("data-page", String(item.page));
                node.addEventListener("click", event => {
                    event.preventDefault();
                    navigateToPage(item.page);
                });
            } else {
                node.classList.add("lg-pager-page");
            }
            node.classList.toggle("lg-pager-page--active", item.page === activePage);
            node.textContent = String(item.page);
            numberRow.appendChild(node);
        }
    }

    function syncJumpControls(lettersLine, controls, totalPages) {
        const showJump = totalPages > MAX_DEGOOG_PAGES;
        for (const [kind, delta, key] of [
            ["prev10", -PAGE_JUMP, "prev10"],
            ["next10", PAGE_JUMP, "next10"],
        ]) {
            const selector = `.lg-pager-control--${kind}`;
            const existing = lettersLine.querySelector(selector);
            if (!showJump) {
                existing?.remove();
                continue;
            }
            const control = decorateJumpControl(
                kind,
                delta,
                controls.activePage,
                totalPages,
                getLgTranslation(key),
            );
            if (existing) existing.replaceWith(control);
            else if (kind === "prev10") lettersLine.insertBefore(control, lettersLine.firstChild);
            else lettersLine.appendChild(control);
        }
    }

    function updatePager(pager, displayPages, controls, visibleCount, totalPages) {
        pager.dataset.lgPageCount = String(visibleCount);
        pager.dataset.lgTotalPages = String(totalPages);
        pager.dataset.lgActivePage = String(controls.activePage);

        const wordmark = pager.querySelector(".lg-pager-wordmark");
        wordmark?.style.setProperty("--lg-pager-page-count", String(visibleCount));

        renderOPages(pager.querySelector(".lg-pager-o-track"), displayPages);
        renderNumberRow(pager.querySelector(".lg-pager-pages"), displayPages, controls.activePage);

        const lettersLine = pager.querySelector(".lg-pager-letters-line");
        if (!lettersLine) return;
        lettersLine.querySelector(".lg-pager-control--prev")?.replaceWith(
            decorateControl(controls.prev, "prev", getLgTranslation("prev")),
        );
        lettersLine.querySelector(".lg-pager-control--next")?.replaceWith(
            decorateControl(controls.next, "next", getLgTranslation("next")),
        );
        syncJumpControls(lettersLine, controls, totalPages);
    }

    function enhancePagination(pagination, pageNodes, displayPages, controls, visibleCount, totalPages) {
        if (!pagination) return;
        if (pagination.querySelector(":scope > .lg-pager")) return;

        pagination.setAttribute(ENHANCED_ATTR, "1");

        const root = document.createElement("nav");
        root.className = "lg-pager";
        root.dataset.lgPageCount = String(visibleCount);
        root.dataset.lgTotalPages = String(totalPages);
        root.dataset.lgActivePage = String(controls.activePage);
        root.setAttribute("aria-label", "Search result pages");

        const wordmark = document.createElement("div");
        const lettersLine = document.createElement("div");
        const lettersCore = document.createElement("div");
        const oTrack = document.createElement("div");
        const prefix = document.createElement("div");
        const suffix = document.createElement("div");

        wordmark.className = "lg-pager-wordmark";
        wordmark.style.setProperty("--lg-pager-page-count", String(visibleCount));
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
        renderOPages(oTrack, displayPages);
        suffix.appendChild(makeLetter("g", "lg-pager-blue"));

        const numberRow = document.createElement("div");
        numberRow.className = "lg-pager-pages";
        renderNumberRow(numberRow, displayPages, controls.activePage);

        lettersCore.appendChild(prefix);
        lettersCore.appendChild(oTrack);
        lettersCore.appendChild(suffix);
        if (totalPages > MAX_DEGOOG_PAGES) {
            lettersLine.appendChild(
                decorateJumpControl(
                    "prev10",
                    -PAGE_JUMP,
                    controls.activePage,
                    totalPages,
                    getLgTranslation("prev10"),
                ),
            );
        }
        lettersLine.appendChild(decorateControl(controls.prev, "prev", getLgTranslation("prev")));
        lettersLine.appendChild(lettersCore);
        lettersLine.appendChild(decorateControl(controls.next, "next", getLgTranslation("next")));
        if (totalPages > MAX_DEGOOG_PAGES) {
            lettersLine.appendChild(
                decorateJumpControl(
                    "next10",
                    PAGE_JUMP,
                    controls.activePage,
                    totalPages,
                    getLgTranslation("next10"),
                ),
            );
        }
        wordmark.appendChild(lettersLine);
        wordmark.appendChild(numberRow);
        root.appendChild(wordmark);
        pagination.replaceChildren(root);
    }

    function syncPagination() {
        const pagination = document.getElementById("pagination");
        if (!pagination) return;

        syncClientResultsPage();

        const resultCount = getResultCount();
        const clientMode = usesClientPagination(resultCount);
        const coreWrapper = pagination.querySelector(":scope > .pagination");
        const pageNodes = coreWrapper ? getPageNodes(coreWrapper) : getPageNodes(pagination);
        if (pageNodes.length > 0) rememberPageClickDriver(pageNodes);

        let controls;
        let totalPages;
        const existing = pagination.querySelector(":scope > .lg-pager");
        const storedTotal = existing
            ? parseInt(existing.dataset.lgTotalPages || existing.dataset.lgPageCount || "0", 10)
            : 0;

        if (clientMode) {
            totalPages = Math.max(MIN_DEGOOG_PAGES, Math.ceil(resultCount / RESULTS_PER_PAGE_HINT));
            controls = buildClientControls(totalPages, clientPager.currentPage);
        } else {
            controls = classifyControls(pageNodes);
            totalPages = resolveTotalPages(
                pageNodes,
                resultCount,
                controls.activePage,
                Boolean(controls.next),
                storedTotal,
            );
        }

        if (totalPages < MIN_DEGOOG_PAGES) {
            if (pagination.childElementCount > 0) clearPagination(pagination);
            return;
        }

        const { displayPages, visibleCount } = buildDisplayPages(controls, totalPages);

        if (existing) {
            const prevCount = parseInt(existing.dataset.lgPageCount || "0", 10);
            const prevTotal = parseInt(existing.dataset.lgTotalPages || "0", 10);
            const prevActive = parseInt(existing.dataset.lgActivePage || "0", 10);
            if (
                prevCount === visibleCount &&
                prevTotal === totalPages &&
                prevActive === controls.activePage
            ) {
                return;
            }
            updatePager(existing, displayPages, controls, visibleCount, totalPages);
            return;
        }

        if (!clientMode && !coreWrapper && pageNodes.length < MIN_DEGOOG_PAGES) return;

        enhancePagination(
            pagination,
            pageNodes,
            displayPages,
            controls,
            visibleCount,
            totalPages,
        );
    }

    function interceptPaginationClicks(event) {
        const target = event.target;
        if (!target || typeof target.closest !== "function") return;
        const link = target.closest("#pagination [data-page]");
        if (!link || link.classList.contains("lg-pager-control")) return;

        const page = getPageNumber(link);
        if (!page) return;

        const resultCount = getResultCount();
        if (!usesClientPagination(resultCount)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        applyClientPage(page);
    }

    function observePagination() {
        const pagination = document.getElementById("pagination");
        if (!pagination) return;

        if (!window._lgClientPagerClickBound) {
            window._lgClientPagerClickBound = true;
            document.addEventListener("click", interceptPaginationClicks, true);
        }

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
        window.addEventListener("lg-results-layout-changed", () => {
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

    function syncCustomDateMenuState(panel) {
        panel.querySelectorAll(".tools-field-menu").forEach(menu => {
            const customDate = menu.querySelector(".tools-custom-date");
            if (!customDate) return;
            const visible =
                customDate.style.display !== "none" && !customDate.hidden;
            menu.classList.toggle("lg-custom-date-open", visible);
        });
    }

    function wireCustomDateMenuState(panel) {
        if (panel.dataset.lgCustomDateWired === "1") return;
        panel.dataset.lgCustomDateWired = "1";
        panel.querySelectorAll(".tools-custom-date").forEach(customDate => {
            new MutationObserver(() => syncCustomDateMenuState(panel)).observe(
                customDate,
                { attributes: true, attributeFilter: ["style", "hidden", "class"] },
            );
        });
        syncCustomDateMenuState(panel);
    }

    function positionFiltersPanel(panel, toggle, page) {
        if (panel.style.display === "none") return;
        const toggleRect = toggle.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        panel.style.setProperty("--lg-filters-top", `${toggleRect.bottom - pageRect.top + 4}px`);
        panel.style.setProperty("--lg-filters-left", `${toggleRect.left - pageRect.left}px`);
    }

    function ensureFiltersClosed(panel, toggle) {
        if (!panel || !toggle) return;
        panel.style.display = "none";
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        panel.querySelectorAll(".tools-field-menu").forEach(menu => {
            menu.style.display = "none";
        });
        panel.querySelectorAll('.tools-field-toggle[aria-expanded="true"]').forEach(btn => {
            btn.setAttribute("aria-expanded", "false");
        });
        try {
            localStorage.setItem("degoog-tools-open", "false");
        } catch {
            /* ignore */
        }
    }

    function ensureFiltersClosedAfterCore(panel, toggle) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => ensureFiltersClosed(panel, toggle));
        });
    }

    function closeFiltersDropdown(panel, toggle) {
        if (!panel || !toggle || panel.style.display === "none") return;
        window.dispatchEvent(new Event("degoog-tools-close"));
        ensureFiltersClosed(panel, toggle);
    }

    function wireFiltersDismiss(panel, toggle) {
        if (panel.dataset.lgFiltersDismissWired === "1") return;
        panel.dataset.lgFiltersDismissWired = "1";

        document.addEventListener("click", event => {
            if (panel.style.display === "none") return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (panel.contains(target) || toggle.contains(target)) return;
            closeFiltersDropdown(panel, toggle);
        });
    }

    function wireFiltersHover(panel) {
        if (panel.dataset.lgFiltersHoverWired === "1") return;
        panel.dataset.lgFiltersHoverWired = "1";

        panel.addEventListener("mouseover", e => {
            if (panel.style.display === "none") return;
            const field = e.target.closest(".tools-field");
            if (!field || !panel.contains(field)) return;
            const toggle = field.querySelector(".tools-field-toggle");
            const menuId = toggle?.getAttribute("aria-controls");
            const menu = menuId ? document.getElementById(menuId) : null;
            if (!toggle || !menu || menu.style.display === "block") return;
            toggle.click();
        });
    }

    function isBangCommandQuery(query) {
        const trimmed = query.trim();
        if (!trimmed) return false;
        return trimmed.startsWith("!") || /\s!\S+$/.test(trimmed);
    }

    function isCommandMode() {
        const input = document.getElementById("results-search-input");
        const query = input?.value ?? "";
        if (!isBangCommandQuery(query)) return false;

        const meta = document.getElementById("results-meta");
        const metaText = meta?.textContent?.trim() ?? "";
        if (metaText === "Running command...") return true;
        if (/^About \d+ results/i.test(metaText)) return false;

        const list = document.getElementById("results-list");
        if (!list) return false;

        if (list.querySelector(".loading-dots")) {
            return metaText === "Running command...";
        }

        if (list.querySelector(".command-result, .command-help-table")) return true;

        if (list.querySelector(".result-item")) return false;

        if (list.querySelector(".no-results")) return true;

        return false;
    }

    function syncFiltersVisibility(toolsBar, panel, toggle, page) {
        if (!toolsBar || !page) return;
        const commandMode = isCommandMode();
        page.classList.toggle("lg-command-mode", commandMode);
        if (commandMode) {
            closeFiltersDropdown(panel, toggle);
            return;
        }
        if (toolsBar.hidden) {
            toolsBar.hidden = false;
        }
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
        wireCustomDateMenuState(panel);
        wireFiltersHover(panel);
        syncFiltersVisibility(toolsBar, panel, toggle, page);

        if (toggle.dataset.lgFiltersWired !== "1") {
            ensureFiltersClosedAfterCore(panel, toggle);
            wireFiltersDismiss(panel, toggle);
            toggle.dataset.lgFiltersWired = "1";

            toggle.addEventListener("click", () => {
                requestAnimationFrame(() => {
                    positionFiltersPanel(panel, toggle, page);
                    syncCustomDateMenuState(panel);
                });
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
    }

    function scheduleFiltersDropdown() {
        if (filtersFrame) return;
        filtersFrame = requestAnimationFrame(() => {
            filtersFrame = 0;
            setupFiltersDropdown();
        });
    }

    function scheduleFiltersSync() {
        scheduleFiltersDropdown();
    }

    scheduleFiltersSync();
    window.addEventListener("degoog-results-ready", scheduleFiltersSync);

    const page = document.getElementById("results-page");
    if (page) {
        new MutationObserver(mutations => {
            let needsSetup = false;
            let needsVisibilitySync = false;

            for (const mutation of mutations) {
                if (
                    mutation.type === "attributes" &&
                    mutation.target instanceof Element &&
                    mutation.target.matches?.("#results-tabs .results-tab")
                ) {
                    needsVisibilitySync = true;
                    continue;
                }

                if (mutation.type !== "childList") continue;

                const target = mutation.target;
                if (
                    target instanceof Element &&
                    (target.id === "results-list" ||
                        target.id === "results-meta" ||
                        target.closest?.("#results-list, #results-meta"))
                ) {
                    needsVisibilitySync = true;
                }

                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue;
                    if (
                        node.id === "tools-panel" ||
                        node.id === "tools-toggle" ||
                        node.id === "lg-meta-row" ||
                        node.querySelector?.("#tools-panel, #tools-toggle, #lg-meta-row")
                    ) {
                        needsSetup = true;
                        break;
                    }
                }
            }

            if (needsSetup) {
                scheduleFiltersDropdown();
            } else if (needsVisibilitySync) {
                requestAnimationFrame(() => {
                    syncFiltersVisibility(
                        document.getElementById("tools-bar"),
                        document.getElementById("tools-panel"),
                        document.getElementById("tools-toggle"),
                        page,
                    );
                });
            }
        }).observe(page, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "aria-selected"],
        });
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

    function faviconUrlForOrigin(origin) {
        const page = encodeURIComponent(`${origin}/`);
        return `https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${page}&size=64`;
    }

    function tuneFavicon(favicon) {
        if (!favicon) return;
        favicon.classList.remove("mp2-favicon--fill");
        const nw = favicon.naturalWidth;
        const nh = favicon.naturalHeight;
        if (!nw || !nh) return;
        const minSide = Math.min(nw, nh);
        const maxSide = Math.max(nw, nh);
        if (minSide <= 20 && maxSide / minSide < 1.35) {
            favicon.classList.add("mp2-favicon--fill");
        }
    }

    function fitPreviewImage(panel) {
        const img = panel.querySelector("#media-preview-img");
        const wrap = panel.querySelector(".media-preview-img-wrap");
        if (!img || !wrap || img.style.display === "none") return;

        const apply = () => {
            wrap.style.removeProperty("width");
            wrap.style.removeProperty("aspect-ratio");
            img.style.removeProperty("width");
            img.style.removeProperty("height");
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            if (!nw || !nh) return;

            const body = wrap.closest(".mp2-body");
            const maxW = Math.max(120, (body?.clientWidth || wrap.clientWidth || 360) - 28);
            const maxH = Math.min(window.innerHeight * 0.56, 448);
            let w = nw;
            let h = nh;
            if (h > maxH) {
                w = (nw / nh) * maxH;
                h = maxH;
            }
            if (w > maxW) {
                h = (h / w) * maxW;
                w = maxW;
            }
            img.style.width = `${Math.max(1, Math.round(w))}px`;
            img.style.height = `${Math.max(1, Math.round(h))}px`;
        };

        if (img.complete) {
            apply();
        } else {
            img.addEventListener("load", apply, { once: true });
        }
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
                favicon.classList.remove("mp2-favicon--fill");
                favicon.src = faviconUrlForOrigin(parsed.origin);
                favicon.style.display = "block";
                favicon.onload = () => tuneFavicon(favicon);
                favicon.onerror = () => {
                    favicon.src = `${parsed.origin}/favicon.ico`;
                    favicon.onload = () => tuneFavicon(favicon);
                    favicon.onerror = () => {
                        favicon.style.display = "none";
                    };
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
            fitPreviewImage(panel);
            new MutationObserver(() => {
                syncMeta(panel);
            }).observe(info, { childList: true, subtree: true });
        }

        const previewImg = panel.querySelector("#media-preview-img");
        if (previewImg) {
            fitPreviewImage(panel);
            new MutationObserver(() => fitPreviewImage(panel)).observe(previewImg, {
                attributes: true,
                attributeFilter: ["src"],
            });
        }

        window.addEventListener("resize", () => fitPreviewImage(panel), { passive: true });

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

/* ── 5b. Fewer image columns when the preview pane is open ─────────────── */
(() => {
    const BREAKPOINTS = [
        [800, 3],
        [1100, 4],
        [1400, 5],
        [Infinity, 6],
    ];

    function columnsForWidth(width) {
        const w = Math.max(0, width);
        for (const [max, cols] of BREAKPOINTS) {
            if (w <= max) return cols;
        }
        return 3;
    }

    function isPreviewOpen() {
        return document.getElementById("media-preview-panel")?.classList.contains("open") ?? false;
    }

    function layoutWidth(grid) {
        if (isPreviewOpen()) {
            const main = grid.closest("#results-main");
            if (main?.clientWidth) return main.clientWidth;
            if (grid.clientWidth) return grid.clientWidth;
        }
        return window.innerWidth;
    }

    function pickShortestColumn(columns) {
        return columns.reduce((best, col) => {
            if (col.offsetHeight < best.offsetHeight) return col;
            if (col.offsetHeight > best.offsetHeight) return best;
            return col.children.length <= best.children.length ? col : best;
        });
    }

    function relayoutGrid(grid) {
        if (!grid?.isConnected) return;

        const width = layoutWidth(grid);
        const targetCols = columnsForWidth(width);
        const layoutKey = `${targetCols}:${Math.round(width)}`;
        if (grid.dataset.lgImageColLayout === layoutKey) return;

        const existingCols = [...grid.querySelectorAll(":scope > .image-column")];
        if (existingCols.length === targetCols) {
            grid.dataset.lgImageColLayout = layoutKey;
            return;
        }

        const items = [];
        for (const col of existingCols) {
            items.push(...col.children);
        }
        for (const child of grid.querySelectorAll(":scope > .image-card, :scope > .skeleton-media-card")) {
            items.push(child);
        }

        grid.replaceChildren();
        const columns = Array.from({ length: targetCols }, () => {
            const col = document.createElement("div");
            col.className = "image-column";
            grid.appendChild(col);
            return col;
        });
        for (const item of items) {
            pickShortestColumn(columns).appendChild(item);
        }
        grid.dataset.lgImageColLayout = layoutKey;
    }

    function runRelayout() {
        document
            .querySelectorAll("#results-list .image-grid, #results-list .skeleton-image-grid")
            .forEach(relayoutGrid);
    }

    let relayoutFrame = 0;
    function scheduleRelayout() {
        if (relayoutFrame) return;
        relayoutFrame = requestAnimationFrame(() => {
            relayoutFrame = 0;
            runRelayout();
        });
    }

    let transitionPulseTimer = 0;
    function pulseRelayoutDuringPreviewTransition() {
        clearTimeout(transitionPulseTimer);
        const start = performance.now();
        const durationMs = 420;
        const stepMs = 55;
        const tick = () => {
            runRelayout();
            if (performance.now() - start < durationMs) {
                transitionPulseTimer = setTimeout(tick, stepMs);
            } else {
                transitionPulseTimer = 0;
            }
        };
        tick();
    }

    const preview = document.getElementById("media-preview-panel");
    if (preview) {
        new MutationObserver(() => {
            scheduleRelayout();
            pulseRelayoutDuringPreviewTransition();
        }).observe(preview, {
            attributes: true,
            attributeFilter: ["class"],
        });
    }

    window.addEventListener("resize", scheduleRelayout);
    window.addEventListener("degoog-results-ready", scheduleRelayout);

    const resultsList = document.getElementById("results-list");
    if (resultsList) {
        new MutationObserver(scheduleRelayout).observe(resultsList, {
            childList: true,
            subtree: true,
        });
    }

    scheduleRelayout();
})();

/* ── 5c. Engine performance row → filter results by engine ─────────────── */
(() => {
    const FILTER_ATTR = "data-lg-engine-filter";
    const ACTIVE_CLASS = "lg-engine-stat-row--active";
    const HIDDEN_CLASS = "lg-engine-filtered-out";
    const RESULT_SELECTORS = ".result-item, .image-card, .video-card";

    function getPage() {
        return document.getElementById("results-page");
    }

    function normalizeEngine(name) {
        return (name || "").trim().toLowerCase();
    }

    function sourceMatchesEngine(source, engineName) {
        const normalized = normalizeEngine(source);
        const needle = normalizeEngine(engineName);
        if (!needle) return true;
        if (normalized === needle) return true;
        if (normalized.startsWith(`${needle}:`)) return true;

        const sourceBase = normalized.split(":")[0]?.trim();
        if (!sourceBase) return false;
        if (sourceBase === needle) return true;
        if (needle.startsWith(`${sourceBase} `)) return true;
        return sourceBase.startsWith(`${needle} `);
    }

    function enginePanelRoots() {
        return [
            document.getElementById("results-sidebar"),
            document.getElementById("image-engine-panel"),
        ].filter(Boolean);
    }

    function getSelectedEngines() {
        const raw = getPage()?.getAttribute(FILTER_ATTR);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed)
                ? parsed.map(name => String(name).trim()).filter(Boolean)
                : [];
        } catch {
            return raw.trim() ? [raw.trim()] : [];
        }
    }

    function getResultSources(el) {
        if (el.classList.contains("result-item")) {
            return [...el.querySelectorAll(".result-engine-tag")].map(tag =>
                tag.textContent.trim(),
            );
        }
        const meta = el.querySelector(".lg-result-sources");
        if (!meta) return [];
        return meta.textContent
            .split("|")
            .map(part => part.trim())
            .filter(Boolean);
    }

    function resultMatches(selectedEngines, el) {
        if (!selectedEngines.length) return true;
        return getResultSources(el).some(source =>
            selectedEngines.some(engine => sourceMatchesEngine(source, engine)),
        );
    }

    function syncRowHighlights(selectedEngines) {
        const active = new Set(selectedEngines.map(normalizeEngine));
        document.querySelectorAll(".engine-stat-row").forEach(row => {
            const rowEngine = normalizeEngine(row.querySelector(".engine-stat-label")?.textContent);
            const isActive = active.has(rowEngine);
            row.classList.toggle(ACTIVE_CLASS, isActive);
            row.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }

    function applyFilter(selectedEngines) {
        const list = document.getElementById("results-list");
        if (!list) return;
        list.querySelectorAll(RESULT_SELECTORS).forEach(el => {
            const show = resultMatches(selectedEngines, el);
            el.classList.toggle(HIDDEN_CLASS, !show);
        });
    }

    function setSelectedEngines(engines) {
        const page = getPage();
        if (!page) return;
        const unique = [];
        const seen = new Set();
        for (const engine of engines) {
            const name = String(engine || "").trim();
            if (!name) continue;
            const key = normalizeEngine(name);
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(name);
        }
        if (unique.length === 0) {
            page.removeAttribute(FILTER_ATTR);
        } else {
            page.setAttribute(FILTER_ATTR, JSON.stringify(unique));
        }
        syncRowHighlights(unique);
        applyFilter(unique);
        window.dispatchEvent(new CustomEvent("lg-results-layout-changed"));
    }

    function engineNameFromRow(row) {
        return row.querySelector(".engine-stat-label")?.textContent?.trim() || "";
    }

    function onRowActivate(row) {
        const name = engineNameFromRow(row);
        if (!name) return;
        const selected = getSelectedEngines();
        const key = normalizeEngine(name);
        const index = selected.findIndex(engine => normalizeEngine(engine) === key);
        if (index >= 0) {
            selected.splice(index, 1);
        } else {
            selected.push(name);
        }
        setSelectedEngines(selected);
    }

    function decorateRows() {
        for (const root of enginePanelRoots()) {
            root.querySelectorAll(".engine-stat-row").forEach(row => {
                row.classList.add("lg-engine-stat-row--filterable");
                if (!row.hasAttribute("role")) row.setAttribute("role", "button");
                if (!row.hasAttribute("tabindex")) row.setAttribute("tabindex", "0");
                if (!row.hasAttribute("aria-pressed")) row.setAttribute("aria-pressed", "false");
            });
        }
    }

    function rowInEnginePanel(row) {
        return enginePanelRoots().some(root => root.contains(row));
    }

    const observedEngineRoots = new WeakSet();

    function ensureRootObserved(root) {
        if (!root || observedEngineRoots.has(root)) return;
        observedEngineRoots.add(root);
        new MutationObserver(() => {
            decorateRows();
            syncRowHighlights(getSelectedEngines());
        }).observe(root, { childList: true, subtree: true });
    }

    function refreshEnginePanels() {
        for (const root of enginePanelRoots()) {
            ensureRootObserved(root);
        }
        decorateRows();
        syncRowHighlights(getSelectedEngines());
    }

    function nodeAddsEnginePanel(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
            node.id === "image-engine-panel" ||
            node.id === "image-filters-bar" ||
            !!node.querySelector?.("#image-engine-panel, .engine-stat-row")
        );
    }

    function observeEnginePanelMount() {
        const layout = document.getElementById("results-layout");
        const target = layout || document.documentElement;
        new MutationObserver(mutations => {
            const added = mutations.some(mutation =>
                [...mutation.addedNodes].some(nodeAddsEnginePanel),
            );
            if (added) refreshEnginePanels();
        }).observe(target, { childList: true, subtree: true });
    }

    function bindEnginePanelDelegation() {
        const page = getPage();
        if (!page || page.dataset.lgEngineFilterClick === "1") return;
        page.dataset.lgEngineFilterClick = "1";
        page.addEventListener("click", onClick);
        page.addEventListener("keydown", onKeydown);
    }

    function clearFilter() {
        setSelectedEngines([]);
    }

    function scheduleApply() {
        const engines = getSelectedEngines();
        if (!engines.length) return;
        requestAnimationFrame(() => applyFilter(engines));
    }

    function nodeStartsSearch(node) {
        if (!node || node.nodeType !== 1) return false;
        return (
            node.classList?.contains("skeleton-results") ||
            node.classList?.contains("skeleton-card") ||
            node.classList?.contains("skeleton-sidebar") ||
            node.classList?.contains("skeleton-image-grid") ||
            node.classList?.contains("streaming-engine-panel") ||
            !!node.querySelector?.(
                ".skeleton-results, .skeleton-card, .skeleton-sidebar, .skeleton-image-grid, .streaming-engine-panel",
            )
        );
    }

    function onClick(event) {
        const target = event.target;
        if (!target?.closest) return;
        if (target.closest(".engine-retry-link")) return;
        const row = target.closest(".engine-stat-row");
        if (!row || !rowInEnginePanel(row)) return;
        event.preventDefault();
        event.stopPropagation();
        onRowActivate(row);
    }

    function onKeydown(event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        const row = event.target.closest?.(".engine-stat-row");
        if (!row || !rowInEnginePanel(row)) return;
        event.preventDefault();
        onRowActivate(row);
    }

    function init() {
        if (!getPage()) return;

        bindEnginePanelDelegation();

        const resultsList = document.getElementById("results-list");
        if (resultsList) {
            new MutationObserver(mutations => {
                const started = mutations.some(mutation =>
                    [...mutation.addedNodes].some(nodeStartsSearch),
                );
                if (started) clearFilter();
                decorateRows();
                scheduleApply();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        refreshEnginePanels();
        observeEnginePanelMount();

        document.getElementById("results-search-btn")?.addEventListener("click", clearFilter);
        document.getElementById("results-search-input")?.addEventListener("keydown", event => {
            if (event.key === "Enter") clearFilter();
        });

        window.addEventListener("degoog-results-ready", () => {
            decorateRows();
            scheduleApply();
        });

        decorateRows();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
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
    const ENGINE_MODE_IMAGES_MOBILE = "data-sidebar-panels-images-mobile";
    const ENGINE_MODE_IMAGES_DESKTOP = "data-sidebar-panels-images-desktop";
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
            root.hasAttribute(ENGINE_MODE_IMAGES_MOBILE) ||
            root.hasAttribute(ENGINE_MODE_IMAGES_DESKTOP) ||
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

    function isImageEngineRoot(root) {
        return root?.id === "image-engine-panel";
    }

    function getEngineMode(root) {
        if (isImageEngineRoot(root)) {
            const attr = isDesktop() ? ENGINE_MODE_IMAGES_DESKTOP : ENGINE_MODE_IMAGES_MOBILE;
            return normalizeEngineMode(document.documentElement.getAttribute(attr) || "open");
        }
        const attr = isDesktop() ? ENGINE_MODE_DESKTOP : ENGINE_MODE_MOBILE;
        return normalizeEngineMode(
            document.documentElement.getAttribute(attr) || "collapse-on-complete",
        );
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

    function syncEngineAccordion(accordion, root) {
        if (accordion.hasAttribute(USER_ATTR_ENGINE)) return;
        const shouldBeOpen = shouldEngineBeOpen(getEngineMode(root), isSearching());
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
            getEnginePerformancePanels(root).forEach(accordion =>
                syncEngineAccordion(accordion, root),
            );
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
