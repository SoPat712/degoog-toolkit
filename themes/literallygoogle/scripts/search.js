const LG_LANG_DICT = {
    en: {
        settings: "Settings",
        filters: "Filter",
        tools: "Tools",
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
const LG_FILTERS_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 5H3"/>
        <path d="M12 19H3"/>
        <path d="M14 3v4"/>
        <path d="M16 17v4"/>
        <path d="M21 12h-9"/>
        <path d="M21 19h-5"/>
        <path d="M21 5h-7"/>
        <path d="M8 10v4"/>
        <path d="M8 12H3"/>
    </svg>`;
const SEARCH_ACTIVITY_TEXT = Object.freeze({
    runningCommand: "Running command...",
    aboutResultsPattern: /^About \d+ results/i,
    streamingPattern: /streaming/i,
    searchingPattern: /^searching/i,
    completePattern: /results/i,
    completeTimePattern: /seconds?\)/i,
});
const SEARCH_START_SELECTOR =
    ".skeleton-results, .skeleton-card, .skeleton-sidebar, .streaming-engine-panel";
const SEARCH_START_SELECTOR_WITH_IMAGE_GRID = `${SEARCH_START_SELECTOR}, .skeleton-image-grid`;

function onReady(callback) {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
        callback();
    }
}

function getResultsPage() {
    return document.getElementById("results-page");
}

function getResultsList() {
    return document.getElementById("results-list");
}

function getResultsMeta() {
    return document.getElementById("results-meta");
}

function getResultsTabs() {
    return document.getElementById("results-tabs");
}

function getImageFiltersBar() {
    return document.getElementById("image-filters-bar");
}

function getResultsLayout() {
    return document.getElementById("results-layout");
}

function getMediaPreviewPanel() {
    return document.getElementById("media-preview-panel");
}

function isDockedMediaPreviewOpen() {
    const preview = getMediaPreviewPanel();
    if (!(preview instanceof HTMLElement) || !preview.classList.contains("open")) {
        return false;
    }
    if (!window.matchMedia("(min-width: 768px)").matches) return false;
    if (!getResultsLayout()?.classList.contains("media-mode")) return false;
    return getComputedStyle(preview).position === "sticky";
}

function getMediaContentRailRightEdge() {
    const layout = getResultsLayout();
    if (
        layout?.classList.contains("media-mode") &&
        window.matchMedia("(min-width: 768px)").matches
    ) {
        const rect = layout.getBoundingClientRect();
        const padEnd = parseFloat(getComputedStyle(layout).paddingInlineEnd) || 0;
        if (rect.width > 1) return rect.right - padEnd;
    }
    return null;
}

function getMediaContentRailLeftEdge() {
    const layout = getResultsLayout();
    if (
        layout?.classList.contains("media-mode") &&
        window.matchMedia("(min-width: 768px)").matches
    ) {
        const rect = layout.getBoundingClientRect();
        const padStart = parseFloat(getComputedStyle(layout).paddingInlineStart) || 0;
        if (rect.width > 1) return rect.left + padStart;
    }
    return null;
}

function getMediaResultsLeftEdge() {
    const firstColumn = document.querySelector(
        "#results-list .image-grid > .image-column:not(.lg-image-col-hidden)",
    );
    if (firstColumn instanceof HTMLElement) {
        const rect = firstColumn.getBoundingClientRect();
        if (rect.width > 1) return rect.left;
    }

    const grid = document.querySelector(
        "#results-list .image-grid, #results-list .skeleton-image-grid",
    );
    if (grid instanceof HTMLElement) {
        const rect = grid.getBoundingClientRect();
        const padStart = parseFloat(getComputedStyle(grid).paddingInlineStart) || 0;
        if (rect.width > 1) return rect.left + padStart;
    }

    return getMediaContentRailLeftEdge();
}

/** Re-measure grid after leaving bang-command layout (tabs/stats/sidebar). */
function scheduleCommandExitLayoutResync() {
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event("lg-results-layout-changed"));
        window.dispatchEvent(new Event("lg-sync-sidebar-row"));
    });
}

function markImageThumbLoaded(img) {
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("image-thumb")) return;
    const wrap = img.closest(".image-thumb-wrap");
    const card = img.closest(".image-card");
    wrap?.classList.add("loaded");
    card?.classList.add("lg-img-loaded");
}

function getResultsSearchInput() {
    return document.getElementById("results-search-input");
}

function getResultsSearchButton() {
    return document.getElementById("results-search-btn");
}

function getActiveResultsTab() {
    return document.querySelector(
        '.results-tab.active[data-type], .results-tab[aria-selected="true"][data-type]',
    );
}

function getActiveSearchType(defaultType = "web") {
    return getResultsPage()?.getAttribute("data-lg-search-type") || getActiveResultsTab()?.dataset.type || defaultType;
}

function markWired(node, key) {
    if (!node || node.dataset[key] === "1") return false;
    node.dataset[key] = "1";
    return true;
}

function nodeStartsSearch(node, { includeImageGrid = false } = {}) {
    if (!node || node.nodeType !== 1) return false;
    const selector = includeImageGrid
        ? SEARCH_START_SELECTOR_WITH_IMAGE_GRID
        : SEARCH_START_SELECTOR;
    return node.matches?.(selector) || Boolean(node.querySelector?.(selector));
}

function mutationsStartSearch(mutations, options) {
    return mutations.some(mutation => [...mutation.addedNodes].some(node => nodeStartsSearch(node, options)));
}

function getLgTranslation(key) {
    const attrName = `data-t-${key.replace(/([A-Z])/g, "-$1").toLowerCase()}`;
    const el = getResultsPage();
    return el?.getAttribute(attrName) || LG_LANG_DICT.en[key] || key;
}

function wrapResultsStats(meta) {
    if (!meta) return;
    const nodes = [...meta.childNodes].filter(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            const el = /** @type {Element} */ (node);
            if (el.classList.contains("spell-check-notice")) return false;
            if (el.classList.contains("results-meta-stats")) return false;
            if (el.id === "lg-media-engine-pills" || el.classList.contains("lg-media-engine-rail")) {
                return false;
            }
            return Boolean(el.textContent?.trim());
        }
        if (node.nodeType === Node.TEXT_NODE) {
            return Boolean(node.textContent?.trim());
        }
        return false;
    });
    if (nodes.length === 0) return;

    let stats = meta.querySelector(".results-meta-stats");
    const text = nodes
        .map(node => node.textContent?.trim() ?? "")
        .join(" ")
        .trim();
    if (!text || /^Showing results for/i.test(text)) return;

    if (!stats) {
        stats = document.createElement("span");
        stats.className = "results-meta-stats";
        meta.replaceChild(stats, nodes[0]);
    }

    stats.textContent = text;
    nodes.forEach(node => {
        if (node.parentNode === meta) node.remove();
    });
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

/* ── 2. Result pagination enhancements ─────────────────────────────────── */
(() => {
    const ENHANCED_ATTR = "data-lg-pager-enhanced";
    let paginationClickBound = false;
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
        return (getResultsSearchInput()?.value || "").trim();
    }

    function getUrlPage() {
        const raw = new URLSearchParams(window.location.search).get("page");
        const page = parseInt(raw || "1", 10);
        return Number.isFinite(page) && page > 0 ? page : 1;
    }

    function isWebTab() {
        return getActiveSearchType() === "web";
    }

    function getResultItems() {
        const list = getResultsList();
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
        getResultsList()?.removeAttribute("data-lg-client-page");
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

        getResultsList()?.setAttribute("data-lg-client-page", String(target));

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
        const list = getResultsList();
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
        const list = getResultsList();
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

        if (!paginationClickBound) {
            paginationClickBound = true;
            document.addEventListener("click", interceptPaginationClicks, true);
        }

        new MutationObserver(() => {
            window.requestAnimationFrame(syncPagination);
        }).observe(pagination, { childList: true, subtree: false });

        const resultsList = getResultsList();
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

        window.addEventListener("lg-engine-filter-change", () => {
            const resultCount = getResultCount();
            if (clientPager.enabled || shouldEnableClientPagination(resultCount)) {
                applyClientPage(1);
                return;
            }

            const pagination = document.getElementById("pagination");
            let activePage = getUrlPage();
            const pager = pagination?.querySelector(":scope > .lg-pager");
            if (pager) {
                activePage =
                    parseInt(pager.dataset.lgActivePage || String(activePage), 10) || activePage;
            } else if (pagination) {
                const coreWrapper = pagination.querySelector(":scope > .pagination");
                const pageNodes = coreWrapper ? getPageNodes(coreWrapper) : getPageNodes(pagination);
                if (pageNodes.length) {
                    activePage = classifyControls(pageNodes).activePage;
                }
            }

            if (getUrlPage() > 1 || activePage > 1) {
                navigateToPage(1);
            } else {
                window.requestAnimationFrame(syncPagination);
            }
        });

        syncPagination();
    }

    onReady(observePagination);
})();

/* ── 3. Result-slot hygiene during pagination ──────────────────────────── */
(() => {
    const SLOT_CONTAINER_IDS = [
        "slot-above-results",
        "slot-below-results",
        "slot-above-sidebar",
        "slot-below-sidebar",
    ];
    const observedSlots = new WeakSet();
    const observedContainers = new WeakSet();
    let sidebarRowResizeBound = false;

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

    function syncAllSlots() {
        slotContainers().forEach(dedupeFullWidthPanels);
        syncSidebarGridRow();
    }

    function mutationTouchesSlots(mutation) {
        const target = mutation.target;
        if (
            target instanceof Element &&
            target.closest?.("#slot-above-results, #slot-below-results, #slot-above-sidebar, #slot-below-sidebar, #at-a-glance")
        ) {
            return true;
        }
        if (
            target instanceof CharacterData &&
            target.parentElement?.closest?.(
                "#slot-above-results, #slot-below-results, #slot-above-sidebar, #slot-below-sidebar, #at-a-glance",
            )
        ) {
            return true;
        }
        if (mutation.type !== "childList") return false;
        return [...mutation.addedNodes].some(
            node =>
                node instanceof Element &&
                (node.matches?.(".results-slot-panel, #at-a-glance") ||
                    !!node.querySelector?.(".results-slot-panel, #at-a-glance")),
        );
    }

    function observeSlots() {
        syncAllSlots();

        const slot = document.getElementById("slot-above-results");
        if (slot && !observedSlots.has(slot)) {
            observedSlots.add(slot);
            new MutationObserver(mutations => {
                if (!mutations.some(mutationTouchesSlots)) return;
                window.requestAnimationFrame(syncAllSlots);
            }).observe(slot, { childList: true, subtree: true, characterData: true });
        }

        if (!sidebarRowResizeBound) {
            sidebarRowResizeBound = true;
            window.addEventListener("resize", syncSidebarGridRow, { passive: true });
            window.addEventListener("degoog-results-ready", syncSidebarGridRow);
            window.addEventListener("lg-sync-sidebar-row", syncSidebarGridRow);
        }

        slotContainers().forEach(container => {
            dedupeFullWidthPanels(container);
            if (observedContainers.has(container)) return;
            observedContainers.add(container);
            new MutationObserver(mutations => {
                if (!mutations.some(mutationTouchesSlots)) return;
                window.requestAnimationFrame(syncAllSlots);
            }).observe(container, { childList: true, subtree: true, characterData: true });
        });
    }

    onReady(observeSlots);
})();

/* ── 4. Move spell-check notices into #results-meta ─────────────────────── */
(() => {
    let spellCheckFrame = 0;
    const SEARCHING_ATTR = "data-lg-sidebar-searching";
    const HOISTED_SPELL_CHECK_SELECTOR =
        '.spell-check-notice[data-lg-spell-check-meta="1"]';
    const PRESERVED_GLANCE_SKELETON_ATTR = "data-lg-preserved-glance-skeleton";
    // Match official spell-check plugin CORRECTION_TTL_MS.
    const SPELL_CHECK_CORRECTION_TTL_MS = 15_000;
    let nativeGlanceSkeletonHtml = "";
    let hoistedSpellCheckNotice = null;

    function isWebSearchTab() {
        return getActiveSearchType() === "web";
    }

    function isHoistedSpellCheckFresh(notice) {
        const hoistedAt = Number(notice?.dataset?.lgSpellCheckHoistedAt || 0);
        if (!hoistedAt) return true;
        return Date.now() - hoistedAt < SPELL_CHECK_CORRECTION_TTL_MS;
    }

    function shouldKeepHoistedSpellCheck(notice) {
        return (
            isWebSearchTab() &&
            spellCheckMatchesCurrentQuery(notice) &&
            isHoistedSpellCheckFresh(notice)
        );
    }

    function pruneStaleSpellCheckFromMeta(meta = getResultsMeta()) {
        if (!meta) return;
        for (const notice of meta.querySelectorAll(HOISTED_SPELL_CHECK_SELECTOR)) {
            if (!shouldKeepHoistedSpellCheck(notice)) {
                notice.remove();
                if (hoistedSpellCheckNotice === notice) {
                    hoistedSpellCheckNotice = null;
                }
            }
        }
    }

    function getAtAGlanceContainer() {
        return document.getElementById("at-a-glance");
    }

    function bindSpellCheckNotice(notice) {
        if (!notice || notice.dataset.lgSpellCheckBound === "1") return;
        const link = notice.querySelector("[data-spell-link]");
        if (!link) return;
        link.addEventListener("click", event => {
            event.preventDefault();
            const query = link.dataset.original || "";
            const endpoint = link.dataset.skip || "";
            const href = link.href;
            if (!endpoint) {
                window.location.assign(href);
                return;
            }
            fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ q: query }),
            }).finally(() => {
                window.location.assign(href);
            });
        });
        notice.dataset.lgSpellCheckBound = "1";
    }

    function isNativeGlanceSkeleton(node) {
        return (
            node instanceof Element &&
            node.matches(".glance-box") &&
            !!node.querySelector(".skeleton-glance")
        );
    }

    function rememberNativeGlanceSkeleton(node) {
        if (isNativeGlanceSkeleton(node)) {
            nativeGlanceSkeletonHtml = node.outerHTML;
            return;
        }
        if (!(node instanceof Element)) return;
        const skeleton = node
            .querySelector(".glance-box .skeleton-glance")
            ?.closest(".glance-box");
        if (skeleton instanceof HTMLElement) {
            nativeGlanceSkeletonHtml = skeleton.outerHTML;
        }
    }

    function rememberCurrentNativeGlanceSkeleton() {
        const container = getAtAGlanceContainer();
        if (!container) return;
        for (const child of container.children) {
            rememberNativeGlanceSkeleton(child);
        }
    }

    function hasNativeGlanceSkeleton(container) {
        return [...container.children].some(isNativeGlanceSkeleton);
    }

    function hasVisibleNonSpellCheckGlance(container) {
        return [...container.querySelectorAll(":scope > .results-slot-panel")].some(
            panel =>
                panel instanceof HTMLElement &&
                !panel.hidden &&
                !panel.querySelector(".spell-check-notice"),
        );
    }

    function getMetaActivityText() {
        const meta = getResultsMeta();
        if (!meta) return "";
        const stats = meta.querySelector(".results-meta-stats");
        if (stats) return stats.textContent || "";
        const clone = meta.cloneNode(true);
        clone.querySelectorAll(".spell-check-notice").forEach(node => node.remove());
        return clone.textContent || "";
    }

    function isSearchLoading() {
        if (document.documentElement.hasAttribute(SEARCHING_ATTR)) return true;
        const metaText = getMetaActivityText();
        if (
            SEARCH_ACTIVITY_TEXT.searchingPattern.test(metaText.trim()) ||
            SEARCH_ACTIVITY_TEXT.streamingPattern.test(metaText)
        ) {
            return true;
        }
        return Boolean(
            getResultsList()?.querySelector(SEARCH_START_SELECTOR_WITH_IMAGE_GRID),
        );
    }

    function restoreNativeGlanceSkeletonIfNeeded(container = getAtAGlanceContainer()) {
        if (!container || !nativeGlanceSkeletonHtml || !isSearchLoading()) return;
        if (hasNativeGlanceSkeleton(container) || hasVisibleNonSpellCheckGlance(container)) {
            return;
        }
        const template = document.createElement("template");
        template.innerHTML = nativeGlanceSkeletonHtml;
        const skeleton = template.content.firstElementChild;
        if (!(skeleton instanceof HTMLElement)) return;
        skeleton.setAttribute(PRESERVED_GLANCE_SKELETON_ATTR, "1");
        container.appendChild(skeleton);
    }

    function removePreservedGlanceSkeleton() {
        getAtAGlanceContainer()
            ?.querySelectorAll(`[${PRESERVED_GLANCE_SKELETON_ATTR}]`)
            .forEach(node => node.remove());
    }

    function clearHoistedSpellCheck() {
        getResultsMeta()
            ?.querySelectorAll(HOISTED_SPELL_CHECK_SELECTOR)
            .forEach(notice => notice.remove());
        hoistedSpellCheckNotice = null;
    }

    function spellCheckMatchesCurrentQuery(notice) {
        const originalQuery = notice
            ?.querySelector("[data-spell-link]")
            ?.dataset.original?.trim();
        const currentQuery = getResultsSearchInput()?.value?.trim();
        return !originalQuery || !currentQuery || originalQuery === currentQuery;
    }

    function restoreHoistedSpellCheckIfNeeded(meta) {
        if (!meta || !hoistedSpellCheckNotice) return;
        if (meta.querySelector(".spell-check-notice")) return;
        if (!shouldKeepHoistedSpellCheck(hoistedSpellCheckNotice)) {
            hoistedSpellCheckNotice = null;
            return;
        }

        wrapResultsStats(meta);
        meta.appendChild(hoistedSpellCheckNotice);
    }

    function moveSpellCheck() {
        const meta = getResultsMeta();
        if (!meta) return;

        if (!isWebSearchTab()) {
            clearHoistedSpellCheck();
            return;
        }

        pruneStaleSpellCheckFromMeta(meta);
        wrapResultsStats(meta);

        const notices = [...document.querySelectorAll(".spell-check-notice")].filter(
            notice => !notice.closest("#results-meta"),
        );
        if (notices.length === 0) {
            restoreHoistedSpellCheckIfNeeded(meta);
            return;
        }

        meta.querySelectorAll(HOISTED_SPELL_CHECK_SELECTOR).forEach(notice => notice.remove());
        for (const notice of notices) {
            const panel = notice.closest(".results-slot-panel");
            const container = panel?.parentElement || null;
            notice.dataset.lgSpellCheckMeta = "1";
            notice.dataset.lgSpellCheckHoistedAt = String(Date.now());
            bindSpellCheckNotice(notice);
            meta.appendChild(notice);
            hoistedSpellCheckNotice = notice;
            panel?.remove();
            if (container?.id === "at-a-glance") {
                restoreNativeGlanceSkeletonIfNeeded(container);
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

    function mutationTouchesSpellCheck(mutation) {
        const target = mutation.target;
        if (
            target instanceof Element &&
            target.closest?.("#at-a-glance, #slot-above-results, #results-meta, .spell-check-notice")
        ) {
            return true;
        }
        if (
            target instanceof CharacterData &&
            target.parentElement?.closest?.(
                "#at-a-glance, #slot-above-results, #results-meta, .spell-check-notice",
            )
        ) {
            return true;
        }
        if (mutation.type !== "childList") return false;
        return [...mutation.addedNodes].some(
            node =>
                node instanceof Element &&
                (node.matches?.(".spell-check-notice, .results-slot-panel, #at-a-glance, #slot-above-results") ||
                    !!node.querySelector?.(
                        ".spell-check-notice, .results-slot-panel, #at-a-glance, #slot-above-results",
                    )),
        );
    }

    const target = getResultsPage() || document.documentElement;
    new MutationObserver(mutations => {
        for (const mutation of mutations) {
            [...mutation.addedNodes, ...mutation.removedNodes].forEach(rememberNativeGlanceSkeleton);
        }
        const shouldCheck = mutations.some(mutationTouchesSpellCheck);
        if (shouldCheck) scheduleSpellCheck();
    }).observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
    });

    function bindSearchStartCleanup() {
        const resultsList = getResultsList();
        if (resultsList) {
            new MutationObserver(mutations => {
                if (mutationsStartSearch(mutations, { includeImageGrid: true })) {
                    removePreservedGlanceSkeleton();
                    nativeGlanceSkeletonHtml = "";
                }
                rememberCurrentNativeGlanceSkeleton();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        getResultsSearchButton()?.addEventListener("click", clearHoistedSpellCheck);
        getResultsSearchInput()?.addEventListener("keydown", event => {
            if (event.key === "Enter") clearHoistedSpellCheck();
        });
        window.addEventListener("degoog-results-ready", removePreservedGlanceSkeleton);
        window.addEventListener("lg-sync-search-type", () => {
            if (!isWebSearchTab()) {
                clearHoistedSpellCheck();
                return;
            }
            scheduleSpellCheck();
        });
    }

    bindSearchStartCleanup();
    rememberCurrentNativeGlanceSkeleton();
    moveSpellCheck();
})();

/* ── 4a. Filters dropdown ──────────────────────────────────────────────── */
(() => {
    let filtersFrame = 0;

    function unwrapMetaRow() {
        const row = document.getElementById("lg-meta-row");
        const meta = getResultsMeta();
        const page = getResultsPage();
        const tabs = getResultsTabs();
        if (!page) return;
        if (!row) return;
        if (meta?.parentNode === row) {
            page.insertBefore(meta, row);
        }
        page.classList.remove("lg-image-meta-filters", "lg-image-fab-filters", "lg-image-fab-open");
        const panel = document.getElementById("tools-panel");
        if (panel?.parentNode === row) {
            tabs?.after(panel);
        }
        row.remove();
    }

    function relabelFiltersToggle(toggle) {
        if (toggle.dataset.lgFiltersLabel === "1") return;
        const filterLabel = getLgTranslation("filters");
        const icon = document.createElement("span");
        icon.className = "lg-filters-icon";
        icon.innerHTML = LG_FILTERS_ICON;
        const label = document.createElement("span");
        label.className = "lg-filters-label";
        label.textContent = filterLabel;
        toggle.replaceChildren(icon, label);
        toggle.setAttribute("aria-label", filterLabel);
        toggle.dataset.lgFiltersLabel = "1";
    }

    function renderFiltersButton(button, { iconOnly = false } = {}) {
        const filterLabel = getLgTranslation("filters");
        let icon = button.querySelector(".lg-filters-icon");
        if (!icon) {
            icon = document.createElement("span");
            icon.className = "lg-filters-icon";
            button.prepend(icon);
        }
        icon.innerHTML = LG_FILTERS_ICON;

        const existingLabel = button.querySelector(".lg-filters-label");
        if (iconOnly) {
            existingLabel?.remove();
            button.classList.add("lg-tools-toggle-icon-only");
        } else {
            let label = existingLabel;
            if (!label) {
                label = document.createElement("span");
                label.className = "lg-filters-label";
                button.appendChild(label);
            }
            label.textContent = filterLabel;
            button.classList.remove("lg-tools-toggle-icon-only");
        }
        button.setAttribute("aria-label", filterLabel);
    }

    const DRAWER_ANIMATING = "lg-image-drawer-animating";
    const DRAWER_READY = "lg-image-drawer-open-ready";
    const DRAWER_ANIM_MS = 400;
    const FAB_READY = "lg-image-tools-fab-ready";
    const FAB_ENTERING = "lg-image-tools-fab-entering";
    const FAB_ENTER_MS = 20;
    const IMAGE_MODE_DESKTOP_LAYOUT = "data-image-mode-desktop-layout";
    const IMAGE_FAB_SIDE_MOBILE = "data-image-fab-side-mobile";
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    let drawerAnimTimeout = 0;

    function getImageModeDesktopLayout() {
        return (document.documentElement.getAttribute(IMAGE_MODE_DESKTOP_LAYOUT) || "organizers-left")
            .trim()
            .toLowerCase();
    }

    function isDesktopFabLayout() {
        const layout = getImageModeDesktopLayout();
        return (
            layout === "organizers-left" ||
            layout === "preview-left" ||
            layout === "fab-left" ||
            layout === "fab-right"
        );
    }

    function isDesktopFabEndAnchor(layout = getImageModeDesktopLayout()) {
        return layout === "preview-left" || layout === "fab-right";
    }

    function isDesktopImageDrawerMode(page) {
        return (
            page?.getAttribute("data-lg-search-type") === "images" &&
            desktopQuery.matches &&
            isDesktopFabLayout()
        );
    }

    function isImageDrawerMode(page) {
        return (
            page?.getAttribute("data-lg-search-type") === "images" &&
            (!desktopQuery.matches || isDesktopFabLayout())
        );
    }

    function getImageDrawerOverlay() {
        return document.querySelector(".degoog-img-sidebar-overlay");
    }

    function setImageFiltersSidebarOpen(open) {
        const sidebar = getImageFiltersBar();
        const overlay = getImageDrawerOverlay();
        if (!sidebar) return;
        sidebar.classList.toggle("open", open);
        overlay?.classList.toggle("open", open);
    }

    function clearImageDrawerInlineAnchor(page) {
        page?.classList.remove("lg-image-drawer-anchor-start", "lg-image-drawer-anchor-end");
        getImageFiltersBar()?.classList.remove("lg-image-drawer-anchor-start", "lg-image-drawer-anchor-end");
        document.getElementById("lg-image-tools-fab")?.classList.remove(
            "lg-image-drawer-anchor-start",
            "lg-image-drawer-anchor-end",
        );
    }

    function syncImageDrawerInlineAnchor(page) {
        const sidebar = getImageFiltersBar();
        if (!sidebar || !page?.classList.contains("lg-image-fab-filters") || !isImageDrawerMode(page)) {
            clearImageDrawerInlineAnchor(page);
            return;
        }

        const launcher = document.getElementById("lg-image-tools-fab");
        const desktopLayout = getImageModeDesktopLayout();
        if (desktopQuery.matches && isDesktopFabLayout()) {
            const useEndAnchor = isDesktopFabEndAnchor(desktopLayout);
            const anchorStart = !useEndAnchor;
            page.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
            page.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
            sidebar.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
            sidebar.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
            launcher?.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
            launcher?.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
            return;
        }

        const sideSetting = (document.documentElement.getAttribute(IMAGE_FAB_SIDE_MOBILE) || "auto")
            .trim()
            .toLowerCase();
        const locale = (
            document.documentElement.lang ||
            navigator.language ||
            navigator.languages?.[0] ||
            ""
        )
            .trim()
            .toLowerCase();
        const lang = locale.split(/[-_]/)[0];
        const autoUsesLeft =
            document.documentElement.dir === "rtl" || lang === "he" || lang === "iw" || lang === "ja";
        const useEndAnchor =
            sideSetting === "right"
                ? true
                : sideSetting === "left"
                  ? false
                  : !autoUsesLeft;
        const anchorStart = !useEndAnchor;

        page.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
        page.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
        sidebar.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
        sidebar.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
        launcher?.classList.toggle("lg-image-drawer-anchor-start", anchorStart);
        launcher?.classList.toggle("lg-image-drawer-anchor-end", useEndAnchor);
    }

    function closeImageFiltersDrawer(page) {
        const sidebar = getImageFiltersBar();
        if (!sidebar?.classList.contains("open")) return;
        if (sidebar.classList.contains(DRAWER_ANIMATING) && !sidebar.classList.contains(DRAWER_READY)) {
            return;
        }
        prepareImageDrawerAnimation(page);
        setImageDrawerReady(page, false);
        setImageFiltersSidebarOpen(false);
    }

    function openImageFiltersDrawer(page, toggle, panel) {
        const sidebar = getImageFiltersBar();
        if (!sidebar || sidebar.classList.contains("open")) return;

        if (panel && toggle) {
            ensureFiltersClosed(panel, toggle);
        }

        syncImageDrawerInlineAnchor(page);
        syncImageDrawerViewport(page);
        prepareImageDrawerAnimation(page);
        setImageFiltersSidebarOpen(true);
        setImageDrawerReady(page, false);
        sidebar.getBoundingClientRect();

        if (reducedMotionQuery.matches) {
            setImageDrawerReady(page, true);
            finishImageDrawerAnimation(page);
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                setImageDrawerReady(page, true);
            });
        });
    }

    function setImageDrawerAnimating(page, on) {
        const sidebar = getImageFiltersBar();
        const overlay = getImageDrawerOverlay();
        page?.classList.toggle(DRAWER_ANIMATING, on);
        sidebar?.classList.toggle(DRAWER_ANIMATING, on);
        overlay?.classList.toggle(DRAWER_ANIMATING, on);
    }

    function setImageDrawerReady(page, on) {
        const sidebar = getImageFiltersBar();
        const overlay = getImageDrawerOverlay();
        page?.classList.toggle(DRAWER_READY, on);
        sidebar?.classList.toggle(DRAWER_READY, on);
        overlay?.classList.toggle(DRAWER_READY, on);
    }

    function getDrawerAnimDurationMs() {
        const raw = getComputedStyle(document.documentElement)
            .getPropertyValue("--lg-drawer-duration")
            .trim();
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : DRAWER_ANIM_MS;
    }

    function prepareImageDrawerAnimation(page) {
        setImageDrawerReady(page, false);
        setImageDrawerAnimating(page, true);
        window.clearTimeout(drawerAnimTimeout);
        const sidebar = getImageFiltersBar();
        if (!sidebar || reducedMotionQuery.matches) return;

        const finish = () => {
            sidebar.removeEventListener("transitionend", onTransitionEnd);
            finishImageDrawerAnimation(page);
        };

        let finishTimer = 0;
        const onTransitionEnd = event => {
            if (event.target !== sidebar) return;
            if (event.propertyName !== "height" && event.propertyName !== "width") return;
            window.clearTimeout(finishTimer);
            finishTimer = window.setTimeout(finish, 32);
        };

        sidebar.addEventListener("transitionend", onTransitionEnd);
        drawerAnimTimeout = window.setTimeout(() => {
            sidebar.removeEventListener("transitionend", onTransitionEnd);
            window.clearTimeout(finishTimer);
            finishImageDrawerAnimation(page);
        }, getDrawerAnimDurationMs() + 96);
    }

    function finishImageDrawerAnimation(page) {
        window.clearTimeout(drawerAnimTimeout);
        drawerAnimTimeout = 0;
        const sidebar = getImageFiltersBar();
        const open = sidebar?.classList.contains("open") ?? false;
        setImageDrawerAnimating(page, false);
        setImageDrawerReady(page, open);
        sidebar?.classList.remove("lg-drawer-dragging", "lg-drawer-drag-snap");
        clearImageDrawerMotionProgress(sidebar);
    }

    function clearImageDrawerPerformance(page) {
        window.clearTimeout(drawerAnimTimeout);
        drawerAnimTimeout = 0;
        setImageDrawerAnimating(page, false);
        setImageDrawerReady(page, false);
    }

    function clearImageFabInsetBottom(page) {
        page?.style.removeProperty("--lg-fab-inset-bottom");
        getImageFiltersBar()?.style.removeProperty("--lg-fab-inset-bottom");
    }

    function ensureImageDrawerHost(page) {
        const sidebar = getImageFiltersBar();
        if (!page || !sidebar || !isDesktopImageDrawerMode(page)) {
            restoreImageDrawerHost();
            return;
        }
        sidebar.classList.add("lg-image-fab-drawer");
        if (sidebar.parentNode === document.body) return;
        document.body.appendChild(sidebar);
    }

    function restoreImageDrawerHost() {
        const sidebar = getImageFiltersBar();
        const layout = getResultsLayout();
        const preview = getMediaPreviewPanel();
        if (!sidebar || !layout || sidebar.parentNode === layout) return;
        sidebar.classList.remove("lg-image-fab-drawer");
        layout.insertBefore(sidebar, preview || null);
    }

    function syncImageDrawerViewport(page) {
        const sidebar = getImageFiltersBar();
        const vv = window.visualViewport;
        if (!sidebar || !page?.classList.contains("lg-image-fab-filters")) return;

        const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const bottomPx = 0.75 * remPx;
        const topPx = 0.5 * remPx;
        const viewportHeight = vv?.height ?? window.innerHeight;
        const maxH = Math.max(14 * remPx, viewportHeight - topPx - bottomPx);
        sidebar.style.setProperty("--lg-drawer-max-height", `${maxH}px`);
        syncImageDrawerInlineAnchor(page);
        clearImageFabInsetBottom(page);
    }

    function wireImageDrawerViewport(page) {
        if (page.dataset.lgDrawerViewportWired === "1") return;
        page.dataset.lgDrawerViewportWired = "1";

        const sync = () => syncImageDrawerViewport(page);
        window.visualViewport?.addEventListener("resize", sync);
        window.visualViewport?.addEventListener("scroll", sync);
        window.addEventListener("resize", sync);
        window.addEventListener("orientationchange", sync);
        sync();
    }

    function getPx(value, fallback = 0) {
        const parsed = Number.parseFloat(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function lerp(start, end, progress) {
        return start + (end - start) * progress;
    }

    function getImageDrawerMotionMetrics(page, sidebar) {
        const rect = sidebar.getBoundingClientRect();
        const styles = getComputedStyle(sidebar);
        const anchorEnd =
            page.classList.contains("lg-image-drawer-anchor-end") ||
            sidebar.classList.contains("lg-image-drawer-anchor-end");
        const fabSize = getPx(styles.getPropertyValue("--lg-fab-size"), 56);
        const fabInset = getPx(styles.getPropertyValue("--lg-fab-inset-inline"), 16);
        const fabBottom = getPx(styles.getPropertyValue("--lg-fab-inset-bottom"), 16);
        const openInset = anchorEnd ? window.innerWidth - rect.right : rect.left;
        const openBottom = window.innerHeight - rect.bottom;
        const openRadius =
            getPx(styles.borderTopLeftRadius, 0) || getPx(styles.borderRadius, fabSize / 2);

        return {
            anchorEnd,
            dragDistance: Math.max(1, rect.height - fabSize),
            fabBottom,
            fabInset,
            fabSize,
            openBottom,
            openHeight: rect.height,
            openInset,
            openRadius,
            openWidth: rect.width,
        };
    }

    function applyImageDrawerMotionProgress(sidebar, metrics, progress) {
        if (!sidebar || !metrics) return;
        const clamped = Math.max(0, Math.min(progress, 1));
        const width = lerp(metrics.openWidth, metrics.fabSize, clamped);
        const height = lerp(metrics.openHeight, metrics.fabSize, clamped);
        const radius = lerp(metrics.openRadius, metrics.fabSize / 2, clamped);
        const inset = lerp(metrics.openInset, metrics.fabInset, clamped);
        const bottom = lerp(metrics.openBottom, metrics.fabBottom, clamped);
        const contentOpacity = Math.max(0, 1 - clamped * 1.8);

        sidebar.style.setProperty("width", `${width}px`, "important");
        sidebar.style.setProperty("max-width", `${width}px`, "important");
        sidebar.style.setProperty("height", `${height}px`, "important");
        sidebar.style.setProperty("min-height", `${height}px`, "important");
        sidebar.style.setProperty("max-height", `${height}px`, "important");
        sidebar.style.setProperty("border-radius", `${radius}px`, "important");
        sidebar.style.setProperty("bottom", `${bottom}px`, "important");

        if (metrics.anchorEnd) {
            sidebar.style.removeProperty("inset-inline-start");
            sidebar.style.setProperty("inset-inline-end", `${inset}px`, "important");
        } else {
            sidebar.style.removeProperty("inset-inline-end");
            sidebar.style.setProperty("inset-inline-start", `${inset}px`, "important");
        }

        sidebar.style.setProperty("--lg-drawer-content-opacity", String(contentOpacity));
    }

    function clearImageDrawerMotionProgress(sidebar) {
        sidebar?.style.removeProperty("width");
        sidebar?.style.removeProperty("max-width");
        sidebar?.style.removeProperty("height");
        sidebar?.style.removeProperty("min-height");
        sidebar?.style.removeProperty("max-height");
        sidebar?.style.removeProperty("border-radius");
        sidebar?.style.removeProperty("bottom");
        sidebar?.style.removeProperty("inset-inline-start");
        sidebar?.style.removeProperty("inset-inline-end");
        sidebar?.style.removeProperty("--lg-drawer-content-opacity");
    }

    function wireImageDrawerPullDismiss(page) {
        const sidebar = getImageFiltersBar();
        if (!markWired(sidebar, "lgDrawerPullWired")) return;

        const DISMISS_DISTANCE = 120;
        const DISMISS_VELOCITY = 0.45;
        const DRAG_START_THRESHOLD = 6;

        let startY = 0;
        let lastY = 0;
        let lastT = 0;
        let velocity = 0;
        let dragging = false;
        let dragArmed = false;
        let dragProgress = 0;
        let dragMetrics = null;

        function getHandle() {
            return sidebar.querySelector(".degoog-img-sidebar-close");
        }

        function applyDragProgress(progress) {
            if (!dragMetrics) return;
            const clamped = Math.max(0, Math.min(progress, 1));
            applyImageDrawerMotionProgress(sidebar, dragMetrics, clamped);
            dragProgress = clamped;
        }

        function clearDragGeometry() {
            clearImageDrawerMotionProgress(sidebar);
            dragMetrics = null;
            dragProgress = 0;
        }

        function clearDragVars() {
            sidebar.classList.remove("lg-drawer-dragging", "lg-drawer-drag-snap");
            clearDragGeometry();
        }

        function closeDrawer() {
            if (!sidebar.classList.contains("open")) return;
            sidebar.classList.remove("lg-drawer-dragging", "lg-drawer-drag-snap");
            clearDragGeometry();
            closeImageFiltersDrawer(page);
        }

        function snapBack() {
            sidebar.classList.remove("lg-drawer-dragging");
            sidebar.classList.add("lg-drawer-drag-snap");
            clearDragGeometry();
            const onEnd = event => {
                if (event.target !== sidebar || event.propertyName !== "height") return;
                sidebar.removeEventListener("transitionend", onEnd);
                clearDragVars();
            };
            sidebar.addEventListener("transitionend", onEnd);
        }

        sidebar.addEventListener(
            "touchstart",
            event => {
                if (!isImageDrawerMode(page) || !sidebar.classList.contains("open")) return;
                if (sidebar.classList.contains(DRAWER_ANIMATING)) return;
                const handle = getHandle();
                if (!handle || !(event.target instanceof Node) || !handle.contains(event.target)) {
                    return;
                }

                const touch = event.touches[0];
                startY = touch.clientY;
                lastY = startY;
                lastT = performance.now();
                velocity = 0;
                dragging = false;
                dragArmed = true;
                dragProgress = 0;
                dragMetrics = getImageDrawerMotionMetrics(page, sidebar);
            },
            { passive: true },
        );

        sidebar.addEventListener(
            "touchmove",
            event => {
                if (!dragArmed) return;
                const touch = event.touches[0];
                const dy = touch.clientY - startY;
                if (!dragging && dy < DRAG_START_THRESHOLD) return;

                if (!dragging) {
                    dragging = true;
                    sidebar.classList.add("lg-drawer-dragging");
                }

                const clampedDy = Math.max(0, dy);
                const now = performance.now();
                const dt = now - lastT;
                if (dt > 0) {
                    velocity = (touch.clientY - lastY) / dt;
                }
                lastY = touch.clientY;
                lastT = now;

                event.preventDefault();
                applyDragProgress(clampedDy / dragMetrics.dragDistance);
            },
            { passive: false },
        );

        function finishDrag() {
            if (!dragArmed) return;
            dragArmed = false;
            if (!dragging) return;

            const dy = Math.max(0, lastY - startY);
            dragging = false;

            if (dy > DISMISS_DISTANCE || dragProgress > 0.28 || velocity > DISMISS_VELOCITY) {
                closeDrawer();
                return;
            }

            if (dragProgress > 0) {
                snapBack();
                return;
            }

            clearDragVars();
        }

        sidebar.addEventListener("touchend", finishDrag, { passive: true });
        sidebar.addEventListener("touchcancel", finishDrag, { passive: true });
    }

    function wireImageDrawerDismiss(page) {
        const sidebar = getImageFiltersBar();
        const overlay = getImageDrawerOverlay();
        if (!markWired(page, "lgDrawerDismissWired")) return;

        overlay?.addEventListener("click", () => {
            if (!isImageDrawerMode(page)) return;
            closeImageFiltersDrawer(page);
        });

        sidebar?.addEventListener("click", event => {
            if (!isImageDrawerMode(page)) return;
            const closeBtn = event.target.closest?.(".degoog-img-sidebar-close");
            if (!closeBtn) return;
            event.preventDefault();
            event.stopPropagation();
            closeImageFiltersDrawer(page);
        });

        document.addEventListener("keydown", event => {
            if (event.key !== "Escape") return;
            if (!isImageDrawerMode(page) || !sidebar?.classList.contains("open")) return;
            event.preventDefault();
            closeImageFiltersDrawer(page);
        });
    }

    function wireImageDrawerPerformance(page) {
        const sidebar = getImageFiltersBar();
        if (!markWired(sidebar, "lgDrawerPerfWired")) return;

        let wasOpen = sidebar.classList.contains("open");

        new MutationObserver(() => {
            if (!isImageDrawerMode(page)) {
                wasOpen = sidebar.classList.contains("open");
                return;
            }

            const open = sidebar.classList.contains("open");
            if (open === wasOpen) return;

            if (!sidebar.classList.contains(DRAWER_ANIMATING)) {
                prepareImageDrawerAnimation(page);
            }
            if (reducedMotionQuery.matches) {
                requestAnimationFrame(() => finishImageDrawerAnimation(page));
            }
            syncImageDrawerViewport(page);
            wasOpen = open;
        }).observe(sidebar, { attributes: true, attributeFilter: ["class"] });
    }

    function removeFloatingFiltersLauncher(page) {
        page?.classList.remove("lg-image-fab-filters", "lg-image-fab-open");
        clearImageDrawerPerformance(page);
        clearImageFabInsetBottom(page);
        clearImageDrawerInlineAnchor(page);
        document.getElementById("lg-image-tools-fab")?.remove();
        restoreImageDrawerHost();
    }

    function playFloatingFiltersLauncherIntro(launcher) {
        launcher.classList.remove(FAB_READY);
        launcher.classList.add(FAB_ENTERING);
        launcher.getBoundingClientRect();
        if (reducedMotionQuery.matches) {
            launcher.classList.add(FAB_READY);
            launcher.classList.remove(FAB_ENTERING);
            return;
        }
        window.setTimeout(() => {
            launcher.classList.add(FAB_READY);
            launcher.classList.remove(FAB_ENTERING);
        }, FAB_ENTER_MS);
    }

    function armFloatingFiltersLauncher(launcher) {
        if (!launcher || launcher.dataset.lgFabMounted === "1") return;
        launcher.dataset.lgFabMounted = "1";

        const startIntro = () => {
            if (!launcher.isConnected) return;
            playFloatingFiltersLauncherIntro(launcher);
        };

        requestAnimationFrame(startIntro);
    }

    function applyFloatingFiltersLauncherState(launcher, toggle, page) {
        if (!launcher || !page) return;
        const sidebar = getImageFiltersBar();
        const drawerMode = isImageDrawerMode(page);
        const isOpen = drawerMode
            ? Boolean(sidebar?.classList.contains("open"))
            : Boolean(
                  sidebar?.classList.contains("open") ||
                      toggle.classList.contains("is-open") ||
                      toggle.classList.contains("active") ||
                      toggle.getAttribute("aria-expanded") === "true",
              );

        if (drawerMode) {
            page.classList.add("lg-image-fab-filters");
        } else {
            page.classList.remove("lg-image-fab-filters", "lg-image-fab-open");
        }
        page.classList.toggle("lg-image-fab-open", drawerMode && Boolean(isOpen));
        syncImageDrawerInlineAnchor(page);
        launcher.classList.toggle("is-open", Boolean(isOpen));
        launcher.classList.toggle("active", Boolean(isOpen));
        launcher.setAttribute("aria-expanded", String(Boolean(isOpen)));
    }

    let syncFabFrame = 0;
    function syncFloatingFiltersLauncher(toggle, page) {
        if (syncFabFrame) return;
        syncFabFrame = requestAnimationFrame(() => {
            syncFabFrame = 0;

            const launcher = document.getElementById("lg-image-tools-fab");
            applyFloatingFiltersLauncherState(launcher, toggle, page);
        });
    }

    function ensureFloatingFiltersLauncher(page, toggle) {
        let launcher = document.getElementById("lg-image-tools-fab");
        if (!launcher) {
            launcher = document.createElement("button");
            launcher.id = "lg-image-tools-fab";
            launcher.className = "lg-image-tools-fab";
            launcher.type = "button";
            page.appendChild(launcher);
        }

        renderFiltersButton(launcher, { iconOnly: true });
        launcher.setAttribute("aria-label", getLgTranslation("tools"));
        launcher.setAttribute("aria-haspopup", "dialog");
        applyFloatingFiltersLauncherState(launcher, toggle, page);
        armFloatingFiltersLauncher(launcher);

        if (markWired(launcher, "lgFabWired")) {
            launcher.addEventListener("click", event => {
                const currentPage = getResultsPage();
                const sidebar = getImageFiltersBar();
                const panel = document.getElementById("tools-panel");
                const currentToggle = document.getElementById("tools-toggle");
                if (!isImageDrawerMode(currentPage)) return;
                if (sidebar?.classList.contains("open")) {
                    event.preventDefault();
                    closeImageFiltersDrawer(currentPage);
                    return;
                }
                openImageFiltersDrawer(currentPage, currentToggle, panel);
            });
        }

        syncFloatingFiltersLauncher(toggle, page);
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
        if (!markWired(panel, "lgCustomDateWired")) return;
        panel.querySelectorAll(".tools-custom-date").forEach(customDate => {
            new MutationObserver(() => syncCustomDateMenuState(panel)).observe(
                customDate,
                { attributes: true, attributeFilter: ["style", "hidden", "class"] },
            );
        });
        syncCustomDateMenuState(panel);
    }

    function positionFiltersPanel(panel, toggle, page) {
        if (isImageDrawerMode(page)) return;
        if (panel.style.display === "none") return;
        const toggleRect = toggle.getBoundingClientRect();
        const pageRect = page.getBoundingClientRect();
        const viewportGutter = 12;
        const panelWidth = Math.min(panel.offsetWidth || 288, window.innerWidth - viewportGutter * 2);
        const spaceRight = window.innerWidth - toggleRect.left - viewportGutter;
        const preferRight = spaceRight >= panelWidth;
        const preferredLeft = preferRight
            ? toggleRect.left - pageRect.left
            : toggleRect.right - pageRect.left - panelWidth;
        const maxLeft = Math.max(0, pageRect.width - panelWidth);
        const clampedLeft = Math.max(0, Math.min(preferredLeft, maxLeft));
        const panelRight = pageRect.left + clampedLeft + panelWidth;
        const submenuWidth = Math.min(288, window.innerWidth - viewportGutter * 2);
        const submenuSpaceRight = window.innerWidth - panelRight - viewportGutter;
        const submenuSpaceLeft = pageRect.left + clampedLeft - viewportGutter;
        const openSubmenuToLeft =
            submenuSpaceRight < submenuWidth && submenuSpaceLeft > submenuSpaceRight;

        panel.style.setProperty("--lg-filters-top", `${toggleRect.bottom - pageRect.top + 4}px`);
        panel.style.setProperty("--lg-filters-left", `${clampedLeft}px`);
        panel.dataset.lgSubmenuSide = openSubmenuToLeft ? "left" : "right";
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
            /* Persisting the transient tools-panel state is optional. */
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
        if (!markWired(panel, "lgFiltersDismissWired")) return;

        document.addEventListener("click", event => {
            if (panel.style.display === "none") return;
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (panel.contains(target) || toggle.contains(target)) return;
            closeFiltersDropdown(panel, toggle);
        });
    }

    function wireFiltersHover(panel) {
        if (!markWired(panel, "lgFiltersHoverWired")) return;

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

    function wireDrawerToggleGuard(toggle) {
        if (!markWired(toggle, "lgDrawerGuardWired")) return;

        toggle.addEventListener(
            "click",
            event => {
                const page = getResultsPage();
                const sidebar = getImageFiltersBar();
                if (!isImageDrawerMode(page)) return;
                if (!sidebar?.classList.contains("open")) return;
                event.preventDefault();
                event.stopImmediatePropagation();
            },
            true,
        );
    }

    function isBangCommandQuery(query) {
        const trimmed = query.trim();
        if (!trimmed) return false;
        return trimmed.startsWith("!") || /\s!\S+$/.test(trimmed);
    }

    function isCommandMode() {
        const query = getResultsSearchInput()?.value ?? "";
        if (!isBangCommandQuery(query)) return false;

        const metaText = getResultsMeta()?.textContent?.trim() ?? "";
        if (metaText === SEARCH_ACTIVITY_TEXT.runningCommand) return true;
        if (SEARCH_ACTIVITY_TEXT.aboutResultsPattern.test(metaText)) return false;

        const list = getResultsList();
        if (!list) return false;

        if (list.querySelector(".loading-dots")) {
            return metaText === SEARCH_ACTIVITY_TEXT.runningCommand;
        }

        if (list.querySelector(".command-result, .command-help-table")) return true;

        if (list.querySelector(".result-item")) return false;

        if (list.querySelector(".no-results")) return true;

        return false;
    }

    /** Core hides tabs during bang commands (`data-bang-hidden` + inline display) but can leave them stuck after a normal search. */
    function restoreBangHiddenTabs() {
        const tabs = getResultsTabs();
        if (!tabs) return false;

        let restored = false;
        tabs.querySelectorAll(".results-tab[data-bang-hidden]").forEach(tab => {
            tab.style.removeProperty("display");
            tab.removeAttribute("data-bang-hidden");
            tab.removeAttribute("hidden");
            restored = true;
        });
        return restored;
    }

    function wireBangTabRestore() {
        const input = getResultsSearchInput();
        if (!input || input.dataset.lgBangTabRestoreWired === "1") return;
        input.dataset.lgBangTabRestoreWired = "1";
        input.addEventListener("input", () => {
            if (isBangCommandQuery(input.value)) return;
            if (restoreBangHiddenTabs()) {
                syncFiltersVisibilityFromDom();
            }
        });
    }

    function syncFiltersVisibility(toolsBar, panel, toggle, page) {
        if (!toolsBar || !page) return;
        const wasCommandMode = page.classList.contains("lg-command-mode");
        const commandMode = isCommandMode();
        page.classList.toggle("lg-command-mode", commandMode);
        if (commandMode) {
            closeFiltersDropdown(panel, toggle);
            return;
        }
        restoreBangHiddenTabs();
        if (wasCommandMode) {
            scheduleCommandExitLayoutResync();
        }
    }

    function getFiltersElements() {
        return {
            page: getResultsPage(),
            panel: document.getElementById("tools-panel"),
            toggle: document.getElementById("tools-toggle"),
            toolsBar: document.getElementById("tools-bar"),
        };
    }

    function ensureFiltersPanelHost(panel) {
        const tabs = getResultsTabs();
        if (!panel || !tabs) return;
        if (panel.parentElement !== tabs.parentElement) {
            tabs.after(panel);
        }
    }

    function openFiltersDropdownFallback(panel, toggle, page) {
        ensureFiltersPanelHost(panel);
        panel.style.display = "flex";
        toggle.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        try {
            localStorage.setItem("degoog-tools-open", "true");
        } catch {
            /* Persisting the transient tools-panel state is optional. */
        }
        positionFiltersPanel(panel, toggle, page);
        syncCustomDateMenuState(panel);
    }

    function wireFiltersToggleFallback(panel, toggle, page) {
        if (!markWired(toggle, "lgFiltersFallbackWired")) return;

        toggle.addEventListener(
            "click",
            event => {
                const currentPage = getResultsPage();
                if (isImageDrawerMode(currentPage)) return;
                event.preventDefault();
                event.stopImmediatePropagation();

                const isOpen =
                    panel.style.display !== "none" ||
                    toggle.getAttribute("aria-expanded") === "true";

                if (isOpen) {
                    ensureFiltersClosed(panel, toggle);
                    return;
                }

                openFiltersDropdownFallback(panel, toggle, page);
            },
            true,
        );
    }

    function activateImageDrawerMode(page, toggle) {
        if (isDesktopImageDrawerMode(page)) {
            ensureImageDrawerHost(page);
        } else {
            restoreImageDrawerHost();
        }
        ensureFloatingFiltersLauncher(page, toggle);
        wireImageDrawerPerformance(page);
        wireImageDrawerViewport(page);
        wireImageDrawerPullDismiss(page);
        wireImageDrawerDismiss(page);
        syncImageDrawerViewport(page);
        clearImageFabInsetBottom(page);
    }

    function deactivateImageDrawerMode(page) {
        removeFloatingFiltersLauncher(page);
        clearImageFabInsetBottom(page);
    }

    function wireFiltersUiObservers(panel, toggle, page) {
        toggle.addEventListener("click", () => {
            requestAnimationFrame(() => {
                positionFiltersPanel(panel, toggle, page);
                syncCustomDateMenuState(panel);
                syncFloatingFiltersLauncher(toggle, page);
            });
        });
        window.addEventListener("resize", () => {
            scheduleFiltersDropdown();
            positionFiltersPanel(panel, toggle, page);
        });
        window.addEventListener(
            "scroll",
            () => positionFiltersPanel(panel, toggle, page),
            true,
        );
        new MutationObserver(() => positionFiltersPanel(panel, toggle, page)).observe(panel, {
            attributes: true,
            attributeFilter: ["style", "class"],
        });
        new MutationObserver(() => syncFloatingFiltersLauncher(toggle, page)).observe(toggle, {
            attributes: true,
            attributeFilter: ["class", "aria-expanded"],
        });

        const sidebar = getImageFiltersBar();
        if (!sidebar) return;

        new MutationObserver(() => syncFloatingFiltersLauncher(toggle, page)).observe(sidebar, {
            attributes: true,
            attributeFilter: ["class", "style"],
        });
    }

    function syncFiltersVisibilityFromDom(page = getResultsPage()) {
        const { toolsBar, panel, toggle } = getFiltersElements();
        if (!panel || !toggle) return;
        syncFiltersVisibility(toolsBar, panel, toggle, page);
    }

    function setupFiltersDropdown() {
        unwrapMetaRow();

        const { page, panel, toggle, toolsBar } = getFiltersElements();
        if (!page || !panel || !toggle) return;
        const drawerMode = isImageDrawerMode(page);

        relabelFiltersToggle(toggle);
        wireDrawerToggleGuard(toggle);
        ensureFiltersPanelHost(panel);
        panel.classList.remove("lg-tools-inline");
        panel.classList.add("lg-filters-dropdown");
        toolsBar?.classList.add("lg-filters-wrap");

        if (drawerMode) {
            activateImageDrawerMode(page, toggle);
        } else {
            deactivateImageDrawerMode(page);
        }

        positionFiltersPanel(panel, toggle, page);
        wireCustomDateMenuState(panel);
        if (!drawerMode) {
            if (toggle.dataset.lgFiltersInitClosed !== "1") {
                toggle.dataset.lgFiltersInitClosed = "1";
                ensureFiltersClosedAfterCore(panel, toggle);
            }
            wireFiltersDismiss(panel, toggle);
            wireFiltersHover(panel);
        }
        syncFiltersVisibility(toolsBar, panel, toggle, page);
        wireBangTabRestore();

        if (toggle.dataset.lgFiltersWired !== "1") {
            toggle.dataset.lgFiltersWired = "1";
            wireFiltersUiObservers(panel, toggle, page);
        }
        wireFiltersToggleFallback(panel, toggle, page);

        syncFloatingFiltersLauncher(toggle, page);
        window.dispatchEvent(new Event("lg-sync-sidebar-chrome"));
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
    window.addEventListener("lg-sync-search-type", scheduleFiltersSync);
    desktopQuery.addEventListener?.("change", scheduleFiltersSync);

    const page = getResultsPage();
    if (page) {
        new MutationObserver(mutations => {
            let needsSetup = false;
            let needsVisibilitySync = false;

            for (const mutation of mutations) {
                if (
                    mutation.type === "attributes" &&
                    mutation.target === page &&
                    mutation.attributeName === "data-lg-search-type"
                ) {
                    needsSetup = true;
                    continue;
                }

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
                requestAnimationFrame(() => syncFiltersVisibilityFromDom(page));
            }
        }).observe(page, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "aria-selected", "data-lg-search-type"],
        });
    }
})();

/* ── 4b. Results tabs scroll rail (mobile arrows + desktop grid grouping) ── */
(() => {
    const TABS_SCROLL_SELECTOR = ".lg-results-tabs__scroll";
    const TABS_RAIL_CLASS = "lg-results-tabs-rail";
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const NAV_ICON_PREV =
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>`;
    const NAV_ICON_NEXT =
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>`;

    function horizontalTabsScrollStep(scrollEl) {
        return Math.max(120, Math.round(scrollEl.clientWidth * 0.72));
    }

    function updateTabsNavState() {
        const tabs = getResultsTabs();
        const rail = tabs?.querySelector(`.${TABS_RAIL_CLASS}`);
        const scrollEl = rail?.querySelector(TABS_SCROLL_SELECTOR);
        const prevBtn = rail?.querySelector('[data-lg-tabs-scroll="prev"]');
        const nextBtn = rail?.querySelector('[data-lg-tabs-scroll="next"]');
        if (!scrollEl || !prevBtn || !nextBtn) return;
        if (scrollEl.scrollWidth <= scrollEl.clientWidth) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        const atStart = scrollEl.scrollLeft <= 0;
        const atEnd = scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 1;
        prevBtn.disabled = atStart;
        nextBtn.disabled = atEnd;
    }

    function initTabsRail(rail) {
        if (!rail || rail.dataset.lgTabsRailInit === "1") return;
        const scrollEl = rail.querySelector(TABS_SCROLL_SELECTOR);
        const prevBtn = rail.querySelector('[data-lg-tabs-scroll="prev"]');
        const nextBtn = rail.querySelector('[data-lg-tabs-scroll="next"]');
        if (!scrollEl || !prevBtn || !nextBtn) return;
        rail.dataset.lgTabsRailInit = "1";

        const refresh = () => updateTabsNavState();
        scrollEl.addEventListener("scroll", refresh, { passive: true });
        const ro = new ResizeObserver(refresh);
        ro.observe(scrollEl);
        ro.observe(rail);
        refresh();
    }

    function createTabsRail() {
        const rail = document.createElement("div");
        rail.className = TABS_RAIL_CLASS;
        rail.innerHTML =
            `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--prev" data-lg-tabs-scroll="prev" aria-label="Scroll tabs left">` +
            NAV_ICON_PREV +
            `</button>` +
            `<div class="lg-results-tabs__scroll"></div>` +
            `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--next" data-lg-tabs-scroll="next" aria-label="Scroll tabs right">` +
            NAV_ICON_NEXT +
            `</button>`;
        return rail;
    }

    function collectTabNodes(tabs) {
        return [...tabs.children].filter(
            child => child instanceof HTMLElement && child.classList.contains("results-tab"),
        );
    }

    function syncTabsRail() {
        const tabs = getResultsTabs();
        if (!tabs) return;

        // The rail is always mounted: it groups the tab buttons so the desktop
        // grid can place it in column 1, and on mobile it owns the horizontal
        // scroll + edge-aware arrows. The Filters control (#tools-bar) is a
        // sibling of the rail on desktop (grid column 2, right-aligned) and
        // the last item in the scroll list on mobile.
        let rail = tabs.querySelector(`.${TABS_RAIL_CLASS}`);
        if (!rail) {
            rail = createTabsRail();
            tabs.insertBefore(rail, tabs.firstChild);
        }

        const scrollEl = rail.querySelector(TABS_SCROLL_SELECTOR);
        if (!scrollEl) return;

        // Only move nodes that are not already in the right parent. Moving a
        // node to the same parent still fires a childList mutation, which the
        // observer below re-enters as another syncTabsRail() call — an infinite
        // loop. Guard every appendChild with a parent check.
        for (const tab of collectTabNodes(tabs)) {
            if (tab.parentElement !== scrollEl) scrollEl.appendChild(tab);
        }

        const toolsBar = tabs.querySelector("#tools-bar");
        const wantMobile = mobileQuery.matches;
        if (toolsBar) {
            const wantParent = wantMobile ? scrollEl : tabs;
            if (toolsBar.parentElement !== wantParent) {
                wantParent.appendChild(toolsBar);
            }
        }

        initTabsRail(rail);
        updateTabsNavState();
    }

    function onTabsRailClick(event) {
        const scrollNav = event.target?.closest?.("[data-lg-tabs-scroll]");
        if (!scrollNav || scrollNav.disabled) return;
        const rail = scrollNav.closest(`.${TABS_RAIL_CLASS}`);
        const scrollEl = rail?.querySelector(TABS_SCROLL_SELECTOR);
        if (!rail || !scrollEl) return;
        event.preventDefault();
        event.stopPropagation();

        const dir = scrollNav.getAttribute("data-lg-tabs-scroll");
        const containerWidth = scrollEl.clientWidth;
        const currentScroll = scrollEl.scrollLeft;
        const maxScroll = scrollEl.scrollWidth - containerWidth;
        const containerRect = scrollEl.getBoundingClientRect();

        const children = [...scrollEl.children].filter(
            child => child instanceof HTMLElement && !child.hasAttribute("hidden")
        );
        if (!children.length) return;

        let targetScroll = currentScroll;

        if (dir === "next") {
            const rightBoundary = currentScroll + containerWidth;
            let targetChild = null;
            for (const child of children) {
                const childRect = child.getBoundingClientRect();
                const childLeft = childRect.left - containerRect.left + currentScroll;
                if (childLeft >= rightBoundary - 20) {
                    targetChild = child;
                    break;
                }
            }
            if (targetChild) {
                const targetChildRect = targetChild.getBoundingClientRect();
                targetScroll = targetChildRect.left - containerRect.left + currentScroll;
            } else {
                targetScroll = maxScroll;
            }
            if (targetScroll - currentScroll < 80) {
                targetScroll = Math.min(maxScroll, currentScroll + 120);
            }
        } else {
            const leftBoundary = currentScroll;
            let targetChild = null;
            for (let i = children.length - 1; i >= 0; i--) {
                const child = children[i];
                const childRect = child.getBoundingClientRect();
                const childRight = childRect.right - containerRect.left + currentScroll;
                if (childRight <= leftBoundary + 20) {
                    targetChild = child;
                    break;
                }
            }
            if (targetChild) {
                const targetChildRect = targetChild.getBoundingClientRect();
                const childLeft = targetChildRect.left - containerRect.left + currentScroll;
                const childWidth = targetChildRect.width;
                targetScroll = childLeft + childWidth - containerWidth;
            } else {
                targetScroll = 0;
            }
            if (currentScroll - targetScroll < 80) {
                targetScroll = Math.max(0, currentScroll - 120);
            }
        }

        targetScroll = Math.max(0, Math.min(maxScroll, targetScroll));
        scrollEl.scrollTo({ left: targetScroll, behavior: "smooth" });
    }

    function init() {
        const tabs = getResultsTabs();
        if (!tabs) return;

        if (!tabs.dataset.lgTabsInsertBeforeOverridden) {
            tabs.dataset.lgTabsInsertBeforeOverridden = "1";
            const originalInsertBefore = tabs.insertBefore;
            tabs.insertBefore = function (newNode, referenceNode) {
                if (referenceNode && referenceNode.id === "tools-bar" && referenceNode.parentElement !== this) {
                    return referenceNode.parentElement.insertBefore(newNode, referenceNode);
                }
                return originalInsertBefore.call(this, newNode, referenceNode);
            };
        }

        syncTabsRail();
        if (!tabs.dataset.lgTabsRailClickWired) {
            tabs.dataset.lgTabsRailClickWired = "1";
            tabs.addEventListener("click", onTabsRailClick);
        }
        if (!tabs.dataset.lgTabsRailObserver) {
            tabs.dataset.lgTabsRailObserver = "1";
            new MutationObserver(() => syncTabsRail()).observe(tabs, {
                childList: true,
            });
        }
    }

    onReady(() => {
        init();
        mobileQuery.addEventListener?.("change", syncTabsRail);
        window.addEventListener("resize", () => updateTabsNavState(), { passive: true });
    });
    window.addEventListener("degoog-results-ready", init);
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
            const maxW = Math.max(
                120,
                body?.clientWidth || wrap.clientWidth || 360,
            );
            const maxH = Math.min(window.innerHeight * 0.62, 560);
            const scale = Math.min(maxW / nw, maxH / nh, 1);
            const w = nw * scale;
            const h = nh * scale;
            wrap.style.width = "100%";
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
            if (host) {
                host.textContent = hostname;
                host.href = link.href;
                host.title = hostname;
            }
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

    function getVisualImageCards() {
        const cards = [...document.querySelectorAll("#results-list .image-card")].filter(
            card => card.offsetParent !== null,
        );
        const rowTolerance = 14;
        cards.sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            if (Math.abs(ar.top - br.top) > rowTolerance) {
                return ar.top - br.top;
            }
            return ar.left - br.left;
        });
        return cards;
    }

    function navigatePreviewByVisualOrder(direction) {
        const cards = getVisualImageCards();
        if (cards.length < 2) return;
        const current = document.querySelector("#results-list .image-card.selected");
        const currentIndex = Math.max(0, cards.indexOf(current));
        const nextIndex = (currentIndex + direction + cards.length) % cards.length;
        const target = cards[nextIndex];
        if (!target) return;
        target.scrollIntoView({ block: "nearest", inline: "nearest" });
        target.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
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
            prevBtn.addEventListener(
                "click",
                e => {
                    if (isVideosTabActive()) return;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    navigatePreviewByVisualOrder(-1);
                },
                true,
            );
        }
        const nextBtn = panel.querySelector("#media-preview-next");
        if (nextBtn) {
            nextBtn.setAttribute("aria-label", getLgTranslation("nextImage"));
            nextBtn.setAttribute("title", getLgTranslation("next"));
            nextBtn.addEventListener(
                "click",
                e => {
                    if (isVideosTabActive()) return;
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    navigatePreviewByVisualOrder(1);
                },
                true,
            );
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

        document.addEventListener(
            "keydown",
            e => {
                if (isVideosTabActive()) return;
                if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                if (!panel.classList.contains("open")) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                navigatePreviewByVisualOrder(e.key === "ArrowLeft" ? -1 : 1);
            },
            true,
        );

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

(() => {
    const LIGHTBOX_OPEN_CLASS = "lg-lightbox-open";
    const ZOOM_LEVELS = [1, 1.8, 2.7];
    const getThemeTranslation =
        typeof getLgTranslation === "function" ? getLgTranslation : getLaTranslation;

    function getLightbox() {
        return document.getElementById("img-lightbox");
    }

    function getLightboxImage() {
        return getLightbox()?.querySelector("#img-lightbox-img, .lg-lightbox-img") || null;
    }

    function getLightboxStage() {
        return getLightbox()?.querySelector("#img-lightbox-wrap, .lg-lightbox-stage") || null;
    }

    function updateLightboxCursor(lightbox, zoomLevel) {
        const stage = lightbox?.querySelector(".lg-lightbox-stage");
        if (!(stage instanceof HTMLElement)) return;
        stage.dataset.cursorMode =
            zoomLevel >= ZOOM_LEVELS.length - 1 ? "zoom-out" : "zoom-in";
    }

    function updateLightboxStatus(lightbox, zoomLevel) {
        const status = lightbox?.querySelector(".lg-lightbox-status, .img-lightbox-status");
        if (!(status instanceof HTMLElement)) return;
        const scale = ZOOM_LEVELS[zoomLevel] || 1;
        status.textContent = `${Number(scale.toFixed(scale === 1 ? 0 : 1))}x`;
    }

    function setLightboxZoom(zoomLevel) {
        const lightbox = getLightbox();
        const img = getLightboxImage();
        if (!(lightbox instanceof HTMLElement) || !(img instanceof HTMLImageElement)) return;
        const nextLevel = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, zoomLevel));
        lightbox.dataset.zoomLevel = String(nextLevel);
        img.style.transform = `scale(${ZOOM_LEVELS[nextLevel] || 1})`;
        if (nextLevel === 0) {
            img.style.transformOrigin = "50% 50%";
        }
        updateLightboxCursor(lightbox, nextLevel);
        updateLightboxStatus(lightbox, nextLevel);
    }

    function syncLightboxTransformOrigin(event) {
        const lightbox = getLightbox();
        const stage = getLightboxStage();
        const img = getLightboxImage();
        if (
            !(lightbox instanceof HTMLElement) ||
            !(stage instanceof HTMLElement) ||
            !(img instanceof HTMLImageElement)
        ) {
            return;
        }
        const zoomLevel = Number.parseInt(lightbox.dataset.zoomLevel || "0", 10) || 0;
        if (zoomLevel === 0) return;
        const rect = stage.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
        img.style.transformOrigin = `${x}% ${y}%`;
    }

    function closeLightbox() {
        const lightbox = getLightbox();
        const img = getLightboxImage();
        if (!(lightbox instanceof HTMLElement)) return;
        lightbox.classList.remove("open");
        lightbox.setAttribute("hidden", "");
        lightbox.setAttribute("aria-hidden", "true");
        lightbox.dataset.zoomLevel = "0";
        getResultsPage()?.classList.remove(LIGHTBOX_OPEN_CLASS);
        document.body.classList.remove(LIGHTBOX_OPEN_CLASS);
        if (img instanceof HTMLImageElement) {
            img.style.transform = "scale(1)";
            img.style.transformOrigin = "50% 50%";
            img.removeAttribute("src");
            img.removeAttribute("alt");
        }
    }

    function cycleLightboxZoom(event) {
        const lightbox = getLightbox();
        if (!(lightbox instanceof HTMLElement) || !lightbox.classList.contains("open")) return;
        syncLightboxTransformOrigin(event);
        const currentLevel = Number.parseInt(lightbox.dataset.zoomLevel || "0", 10) || 0;
        setLightboxZoom((currentLevel + 1) % ZOOM_LEVELS.length);
    }

    function ensureLightbox() {
        const lightbox = getLightbox();
        if (!(lightbox instanceof HTMLElement)) return null;
        const closeLabel = getThemeTranslation("close");
        const hasCoreMarkup =
            lightbox.querySelector("#img-lightbox-wrap") &&
            lightbox.querySelector("#img-lightbox-img") &&
            lightbox.querySelector("#img-lightbox-close") &&
            lightbox.querySelector("#img-lightbox-bg");

        if (!hasCoreMarkup) {
            lightbox.innerHTML =
                `<div class="img-lightbox-bg lg-lightbox-backdrop" id="img-lightbox-bg"></div>` +
                `<button type="button" class="img-lightbox-close lg-lightbox-close" id="img-lightbox-close" aria-label="${closeLabel}" title="${closeLabel}">` +
                `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
                `<line x1="18" y1="6" x2="6" y2="18"></line>` +
                `<line x1="6" y1="6" x2="18" y2="18"></line>` +
                `</svg>` +
                `</button>` +
                `<div class="img-lightbox-wrap lg-lightbox-stage" id="img-lightbox-wrap" role="dialog" aria-modal="true">` +
                `<img class="img-lightbox-img lg-lightbox-img" id="img-lightbox-img" alt="" draggable="false" />` +
                `<div class="img-lightbox-status lg-lightbox-status" aria-hidden="true">1x</div>` +
                `</div>`;
        }

        lightbox.dataset.lgManaged = "1";
        lightbox.setAttribute("hidden", "");
        lightbox.setAttribute("aria-hidden", "true");
        lightbox.dataset.zoomLevel = "0";

        const stage = getLightboxStage();
        const img = getLightboxImage();
        const closeBtn = lightbox.querySelector("#img-lightbox-close, .lg-lightbox-close");
        const backdrop = lightbox.querySelector("#img-lightbox-bg, .lg-lightbox-backdrop");
        stage?.classList.add("lg-lightbox-stage");
        img?.classList.add("lg-lightbox-img");
        closeBtn?.classList.add("lg-lightbox-close");
        backdrop?.classList.add("lg-lightbox-backdrop");
        if (closeBtn instanceof HTMLElement) {
            closeBtn.setAttribute("aria-label", closeLabel);
            closeBtn.setAttribute("title", closeLabel);
        }
        if (stage instanceof HTMLElement) {
            stage.setAttribute("role", "dialog");
            stage.setAttribute("aria-modal", "true");
            if (!stage.querySelector(".lg-lightbox-status, .img-lightbox-status")) {
                const status = document.createElement("div");
                status.className = "img-lightbox-status lg-lightbox-status";
                status.setAttribute("aria-hidden", "true");
                status.textContent = "1x";
                stage.appendChild(status);
            }
        }

        if (lightbox.dataset.lgLightboxWired === "1") return lightbox;
        lightbox.dataset.lgLightboxWired = "1";

        closeBtn?.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            closeLightbox();
        });

        lightbox.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest(".lg-lightbox-close")) return;
            if (target.closest(".lg-lightbox-stage")) {
                event.preventDefault();
                event.stopPropagation();
                cycleLightboxZoom(event);
                return;
            }
            closeLightbox();
        });

        lightbox.addEventListener("mousemove", event => {
            if (!(event.target instanceof Element)) return;
            if (!event.target.closest(".lg-lightbox-stage")) return;
            syncLightboxTransformOrigin(event);
        });

        document.addEventListener(
            "keydown",
            event => {
                if (!lightbox.classList.contains("open")) return;
                if (event.key === "Escape") {
                    event.preventDefault();
                    closeLightbox();
                    return;
                }
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    cycleLightboxZoom(event);
                }
            },
            true,
        );

        return lightbox;
    }

    function openLightboxFromPreview(previewImg, event) {
        if (!(previewImg instanceof HTMLImageElement)) return;
        const src = (previewImg.currentSrc || previewImg.src || "").trim();
        if (!src || /^about:blank$/i.test(src)) return;
        const lightbox = ensureLightbox();
        const img = getLightboxImage();
        if (!(lightbox instanceof HTMLElement) || !(img instanceof HTMLImageElement)) return;
        img.src = src;
        img.alt = previewImg.alt || "";
        lightbox.removeAttribute("hidden");
        lightbox.setAttribute("aria-hidden", "false");
        lightbox.classList.add("open");
        getResultsPage()?.classList.add(LIGHTBOX_OPEN_CLASS);
        document.body.classList.add(LIGHTBOX_OPEN_CLASS);
        setLightboxZoom(0);
        if (event) syncLightboxTransformOrigin(event);
    }

    function bindPreviewLightbox(panel) {
        if (!(panel instanceof HTMLElement) || panel.dataset.lgPreviewLightboxBound === "1") {
            return;
        }
        panel.dataset.lgPreviewLightboxBound = "1";
        panel.addEventListener(
            "click",
            event => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                const previewImg = target.closest("#media-preview-img");
                if (!(previewImg instanceof HTMLImageElement)) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                openLightboxFromPreview(previewImg, event);
            },
            true,
        );
    }

    function init() {
        ensureLightbox();
        bindPreviewLightbox(document.getElementById("media-preview-panel"));
    }

    onReady(init);
    window.addEventListener("degoog-results-ready", init);
})();

(() => {
    const PREVIEW_CLOSING_CLASS = "lg-preview-closing";
    const PREVIEW_OPENING_CLASS = "lg-preview-opening";
    const PREVIEW_EXIT_MS = 320;
    let previewExitTimeout = 0;
    let previewOpenFrame = 0;
    let lastOpenPreviewRect = null;

    function captureOpenPreviewRect(panel) {
        if (!panel?.classList.contains("open")) return;
        const rect = panel.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        lastOpenPreviewRect = {
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
        };
        panel.style.setProperty("--lg-preview-exit-top", `${rect.top}px`);
        panel.style.setProperty("--lg-preview-exit-left", `${rect.left}px`);
        panel.style.setProperty("--lg-preview-exit-width", `${rect.width}px`);
        panel.style.setProperty("--lg-preview-exit-height", `${rect.height}px`);
    }

    function cancelPreviewExit(panel) {
        window.clearTimeout(previewExitTimeout);
        previewExitTimeout = 0;
        panel?.classList.remove(PREVIEW_CLOSING_CLASS);
    }

    function cancelPreviewOpenBypass(panel) {
        if (previewOpenFrame) {
            cancelAnimationFrame(previewOpenFrame);
            previewOpenFrame = 0;
        }
        panel?.classList.remove(PREVIEW_OPENING_CLASS);
    }

    function startPreviewExit(panel) {
        if (!panel) return;
        cancelPreviewExit(panel);
        cancelPreviewOpenBypass(panel);
        if (lastOpenPreviewRect) {
            panel.style.setProperty("--lg-preview-exit-top", `${lastOpenPreviewRect.top}px`);
            panel.style.setProperty("--lg-preview-exit-left", `${lastOpenPreviewRect.left}px`);
            panel.style.setProperty("--lg-preview-exit-width", `${lastOpenPreviewRect.width}px`);
            panel.style.setProperty("--lg-preview-exit-height", `${lastOpenPreviewRect.height}px`);
        }
        panel.classList.add(PREVIEW_CLOSING_CLASS);
        previewExitTimeout = window.setTimeout(() => {
            panel.classList.remove(PREVIEW_CLOSING_CLASS);
            previewExitTimeout = 0;
        }, PREVIEW_EXIT_MS);
    }

    function startPreviewOpen(panel) {
        if (!panel) return;
        cancelPreviewExit(panel);
        cancelPreviewOpenBypass(panel);
        panel.classList.add(PREVIEW_OPENING_CLASS);
        previewOpenFrame = requestAnimationFrame(() => {
            previewOpenFrame = requestAnimationFrame(() => {
                panel.classList.remove(PREVIEW_OPENING_CLASS);
                previewOpenFrame = 0;
            });
        });
    }

    function init() {
        const panel = getMediaPreviewPanel();
        if (!panel) return;

        let wasOpen = panel.classList.contains("open");
        if (wasOpen) captureOpenPreviewRect(panel);
        new MutationObserver(() => {
            const isOpen = panel.classList.contains("open");
            if (isOpen === wasOpen) return;

            if (isOpen) {
                startPreviewOpen(panel);
                requestAnimationFrame(() => captureOpenPreviewRect(panel));
            } else {
                startPreviewExit(panel);
            }
            wasOpen = isOpen;
        }).observe(panel, { attributes: true, attributeFilter: ["class"] });

        window.addEventListener(
            "scroll",
            () => {
                if (panel.classList.contains("open")) captureOpenPreviewRect(panel);
            },
            { passive: true },
        );
        window.addEventListener("resize", () => captureOpenPreviewRect(panel));
    }

    onReady(init);
})();

(() => {
    function usesImageFabDrawerChrome() {
        return getResultsPage()?.classList.contains("lg-image-fab-filters");
    }

    function syncImageSidebarChrome() {
        const close = document.querySelector("#image-filters-bar .degoog-img-sidebar-close");
        if (!close) return;
        if (!("lgDefaultInnerHtml" in close.dataset)) {
            close.dataset.lgDefaultInnerHtml = close.innerHTML;
        }
        if (!("lgDefaultAriaLabel" in close.dataset)) {
            close.dataset.lgDefaultAriaLabel = close.getAttribute("aria-label") || "";
        }

        if (usesImageFabDrawerChrome()) {
            if (close.dataset.lgFabPullTab === "1") return;
            close.classList.add("lg-drawer-pull-tab");
            close.innerHTML = "";
            close.setAttribute("aria-label", getLgTranslation("close"));
            close.dataset.lgFabPullTab = "1";
            return;
        }

        if (close.dataset.lgFabPullTab !== "1") return;
        close.classList.remove("lg-drawer-pull-tab");
        delete close.dataset.lgFabPullTab;
        close.innerHTML = close.dataset.lgDefaultInnerHtml || "";
        if (close.dataset.lgDefaultAriaLabel) {
            close.setAttribute("aria-label", close.dataset.lgDefaultAriaLabel);
        } else {
            close.removeAttribute("aria-label");
        }
    }

    function init() {
        syncImageSidebarChrome();
        const page = getResultsPage();
        if (!page) return;
        new MutationObserver(syncImageSidebarChrome).observe(page, {
            childList: true,
            subtree: true,
        });
    }

    onReady(init);
    window.addEventListener("lg-sync-sidebar-chrome", syncImageSidebarChrome);
})();

/* ── 5b. Image grid fold-in when preview pane opens ───────────────────── */
(() => {
    const COL_BREAKPOINTS = [
        [800, 3],
        [1100, 4],
        [1400, 5],
        [Infinity, 6],
    ];
    const MIN_COL_PX = 72;
    const COL_GAP_PX = 4;
    const MIN_COL_COUNT = 2;
    let internalGridMutationTimer = 0;
    let ignoreInternalGridMutations = false;

    function baseColumnsForWidth(width) {
        const w = Math.max(0, width);
        for (const [max, cols] of COL_BREAKPOINTS) {
            if (w <= max) return cols;
        }
        return 3;
    }

    function isPreviewOpen() {
        return document.getElementById("media-preview-panel")?.classList.contains("open") ?? false;
    }

    function isDockedPreviewOpen() {
        return isDockedMediaPreviewOpen();
    }

    function measureWidth(grid) {
        const main = grid.closest("#results-main");
        if (main?.clientWidth) return main.clientWidth;
        return grid.clientWidth || window.innerWidth;
    }

    let fallbackSeq = 0;
    function markInternalGridMutation() {
        ignoreInternalGridMutations = true;
        window.clearTimeout(internalGridMutationTimer);
        internalGridMutationTimer = window.setTimeout(() => {
            ignoreInternalGridMutations = false;
            internalGridMutationTimer = 0;
        }, 0);
    }

    function runGridMutationBatch(mutator) {
        markInternalGridMutation();
        return mutator();
    }

    function itemSortKey(item) {
        const rawIdx = item.getAttribute("data-idx") || item.dataset.idx || "";
        const parsed = Number.parseInt(rawIdx, 10);
        if (Number.isFinite(parsed)) {
            return { primary: parsed, secondary: 0 };
        }
        if (!item.dataset.lgImageSeq) {
            fallbackSeq += 1;
            item.dataset.lgImageSeq = String(fallbackSeq);
        }
        return {
            primary: 1_000_000,
            secondary: Number.parseInt(item.dataset.lgImageSeq, 10) || 0,
        };
    }

    function collectGridItems(grid) {
        const items = [];
        for (const col of grid.querySelectorAll(":scope > .image-column")) {
            items.push(...col.children);
        }
        for (const child of grid.querySelectorAll(
            ":scope > .image-card, :scope > .skeleton-media-card",
        )) {
            items.push(child);
        }
        items.sort((a, b) => {
            const ka = itemSortKey(a);
            const kb = itemSortKey(b);
            if (ka.primary !== kb.primary) return ka.primary - kb.primary;
            return ka.secondary - kb.secondary;
        });
        return items;
    }

    function pickShortestColumn(columns) {
        const visible = columns.filter(col => !col.classList.contains("lg-image-col-hidden"));
        const pool = visible.length ? visible : columns;
        return pool.reduce((best, col) => {
            if (col.offsetHeight < best.offsetHeight) return col;
            if (col.offsetHeight > best.offsetHeight) return best;
            return col.children.length <= best.children.length ? col : best;
        });
    }

    function ensureColumnCount(grid, count) {
        const target = Math.max(MIN_COL_COUNT, count);
        return runGridMutationBatch(() => {
            let columns = [...grid.querySelectorAll(":scope > .image-column")];
            while (columns.length < target) {
                const col = document.createElement("div");
                col.className = "image-column";
                grid.appendChild(col);
                columns.push(col);
            }
            while (columns.length > target) {
                const col = columns.pop();
                const dest = pickShortestColumn(columns);
                if (col && dest) {
                    while (col.firstChild) dest.appendChild(col.firstChild);
                }
                col?.remove();
            }
            return [...grid.querySelectorAll(":scope > .image-column")];
        });
    }

    function syncColumnChildren(column, nextChildren) {
        const currentChildren = [...column.children];
        const isUnchanged =
            currentChildren.length === nextChildren.length &&
            currentChildren.every((child, index) => child === nextChildren[index]);
        if (isUnchanged) return;
        column.replaceChildren(...nextChildren);
    }

    function distributeItems(columns, items) {
        if (!columns.length) return;
        const buckets = columns.map(() => []);
        items.forEach((item, index) => {
            buckets[index % columns.length].push(item);
        });
        runGridMutationBatch(() => {
            columns.forEach((column, index) => {
                syncColumnChildren(column, buckets[index]);
            });
        });
    }

    function stabilizeGrid(grid) {
        const items = collectGridItems(grid);
        if (!items.length) return;

        const baseCols = baseColumnsForWidth(window.innerWidth);
        const columns = ensureColumnCount(grid, baseCols);
        distributeItems(columns, items);

        grid.dataset.lgGridBaseCols = String(baseCols);
        grid.dataset.lgVisibleCols = String(baseCols);
        grid.classList.add("lg-image-grid-fold");
        for (const col of columns) {
            col.classList.remove("lg-image-col-hidden");
        }
    }

    function absorbNewItems(grid) {
        const columns = [...grid.querySelectorAll(":scope > .image-column")].filter(
            col => !col.classList.contains("lg-image-col-hidden"),
        );
        if (!columns.length) return;

        const loose = [...grid.querySelectorAll(
            ":scope > .image-card, :scope > .skeleton-media-card",
        )];
        if (!loose.length) return;

        loose.sort((a, b) => {
            const ka = itemSortKey(a);
            const kb = itemSortKey(b);
            if (ka.primary !== kb.primary) return ka.primary - kb.primary;
            return ka.secondary - kb.secondary;
        });

        runGridMutationBatch(() => {
            for (const item of loose) {
                pickShortestColumn(columns).appendChild(item);
            }
        });
    }

    function mergeColumnAt(columns, index) {
        const column = columns[index];
        if (!column || column.classList.contains("lg-image-col-hidden")) return;
        const targets = columns.slice(0, index).filter(
            col => !col.classList.contains("lg-image-col-hidden"),
        );
        if (!targets.length) return;
        const dest = pickShortestColumn(targets);
        while (column.firstChild) dest.appendChild(column.firstChild);
        column.classList.add("lg-image-col-hidden");
    }

    function showAllColumns(columns) {
        for (const col of columns) {
            col.classList.remove("lg-image-col-hidden");
        }
    }

    function targetColumnsForWidth(available, baseCols) {
        let cols = baseCols;
        while (cols > MIN_COL_COUNT) {
            const widthPerCol = (available - COL_GAP_PX * (cols - 1)) / cols;
            if (widthPerCol >= MIN_COL_PX) return { cols, widthPerCol };
            cols -= 1;
        }
        const widthPerCol =
            (available - COL_GAP_PX * (MIN_COL_COUNT - 1)) / MIN_COL_COUNT;
        return { cols: MIN_COL_COUNT, widthPerCol };
    }

    function resetGrid(grid) {
        const baseCols =
            Number.parseInt(grid.dataset.lgGridBaseCols, 10) ||
            baseColumnsForWidth(window.innerWidth);
        const columns = ensureColumnCount(grid, baseCols);
        showAllColumns(columns);
        const items = collectGridItems(grid);
        distributeItems(columns, items);
        grid.dataset.lgVisibleCols = String(baseCols);
    }

    function syncBaseGrid(grid) {
        const desiredBaseCols = baseColumnsForWidth(window.innerWidth);
        const currentBaseCols =
            Number.parseInt(grid.dataset.lgGridBaseCols, 10) || desiredBaseCols;

        if (currentBaseCols === desiredBaseCols) return desiredBaseCols;

        const columns = ensureColumnCount(grid, desiredBaseCols);
        showAllColumns(columns);
        const items = collectGridItems(grid);
        distributeItems(columns, items);
        grid.dataset.lgGridBaseCols = String(desiredBaseCols);
        grid.dataset.lgVisibleCols = String(desiredBaseCols);
        return desiredBaseCols;
    }

    function applyFold(grid) {
        if (!grid?.isConnected || !grid.classList.contains("lg-image-grid-fold")) return;

        const baseCols = syncBaseGrid(grid);
        const available = measureWidth(grid);
        const dockedPreviewOpen = isDockedPreviewOpen();

        if (!dockedPreviewOpen) {
            const visibleCols =
                Number.parseInt(grid.dataset.lgVisibleCols, 10) || baseCols;
            if (visibleCols !== baseCols) resetGrid(grid);
            const { widthPerCol } = targetColumnsForWidth(available, baseCols);
            grid.style.setProperty(
                "--lg-col-min",
                `${Math.min(160, Math.max(MIN_COL_PX, widthPerCol))}px`,
            );
            return;
        }

        const { cols, widthPerCol } = targetColumnsForWidth(available, baseCols);
        let columns = [...grid.querySelectorAll(":scope > .image-column")];
        const visibleCols =
            Number.parseInt(grid.dataset.lgVisibleCols, 10) || columns.length;

        if (cols !== visibleCols) {
            columns = ensureColumnCount(grid, baseCols);
            showAllColumns(columns);
            for (let i = columns.length - 1; i >= cols; i--) {
                mergeColumnAt(columns, i);
            }
            grid.dataset.lgVisibleCols = String(cols);
        }

        grid.style.setProperty(
            "--lg-col-min",
            `${Math.max(MIN_COL_PX, Math.min(160, widthPerCol))}px`,
        );
    }

    function scrollSelectedImageIntoView() {
        const selected = document.querySelector("#results-list .image-card.selected");
        if (!(selected instanceof HTMLElement)) return;

        const rect = selected.getBoundingClientRect();
        const rootStyles = getComputedStyle(document.documentElement);
        const stickyOffset =
            Number.parseFloat(
                rootStyles.getPropertyValue("--literallygoogle-sticky-header-offset"),
            ) || 0;
        const topBoundary = Math.max(0, stickyOffset);
        const bottomBoundary = window.innerHeight;

        if (rect.top < topBoundary) {
            window.scrollBy(0, rect.top - topBoundary);
            return;
        }

        if (rect.bottom > bottomBoundary) {
            window.scrollBy(0, rect.bottom - bottomBoundary);
            return;
        }

        selected.scrollIntoView({ block: "nearest", inline: "nearest" });
    }

    let scrollSelectedFrame = 0;
    function scheduleScrollToSelected() {
        if (!isDockedPreviewOpen()) return;
        if (!document.querySelector("#results-list .image-card.selected")) return;
        if (scrollSelectedFrame) return;
        scrollSelectedFrame = requestAnimationFrame(() => {
            scrollSelectedFrame = 0;
            requestAnimationFrame(() => {
                scrollSelectedImageIntoView();
            });
        });
    }

    function bindGrid(grid) {
        if (!grid) return;
        if (markWired(grid, "lgFoldBound")) {
            stabilizeGrid(grid);
        } else {
            absorbNewItems(grid);
        }
        applyFold(grid);

        grid.querySelectorAll(".image-thumb-wrap:not(.loaded)").forEach(wrap => {
            const img = wrap.querySelector("img.image-thumb");
            if (img && img.complete) {
                wrap.classList.add("loaded");
            }
        });

        scheduleScrollToSelected();
    }

    function scanGrids() {
        document
            .querySelectorAll("#results-list .image-grid")
            .forEach(bindGrid);
    }

    let foldFrame = 0;
    function scheduleFold() {
        if (foldFrame) return;
        foldFrame = requestAnimationFrame(() => {
            foldFrame = 0;
            document
                .querySelectorAll("#results-list .image-grid.lg-image-grid-fold")
                .forEach(applyFold);
            scheduleScrollToSelected();
            if (isDockedPreviewOpen()) {
                window.dispatchEvent(new CustomEvent("lg-results-layout-changed"));
            }
        });
    }

    const main = document.getElementById("results-main");
    if (main && typeof ResizeObserver !== "undefined") {
        new ResizeObserver(scheduleFold).observe(main);
    }

    const preview = document.getElementById("media-preview-panel");
    if (preview) {
        new MutationObserver(() => {
            scanGrids();
            window.dispatchEvent(new CustomEvent("lg-results-layout-changed"));
            if (preview.classList.contains("open")) {
                scheduleFold();
                requestAnimationFrame(scrollSelectedImageIntoView);
            } else {
                document
                    .querySelectorAll("#results-list .image-grid.lg-image-grid-fold")
                    .forEach(resetGrid);
            }
        }).observe(preview, { attributes: true, attributeFilter: ["class"] });

        preview.addEventListener("transitionend", event => {
            if (!preview.classList.contains("open")) return;
            if (
                event.target !== preview ||
                !["flex-basis", "width", "transform", "max-width"].includes(
                    event.propertyName,
                )
            ) {
                return;
            }
            window.dispatchEvent(new CustomEvent("lg-results-layout-changed"));
            scheduleFold();
            scrollSelectedImageIntoView();
        });
    }

    window.addEventListener("resize", scheduleFold);
    window.addEventListener("degoog-results-ready", () => {
        scanGrids();
        scheduleFold();
    });

    const resultsList = getResultsList();
    if (resultsList) {
        new MutationObserver(mutations => {
            if (ignoreInternalGridMutations) return;
            let needsBind = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    if (
                        node.matches?.(".image-grid") ||
                        node.querySelector?.(".image-grid, .image-card")
                    ) {
                        needsBind = true;
                        break;
                    }
                }
                if (needsBind) break;
            }
            if (needsBind) scanGrids();
            else scheduleFold();
            scheduleScrollToSelected();
        }).observe(resultsList, { childList: true, subtree: true });
    }

    document.addEventListener("load", (event) => {
        if (event.target instanceof HTMLImageElement) {
            markImageThumbLoaded(event.target);
        }
    }, true);

    scanGrids();
})();

/* ── 5c. Engine performance row → filter results by engine ─────────────── */
(() => {
    const FILTER_ATTR = "data-lg-engine-filter";
    const ACTIVE_CLASS = "lg-engine-stat-row--active";
    const HIDDEN_CLASS = "lg-engine-filtered-out";
    const RESULT_SELECTORS = ".result-item, .image-card, .video-card";
    const PILLS_CONTAINER_ID = "lg-media-engine-pills";
    const PILLS_BUTTON_SELECTOR = ".lg-media-engine-pill";
    const PILLS_SCROLL_SELECTOR = ".lg-media-engine-pills__scroll";
    const DESKTOP_MIN = 768;
    const STICKY_RAIL_REVEAL_DISTANCE = 50;
    let stickyRailFrame = 0;
    let lastDockedPreviewOpen = null;
    let lastMediaMetaRightGap = null;
    let mediaMetaGapFrame = 0;

    function installEngineResultLearnerEarly() {
        if (EventSource.prototype.__lgEngineLearner) return;
        const nativeAdd = EventSource.prototype.addEventListener;
        EventSource.prototype.addEventListener = function (type, listener, options) {
            if (type === "engine-result" && typeof listener === "function") {
                const stream = this;
                const wrapped = event => {
                    try {
                        if (!stream.__lgEngineStreamSeen) {
                            stream.__lgEngineStreamSeen = true;
                            resetSourceEngineLearner();
                        }
                        const data = JSON.parse(event.data);
                        ingestEngineResultBatch(data.engine, data.results);
                    } catch {
                        /* Some stream events do not carry JSON result payloads. */
                    }
                    return listener.call(this, event);
                };
                return nativeAdd.call(this, type, wrapped, options);
            }
            return nativeAdd.call(this, type, listener, options);
        };
        EventSource.prototype.__lgEngineLearner = true;
    }

    installEngineResultLearnerEarly();

    function getPage() {
        return getResultsPage();
    }

    function normalizeEngine(name) {
        return (name || "").trim().toLowerCase();
    }

    function compactEngineToken(name) {
        return normalizeEngine(name).replace(/[^a-z0-9]+/g, "");
    }

    /** Sources learned from SSE engine-result batches (source tag → engine display names). */
    const sourceEngineAliases = new Map();
    let streamUrlSources = new Map();

    function resetSourceEngineLearner() {
        sourceEngineAliases.clear();
        streamUrlSources = new Map();
    }

    function rememberSourceEngine(source, engineName) {
        const srcKey = normalizeEngine(source);
        const engKey = normalizeEngine(engineName);
        if (!srcKey || !engKey) return;
        let aliases = sourceEngineAliases.get(srcKey);
        if (!aliases) {
            aliases = new Set();
            sourceEngineAliases.set(srcKey, aliases);
        }
        aliases.add(engKey);
    }

    function ingestEngineResultBatch(engineName, results) {
        if (!engineName || !Array.isArray(results)) return;
        for (const result of results) {
            const sources = Array.isArray(result.sources)
                ? result.sources.map(part => String(part).trim()).filter(Boolean)
                : result.source
                  ? [String(result.source).trim()]
                  : [];
            if (!result.url || !sources.length) continue;

            const prev = streamUrlSources.get(result.url) || new Set();
            const next = new Set(sources);
            for (const source of next) {
                if (!prev.has(source)) {
                    rememberSourceEngine(source, engineName);
                }
            }
            streamUrlSources.set(result.url, next);
        }
        if (getSelectedEngines().length) {
            requestAnimationFrame(() => applyFilter(getSelectedEngines()));
        }
    }

    function sourceKnownForEngine(source, engineName) {
        const aliases = sourceEngineAliases.get(normalizeEngine(source));
        return aliases?.has(normalizeEngine(engineName)) ?? false;
    }

    function sourceMatchesEngineStrict(source, engineName) {
        const normalized = normalizeEngine(source);
        const needle = normalizeEngine(engineName);
        if (!needle) return true;
        if (normalized === needle) return true;
        if (normalized.startsWith(`${needle}:`)) return true;

        const sourceBase = normalized.split(":")[0]?.trim();
        if (!sourceBase) return false;
        if (sourceBase === needle) return true;
        if (needle.startsWith(`${sourceBase} `)) return true;
        if (sourceBase.startsWith(`${needle} `)) return true;

        const compactSource = compactEngineToken(source);
        const compactNeedle = compactEngineToken(engineName);
        const compactBase = compactEngineToken(sourceBase);
        if (!compactNeedle) return true;
        if (compactSource === compactNeedle) return true;
        if (compactBase && compactNeedle.startsWith(compactBase)) return true;
        if (compactBase && compactBase.startsWith(compactNeedle)) return true;
        return false;
    }

    function sourceMatchesEngine(source, engineName) {
        if (sourceMatchesEngineStrict(source, engineName)) return true;
        return sourceKnownForEngine(source, engineName);
    }

    function enginePanelRoots() {
        return [
            document.getElementById("results-sidebar"),
            document.getElementById("image-engine-panel"),
        ].filter(Boolean);
    }

    function isDesktopImagePillsMode() {
        return getActiveSearchType() === "images" && window.innerWidth >= DESKTOP_MIN;
    }

    function stickySidebarEnabled() {
        return document.getElementById("sidebar-col")?.classList.contains("is-sticky") ?? false;
    }

    function getStickyRailTop() {
        const header = document.getElementById("results-header");
        const tabs = getResultsTabs();
        const fallback =
            Number.parseFloat(
                getComputedStyle(document.documentElement).getPropertyValue(
                     "--literallygoogle-sticky-header-offset",
                ),
            ) || 0;

        const headerBottom =
            header instanceof HTMLElement ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
        if (!(tabs instanceof HTMLElement)) return headerBottom || fallback;

        const tabsRect = tabs.getBoundingClientRect();
        if (tabsRect.bottom > 0) return Math.max(headerBottom, tabsRect.bottom);
        return headerBottom || fallback;
    }

    function getMediaMetaRightEdge() {
        const railRight = getMediaContentRailRightEdge();
        if (railRight !== null) return railRight;
        return getNormalResultsRightEdge();
    }

    function syncMediaMetaRightGap() {
        const meta = getResultsMeta();
        if (!meta) return;
        wrapResultsStats(meta);
        if (!isDesktopImagePillsMode()) {
            meta.style.removeProperty("--lg-media-meta-right-gap");
            lastMediaMetaRightGap = null;
            return;
        }
        const targetRight = getMediaMetaRightEdge();
        if (targetRight === null) {
            meta.style.removeProperty("--lg-media-meta-right-gap");
            lastMediaMetaRightGap = null;
            return;
        }
        const metaRect = meta.getBoundingClientRect();
        const gap = Math.max(0, Math.round(metaRect.right - targetRight));
        if (gap === lastMediaMetaRightGap) return;
        lastMediaMetaRightGap = gap;
        meta.style.setProperty("--lg-media-meta-right-gap", `${gap}px`);
    }

    function scheduleMediaMetaRightGap() {
        if (mediaMetaGapFrame) return;
        mediaMetaGapFrame = requestAnimationFrame(() => {
            mediaMetaGapFrame = 0;
            syncMediaMetaRightGap();
        });
    }

    function getNormalResultsRightEdge() {
        const visibleColumnRects = [
            ...document.querySelectorAll(
                "#results-list .image-grid > .image-column:not(.lg-image-col-hidden)",
            ),
        ]
            .filter(column => column instanceof HTMLElement)
            .map(column => column.getBoundingClientRect())
            .filter(rect => rect.width > 1 && rect.height > 1);
        if (visibleColumnRects.length) {
            return Math.max(...visibleColumnRects.map(rect => rect.right));
        }

        const visibleCardRects = [
            ...document.querySelectorAll("#results-list .image-card, #results-list .skeleton-image-card"),
        ]
            .filter(card => card instanceof HTMLElement)
            .map(card => card.getBoundingClientRect())
            .filter(rect => rect.width > 1 && rect.height > 1);
        if (visibleCardRects.length) {
            return Math.max(...visibleCardRects.map(rect => rect.right));
        }

        const meta = getResultsMeta();
        if (meta) {
            const metaRect = meta.getBoundingClientRect();
            const paddingStart = parseFloat(getComputedStyle(meta).paddingLeft) || 150;
            const layoutMax = 1216; // 76rem
            const expectedRight = metaRect.left + paddingStart + layoutMax;
            return Math.min(window.innerWidth - 32, expectedRight);
        }

        const resultsListRect = getResultsList()?.getBoundingClientRect();
        if (resultsListRect?.width) return resultsListRect.right;

        const resultsMainRect = document.getElementById("results-main")?.getBoundingClientRect();
        return resultsMainRect?.right ?? window.innerWidth;
    }

    function getMediaResultsRightEdge() {
        if (isDockedMediaPreviewOpen()) {
            const panel = getMediaPreviewPanel();
            const panelRect = panel?.getBoundingClientRect();
            if (panelRect && panelRect.width > 1) {
                return panelRect.left - 10;
            }
        }
        return getMediaMetaRightEdge();
    }

    function pruneMediaEngineRailPlaceholders(meta, host) {
        if (!(meta instanceof HTMLElement)) return;
        const keeper =
            host?.nextElementSibling instanceof HTMLElement &&
            host.nextElementSibling.classList.contains("lg-media-engine-rail-placeholder")
                ? host.nextElementSibling
                : null;
        meta.querySelectorAll(":scope > .lg-media-engine-rail-placeholder").forEach(placeholder => {
            if (placeholder !== keeper) placeholder.remove();
        });
    }

    function resetStickyRailMetrics(host) {
        if (!host) return;
        delete host.dataset.stickBaseWidth;
        delete host.dataset.stickBaseLeft;
        delete host.dataset.stickBaseHeight;
    }

    function getMediaEnginePillsHost() {
        return document.getElementById(PILLS_CONTAINER_ID);
    }

    function ensureMediaEnginePillsHost() {
        const meta = getResultsMeta();
        if (!meta || !isDesktopImagePillsMode()) return null;

        let host = document.getElementById(PILLS_CONTAINER_ID);
        if (!host) {
            host = document.createElement("div");
            host.id = PILLS_CONTAINER_ID;
            host.className = "lg-media-engine-rail";
            host.innerHTML =
                `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--prev" data-lg-engine-scroll="prev" aria-label="Scroll engine filters left">` +
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg>` +
                `</button>` +
                `<div class="lg-media-engine-pills__scroll">` +
                `<div class="lg-media-engine-pills" role="group" aria-label="Engine filters"></div>` +
                `</div>` +
                `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--next" data-lg-engine-scroll="next" aria-label="Scroll engine filters right">` +
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>` +
                `</button>`;
        }

        const stats = meta.querySelector(".results-meta-stats");
        const spellCheck = meta.querySelector(".spell-check-notice");
        const anchor = spellCheck || stats || null;
        if (host.parentElement !== meta) {
            meta.insertBefore(host, anchor);
        }
        pruneMediaEngineRailPlaceholders(meta, host);
        return host;
    }

    function removeMediaEnginePillsHost() {
        const meta = getResultsMeta();
        const host = getMediaEnginePillsHost();
        const placeholder = host?.nextElementSibling;
        if (placeholder instanceof HTMLElement && placeholder.classList.contains("lg-media-engine-rail-placeholder")) {
            placeholder.remove();
        }
        host?.remove();
        pruneMediaEngineRailPlaceholders(meta, null);
    }

    function imageEngineRows() {
        return [
            ...document.querySelectorAll(
                "#image-engine-panel .engine-stat-row, #image-filters-bar .engine-stat-row",
            ),
        ].filter(row => row instanceof HTMLElement);
    }

    function summarizeRow(row) {
        const label = row.querySelector(".engine-stat-label")?.textContent?.trim() || "";
        const meta = row.querySelector(".engine-stat-meta")?.textContent?.trim() || "";
        return { label, meta };
    }

    function syncPillHighlights(selectedEngines) {
        const active = new Set(selectedEngines.map(normalizeEngine));
        getMediaEnginePillsHost()
            ?.querySelectorAll(PILLS_BUTTON_SELECTOR)
            .forEach(button => {
                const name = normalizeEngine(button.getAttribute("data-engine-name"));
                const isActive = active.has(name);
                button.classList.toggle("is-active", isActive);
                button.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
    }

    function updatePillNavState() {
        const host = getMediaEnginePillsHost();
        const scrollEl = host?.querySelector(PILLS_SCROLL_SELECTOR);
        const prevBtn = host?.querySelector('[data-lg-engine-scroll="prev"]');
        const nextBtn = host?.querySelector('[data-lg-engine-scroll="next"]');
        if (!scrollEl || !prevBtn || !nextBtn) return;
        if (scrollEl.scrollWidth <= scrollEl.clientWidth) {
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        const atStart = scrollEl.scrollLeft <= 0;
        const atEnd = scrollEl.scrollLeft >= scrollEl.scrollWidth - scrollEl.clientWidth - 1;
        prevBtn.disabled = atStart;
        nextBtn.disabled = atEnd;
    }

    function horizontalPillScrollStep(scrollEl) {
        return Math.max(120, Math.round(scrollEl.clientWidth * 0.72));
    }

    function initPillRail(host) {
        if (!host || host.dataset.lgPillRailInit === "1") return;
        const scrollEl = host.querySelector(PILLS_SCROLL_SELECTOR);
        const prevBtn = host.querySelector('[data-lg-engine-scroll="prev"]');
        const nextBtn = host.querySelector('[data-lg-engine-scroll="next"]');
        if (!scrollEl || !prevBtn || !nextBtn) return;
        host.dataset.lgPillRailInit = "1";

        const refresh = () => updatePillNavState();
        scrollEl.addEventListener("scroll", refresh, { passive: true });
        const ro = new ResizeObserver(refresh);
        ro.observe(scrollEl);
        ro.observe(host);
        refresh();
    }

    function ensureRailPlaceholder(host) {
        let placeholder = host.nextElementSibling;
        if (!(placeholder instanceof HTMLElement) || !placeholder.classList.contains("lg-media-engine-rail-placeholder")) {
            placeholder = document.createElement("div");
            placeholder.className = "lg-media-engine-rail-placeholder";
            placeholder.setAttribute("aria-hidden", "true");
            host.after(placeholder);
        }
        return placeholder;
    }

    function clearStickyRailStyles(host, meta) {
        host?.classList.remove("lg-media-engine-rail--stuck");
        meta?.classList.remove("lg-media-engine-meta--rail-stuck");
        resetStickyRailMetrics(host);
        if (!host) return;
        host.style.removeProperty("--lg-engine-rail-top");
        host.style.removeProperty("position");
        host.style.removeProperty("top");
        host.style.removeProperty("left");
        host.style.removeProperty("width");
        host.style.removeProperty("margin-inline-start");
        const placeholder = host.nextElementSibling;
        if (placeholder instanceof HTMLElement && placeholder.classList.contains("lg-media-engine-rail-placeholder")) {
            placeholder.hidden = true;
            placeholder.style.removeProperty("min-height");
        }
        pruneMediaEngineRailPlaceholders(meta, host);
    }

    function updateStickyEngineRail() {
        stickyRailFrame = 0;
        const host = getMediaEnginePillsHost();
        const meta = getResultsMeta();
        if (!host || !meta || host.hidden || !isDesktopImagePillsMode() || !stickySidebarEnabled()) {
            clearStickyRailStyles(host, meta);
            lastDockedPreviewOpen = null;
            return;
        }

        const dockedPreviewOpen = isDockedMediaPreviewOpen();
        if (dockedPreviewOpen !== lastDockedPreviewOpen) {
            resetStickyRailMetrics(host);
            lastDockedPreviewOpen = dockedPreviewOpen;
        }

        const stickyTop = getStickyRailTop();
        const metaRect = meta.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();

        if (!host.classList.contains("lg-media-engine-rail--stuck")) {
            host.dataset.naturalOffset = String(hostRect.top - metaRect.top);
        }
        const naturalOffset = parseFloat(host.dataset.naturalOffset) || 0;
        const naturalRailTop = metaRect.top + naturalOffset;
        const targetStickyTop = stickyTop + 10;
        const isStuck = naturalRailTop <= targetStickyTop;

        if (!isStuck) {
            clearStickyRailStyles(host, meta);
            return;
        }

        if (!host.dataset.stickBaseWidth) {
            host.dataset.stickBaseWidth = String(hostRect.width);
            host.dataset.stickBaseLeft = String(hostRect.left);
            host.dataset.stickBaseHeight = String(hostRect.height);
        }

        const revealProgress = Math.min(
            1,
            Math.max(0, (targetStickyTop - naturalRailTop) / STICKY_RAIL_REVEAL_DISTANCE),
        );
        const paddingStart = parseFloat(getComputedStyle(meta).paddingLeft) || 0;
        const stuckLeft = getMediaResultsLeftEdge() ?? metaRect.left + paddingStart;
        const contentRight = Math.max(stuckLeft, getMediaResultsRightEdge());
        const targetWidth = Math.max(0, contentRight - stuckLeft);
        const baseLeft = parseFloat(host.dataset.stickBaseLeft) || hostRect.left;
        const baseWidth = parseFloat(host.dataset.stickBaseWidth) || hostRect.width;
        const width = baseWidth + (targetWidth - baseWidth) * revealProgress;
        const left = baseLeft + (stuckLeft - baseLeft) * revealProgress;

        const placeholder = ensureRailPlaceholder(host);
        placeholder.hidden = false;
        placeholder.style.minHeight = `${host.dataset.stickBaseHeight || hostRect.height}px`;

        host.classList.add("lg-media-engine-rail--stuck");
        host.style.setProperty("--lg-engine-rail-top", `${targetStickyTop}px`);
        host.style.left = `${left}px`;
        host.style.width = `${width}px`;
        updatePillNavState();
    }

    function scheduleStickyEngineRailUpdate() {
        if (stickyRailFrame) return;
        stickyRailFrame = requestAnimationFrame(updateStickyEngineRail);
    }

    function renderMediaEnginePills() {
        if (!isDesktopImagePillsMode()) {
            scheduleMediaMetaRightGap();
            getResultsMeta()?.style.removeProperty("--lg-media-meta-right-gap");
            removeMediaEnginePillsHost();
            return;
        }

        const rows = imageEngineRows();
        const host = ensureMediaEnginePillsHost();
        if (!host) return;
        scheduleMediaMetaRightGap();
        const pills = host.querySelector(".lg-media-engine-pills");
        if (!pills) return;
        initPillRail(host);

        const scrollEl = host.querySelector(PILLS_SCROLL_SELECTOR);
        const prevScrollLeft = scrollEl ? scrollEl.scrollLeft : 0;

        if (!rows.length) {
            pills.replaceChildren();
            host.hidden = true;
            updatePillNavState();
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const row of rows) {
            const { label, meta } = summarizeRow(row);
            if (!label) continue;

            const button = document.createElement("button");
            button.type = "button";
            button.className = "lg-media-engine-pill";
            button.setAttribute("data-engine-name", label);
            button.setAttribute("aria-pressed", "false");

            const labelSpan = document.createElement("span");
            labelSpan.className = "lg-media-engine-pill__label";
            labelSpan.textContent = label;
            button.appendChild(labelSpan);

            if (meta) {
                const metaSpan = document.createElement("span");
                metaSpan.className = "lg-media-engine-pill__meta";
                metaSpan.textContent = meta;
                button.appendChild(metaSpan);
            }

            fragment.appendChild(button);
        }

        pills.replaceChildren(fragment);
        host.hidden = pills.childElementCount === 0;

        if (scrollEl) {
            scrollEl.scrollLeft = prevScrollLeft;
        }

        syncPillHighlights(getSelectedEngines());
        updatePillNavState();
        scheduleStickyEngineRailUpdate();
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
        syncPillHighlights(selectedEngines);
    }

    function applyFilter(selectedEngines) {
        const list = getResultsList();
        if (!list) return;
        list.querySelectorAll(RESULT_SELECTORS).forEach(el => {
            const show = resultMatches(selectedEngines, el);
            el.classList.toggle(HIDDEN_CLASS, !show);
        });
    }

    function setSelectedEngines(engines) {
        const page = getPage();
        if (!page) return;
        const previousEngines = getSelectedEngines();
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
        const previousKey = previousEngines.map(normalizeEngine).sort().join("\0");
        const nextKey = unique.map(normalizeEngine).sort().join("\0");
        const filterChanged = previousKey !== nextKey;

        if (unique.length === 0) {
            page.removeAttribute(FILTER_ATTR);
        } else {
            page.setAttribute(FILTER_ATTR, JSON.stringify(unique));
        }
        syncRowHighlights(unique);
        applyFilter(unique);

        if (filterChanged && unique.length > 0) {
            window.dispatchEvent(new CustomEvent("lg-engine-filter-change"));
        }
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
            renderMediaEnginePills();
            scheduleStickyEngineRailUpdate();
        }).observe(root, { childList: true, subtree: true });
    }

    function refreshEnginePanels() {
        for (const root of enginePanelRoots()) {
            ensureRootObserved(root);
        }
        decorateRows();
        syncRowHighlights(getSelectedEngines());
        renderMediaEnginePills();
        scheduleStickyEngineRailUpdate();
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
        resetSourceEngineLearner();
        setSelectedEngines([]);
    }

    function scheduleApply() {
        const engines = getSelectedEngines();
        if (!engines.length) return;
        requestAnimationFrame(() => applyFilter(engines));
        scheduleStickyEngineRailUpdate();
    }

    function onClick(event) {
        const target = event.target;
        if (!target?.closest) return;
        if (target.closest(".engine-retry-link")) return;
        const scrollNav = target.closest("[data-lg-engine-scroll]");
        if (scrollNav) {
            const host = scrollNav.closest(".lg-media-engine-rail");
            const scrollEl = host?.querySelector(PILLS_SCROLL_SELECTOR);
            if (!host || !scrollEl || scrollNav.disabled) return;
            event.preventDefault();
            event.stopPropagation();
            const dir = scrollNav.getAttribute("data-lg-engine-scroll");
            const delta = dir === "prev" ? -horizontalPillScrollStep(scrollEl) : horizontalPillScrollStep(scrollEl);
            scrollEl.scrollBy({ left: delta, behavior: "smooth" });
            return;
        }
        const pill = target.closest(PILLS_BUTTON_SELECTOR);
        if (pill) {
            event.preventDefault();
            event.stopPropagation();
            const name = pill.getAttribute("data-engine-name") || "";
            if (!name) return;
            const selected = getSelectedEngines();
            const key = normalizeEngine(name);
            const index = selected.findIndex(engine => normalizeEngine(engine) === key);
            if (index >= 0) selected.splice(index, 1);
            else selected.push(name);
            setSelectedEngines(selected);
            return;
        }
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
        wrapResultsStats(getResultsMeta());

        const resultsMeta = getResultsMeta();
        if (resultsMeta && !resultsMeta.dataset.lgMetaStatsObserver) {
            resultsMeta.dataset.lgMetaStatsObserver = "1";
            new MutationObserver(() => wrapResultsStats(resultsMeta)).observe(resultsMeta, {
                childList: true,
                characterData: true,
                subtree: true,
            });
        }

        const resultsList = getResultsList();
        if (resultsList) {
            new MutationObserver(mutations => {
                const started = mutationsStartSearch(mutations, { includeImageGrid: true });
                if (started) clearFilter();
                wrapResultsStats(getResultsMeta());
                decorateRows();
                scheduleApply();
                scheduleStickyEngineRailUpdate();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        refreshEnginePanels();
        observeEnginePanelMount();

        getResultsSearchButton()?.addEventListener("click", clearFilter);
        getResultsSearchInput()?.addEventListener("keydown", event => {
            if (event.key === "Enter") clearFilter();
        });

        window.addEventListener("degoog-results-ready", () => {
            wrapResultsStats(getResultsMeta());
            decorateRows();
            scheduleApply();
            renderMediaEnginePills();
            scheduleMediaMetaRightGap();
            scheduleStickyEngineRailUpdate();
        });

        window.addEventListener("lg-sync-search-type", () => {
            wrapResultsStats(getResultsMeta());
            refreshEnginePanels();
            renderMediaEnginePills();
            scheduleMediaMetaRightGap();
            scheduleStickyEngineRailUpdate();
        });

        window.addEventListener("lg-results-layout-changed", () => {
            renderMediaEnginePills();
            scheduleMediaMetaRightGap();
            scheduleStickyEngineRailUpdate();
        });

        window.addEventListener(
            "resize",
            () => {
                renderMediaEnginePills();
                scheduleMediaMetaRightGap();
                scheduleStickyEngineRailUpdate();
            },
            { passive: true },
        );
        window.addEventListener("scroll", scheduleStickyEngineRailUpdate, { passive: true });
        new MutationObserver(scheduleStickyEngineRailUpdate).observe(
            document.getElementById("sidebar-col") || document.documentElement,
            { attributes: true, attributeFilter: ["class"] },
        );

        decorateRows();
        renderMediaEnginePills();
        scheduleStickyEngineRailUpdate();
    }

    onReady(init);
})();

/* ── 5d. Results sidebar scroll — don't cancel document momentum on hover ─ */
(() => {
    const ACTIVE_CLASS = "lg-sidebar-scroll-active";
    const STUCK_CLASS = "lg-sidebar-is-stuck";
    const SCROLL_TARGETS = "#sidebar-col.is-sticky";
    const wired = new WeakSet();
    let stuckFrame = 0;

    function sidebarCol() {
        return document.getElementById("sidebar-col");
    }

    function sidebarStickyTop(sidebar) {
        const parsed = Number.parseFloat(getComputedStyle(sidebar).top);
        if (Number.isFinite(parsed)) return parsed;

        const root = getComputedStyle(document.documentElement);
        const fallback = Number.parseFloat(
            root.getPropertyValue("--literallygoogle-sticky-header-offset"),
        );
        return Number.isFinite(fallback) ? fallback : 0;
    }

    function isSidebarColStuck(sidebar) {
        if (!(sidebar instanceof HTMLElement) || !sidebar.classList.contains("is-sticky")) {
            return false;
        }
        if (window.matchMedia("(max-width: 767px)").matches) return false;
        if (getComputedStyle(sidebar).position !== "sticky") return false;
        return sidebar.getBoundingClientRect().top <= sidebarStickyTop(sidebar) + 1;
    }

    function resetSidebarScroll(sidebar = sidebarCol()) {
        if (!(sidebar instanceof HTMLElement)) return;
        sidebar.classList.remove(ACTIVE_CLASS);
        sidebar.scrollTop = 0;
        const sticky = sidebar.querySelector(":scope > .sticky");
        if (sticky instanceof HTMLElement) sticky.scrollTop = 0;
    }

    function syncSidebarRailInset(sidebar = sidebarCol()) {
        const page = getResultsPage();
        if (!(page instanceof HTMLElement) || !(sidebar instanceof HTMLElement)) return;

        if (!sidebar.classList.contains(STUCK_CLASS)) {
            page.style.removeProperty("--literallygoogle-sidebar-bottom-inset");
            return;
        }

        const header = document.getElementById("results-header");
        if (!(header instanceof HTMLElement)) return;

        const gap = Math.max(
            0,
            Math.round(sidebar.getBoundingClientRect().top - header.getBoundingClientRect().bottom),
        );
        page.style.setProperty("--literallygoogle-sidebar-bottom-inset", `${gap}px`);
    }

    function syncSidebarStuckState() {
        stuckFrame = 0;
        const sidebar = document.getElementById("sidebar-col");
        if (!(sidebar instanceof HTMLElement)) return;

        const wasStuck = sidebar.classList.contains(STUCK_CLASS);
        const stuck = isSidebarColStuck(sidebar);
        sidebar.classList.toggle(STUCK_CLASS, stuck);
        syncSidebarRailInset(sidebar);

        if (stuck !== wasStuck) {
            resetSidebarScroll(sidebar);
            sidebar.style.removeProperty("max-height");
            if (stuck) {
                requestAnimationFrame(() => {
                    resetSidebarScroll(sidebar);
                    syncSidebarRailInset(sidebar);
                });
            }
        } else if (stuck) {
            syncSidebarRailInset(sidebar);
        }
    }

    function scheduleSidebarStuckSync() {
        if (stuckFrame) return;
        stuckFrame = requestAnimationFrame(syncSidebarStuckState);
    }

    function canScroll(el) {
        return el.classList.contains(STUCK_CLASS) && el.scrollHeight > el.clientHeight + 1;
    }

    function atScrollEdge(el, deltaY) {
        if (deltaY < 0) return el.scrollTop <= 0;
        if (deltaY > 0) {
            return el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        }
        return true;
    }

    function bindScrollTarget(el) {
        if (!(el instanceof HTMLElement) || wired.has(el)) return;
        wired.add(el);

        el.addEventListener("pointerleave", () => {
            el.classList.remove(ACTIVE_CLASS);
        });

        el.addEventListener(
            "wheel",
            event => {
                if (!el.classList.contains(STUCK_CLASS) || !canScroll(el)) return;

                const { deltaY } = event;

                if (atScrollEdge(el, deltaY)) {
                    el.classList.remove(ACTIVE_CLASS);
                    return;
                }

                el.classList.add(ACTIVE_CLASS);
                event.preventDefault();
                el.scrollTop += deltaY;
            },
            { passive: false },
        );
    }

    function scan() {
        document.querySelectorAll(SCROLL_TARGETS).forEach(bindScrollTarget);
        scheduleSidebarStuckSync();
    }

    function init() {
        scan();
        const page = getResultsPage();
        if (!page) return;
        new MutationObserver(scan).observe(page, { childList: true, subtree: true });
        window.addEventListener("scroll", scheduleSidebarStuckSync, { passive: true });
        window.addEventListener("resize", scheduleSidebarStuckSync, { passive: true });
        window.addEventListener("lg-results-layout-changed", scheduleSidebarStuckSync);
        window.addEventListener("degoog-results-ready", scheduleSidebarStuckSync);
        new MutationObserver(scheduleSidebarStuckSync).observe(
            document.getElementById("sidebar-col") || document.documentElement,
            { attributes: true, attributeFilter: ["class", "style"] },
        );
    }

    onReady(init);
})();

/* ── 5e. Web results layout: fluid sidebar, then fluid main (≥768px only) ── */
(() => {
    const TWO_COL_MIN = 768;
    const SIDEBAR_MAX_REM = 20;
    const SIDEBAR_MIN_REM = 16;
    const SIDEBAR_BONUS_PX = 5;
    const MAIN_MAX_REM = 48;
    const COLUMN_GAP_REM = 2;
    const SCROLLBAR_REM = 0.75;
    let frame = 0;
    let fluidActive = false;
    let fluidVarsKey = "";

    function isWebResultsPage(page) {
        if (!page || window.innerWidth < TWO_COL_MIN) return false;
        const type = (page.getAttribute("data-lg-search-type") || "web").toLowerCase();
        if (type === "images" || type === "videos") return false;
        if (page.classList.contains("lg-command-mode")) return false;
        if (page.querySelector("#results-list .command-result, #results-list .command-help-table")) {
            return false;
        }
        return true;
    }

    function remPx() {
        return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    }

    function clearFluidLayoutVars(page) {
        page.style.removeProperty("--literallygoogle-results-sidebar-max");
        page.style.removeProperty("--literallygoogle-results-main-col-max");
        page.style.removeProperty("--literallygoogle-results-sidebar-col");
        page.style.removeProperty("--lg-results-grid-columns");
        page.style.removeProperty("--lg-results-meta-grid-columns");
        fluidVarsKey = "";
    }

    function targetGridInnerWidth(layout) {
        const px = remPx();
        const style = getComputedStyle(layout);
        const padStart = parseFloat(style.paddingInlineStart) || parseFloat(style.paddingLeft) || 0;
        const padEnd = parseFloat(style.paddingInlineEnd) || parseFloat(style.paddingRight) || 0;
        const rect = layout.getBoundingClientRect();
        const outerMax = Math.min(
            76 * px + padStart + padEnd,
            Math.max(0, window.innerWidth - rect.left - padEnd),
        );
        return Math.max(0, outerMax - padStart - padEnd);
    }

    function computeFluidColumns(innerWidth) {
        const px = remPx();
        const sidebarMax = SIDEBAR_MAX_REM * px + SIDEBAR_BONUS_PX;
        const sidebarMin = SIDEBAR_MIN_REM * px + SIDEBAR_BONUS_PX;
        const mainMax = MAIN_MAX_REM * px;
        const gap = COLUMN_GAP_REM * px;
        const scrollbar = SCROLLBAR_REM * px;

        const fullNeeded = mainMax + gap + sidebarMax + scrollbar;
        let sidebarPanel = sidebarMax;
        let mainCol = mainMax;

        if (innerWidth < fullNeeded) {
            const sidebarPanelIfMainFull = innerWidth - mainMax - gap - scrollbar;
            if (sidebarPanelIfMainFull >= sidebarMin) {
                sidebarPanel = Math.min(sidebarMax, sidebarPanelIfMainFull);
                mainCol = mainMax;
            } else {
                sidebarPanel = sidebarMin;
                mainCol = Math.max(0, innerWidth - gap - sidebarMin - scrollbar);
            }
        }

        return { sidebarPanel, mainCol };
    }

    function sidebarColRem(sidebarRem) {
        return `${(sidebarRem + SCROLLBAR_REM).toFixed(3)}rem`;
    }

    function applyFluidLayout(page, { sidebarPanel, mainCol }) {
        const px = remPx();
        const sidebarRem = sidebarPanel / px;
        const mainRem = mainCol / px;
        const key = `${sidebarRem.toFixed(3)}|${mainRem.toFixed(3)}`;
        if (key === fluidVarsKey) return false;

        fluidVarsKey = key;
        const panelRem = (sidebarPanel - SIDEBAR_BONUS_PX) / px;
        const panelSize = `calc(${panelRem}rem + ${SIDEBAR_BONUS_PX}px)`;
        page.style.setProperty("--literallygoogle-results-sidebar-max", panelSize);
        page.style.setProperty("--literallygoogle-results-main-col-max", `${mainRem}rem`);
        page.style.setProperty(
            "--literallygoogle-results-sidebar-col",
            `calc(${panelSize} + var(--lg-sidebar-scrollbar-size))`,
        );
        page.style.setProperty("--lg-results-grid-columns", `${mainRem}rem ${sidebarColRem(panelRem)}`);
        page.style.setProperty("--lg-results-meta-grid-columns", `${mainRem}rem ${panelSize}`);
        return true;
    }

    function sync() {
        frame = 0;
        const page = getResultsPage();
        const layout = getResultsLayout();
        if (!page || !layout) return;

        if (!isWebResultsPage(page)) {
            const hadFluid = fluidActive;
            fluidActive = false;
            clearFluidLayoutVars(page);
            if (hadFluid) {
                window.dispatchEvent(new Event("lg-results-layout-changed"));
            }
            window.dispatchEvent(new Event("lg-sync-sidebar-row"));
            return;
        }

        const innerWidth = targetGridInnerWidth(layout);
        const fluid = computeFluidColumns(innerWidth);
        const wasActive = fluidActive;
        fluidActive = true;

        applyFluidLayout(page, fluid);

        if (!wasActive) {
            window.dispatchEvent(new Event("lg-results-layout-changed"));
            window.dispatchEvent(new Event("lg-sync-sidebar-row"));
        }
    }

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(sync);
    }

    function init() {
        requestAnimationFrame(() => requestAnimationFrame(schedule));
        window.addEventListener("resize", schedule, { passive: true });
        window.addEventListener("degoog-results-ready", schedule, { passive: true });
        window.addEventListener("lg-sync-search-type", schedule, { passive: true });

        const page = getResultsPage();
        if (!page) return;
        new MutationObserver(mutations => {
            if (
                mutations.some(
                    mutation =>
                        mutation.type === "attributes" &&
                        (mutation.attributeName === "data-lg-search-type" ||
                            mutation.attributeName === "hidden"),
                )
            ) {
                schedule();
            }
        }).observe(page, {
            attributes: true,
            attributeFilter: ["data-lg-search-type", "hidden"],
        });
    }

    onReady(init);
})();

/* ── 6. Immediate search-type state for theme layout ───────────────────── */
(() => {
    const TYPE_ATTR = "data-lg-search-type";
    let observedTabs = null;

    function getRoot() {
        return getResultsPage();
    }

    function normalizeType(type) {
        if (!type) return "web";
        if (type.startsWith("tab:engine:")) return type.slice(11);
        if (type.startsWith("engine:")) return type.slice(7);
        if (type.startsWith("tab:")) return type.slice(4);
        return type;
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
        const root = getRoot();
        const prev = root?.getAttribute(TYPE_ATTR) || "";
        setSearchType(getActiveResultsTab()?.dataset.type || getTypeFromUrl());
        const next = root?.getAttribute(TYPE_ATTR) || "";
        if (prev !== next) {
            window.dispatchEvent(new Event("lg-sync-search-type"));
        }
    }

    function bindTabsClick() {
        const tabs = getResultsTabs();
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

    onReady(init);
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

    function isDesktopViewport() {
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
            const attr = isDesktopViewport() ? ENGINE_MODE_IMAGES_DESKTOP : ENGINE_MODE_IMAGES_MOBILE;
            return normalizeEngineMode(document.documentElement.getAttribute(attr) || "open");
        }
        const attr = isDesktopViewport() ? ENGINE_MODE_DESKTOP : ENGINE_MODE_MOBILE;
        return normalizeEngineMode(
            document.documentElement.getAttribute(attr) || "collapse-on-complete",
        );
    }

    function getRelatedMode() {
        const attr = isDesktopViewport() ? RELATED_MODE_DESKTOP : RELATED_MODE_MOBILE;
        const fallback = isDesktopViewport() ? "open" : "collapsed";
        const raw = document.documentElement.getAttribute(attr) || fallback;
        return raw === "open" ? "open" : "collapsed";
    }

    function getKnowledgeMode() {
        const attr = isDesktopViewport() ? KNOWLEDGE_MODE_DESKTOP : KNOWLEDGE_MODE_MOBILE;
        const fallback = isDesktopViewport() ? "open" : "collapsed";
        const raw = document.documentElement.getAttribute(attr) || fallback;
        return raw === "open" ? "open" : "collapsed";
    }

    function getMetaText() {
        const meta = getResultsMeta();
        return meta ? meta.textContent || "" : "";
    }

    function isMetaStreaming(text) {
        return SEARCH_ACTIVITY_TEXT.streamingPattern.test(text);
    }

    function isMetaSearching(text) {
        return SEARCH_ACTIVITY_TEXT.searchingPattern.test(text.trim());
    }

    function isMetaComplete(text) {
        if (!text.trim() || isMetaStreaming(text) || isMetaSearching(text)) {
            return false;
        }
        return (
            SEARCH_ACTIVITY_TEXT.completePattern.test(text) &&
            SEARCH_ACTIVITY_TEXT.completeTimePattern.test(text)
        );
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
        const resultsList = getResultsList();
        if (resultsList) {
            new MutationObserver(mutations => {
                const started = mutationsStartSearch(mutations);
                if (started) onSearchStart();
            }).observe(resultsList, { childList: true, subtree: true });
        }

        const meta = getResultsMeta();
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

        getResultsSearchButton()?.addEventListener("click", onSearchStart);
        getResultsSearchInput()?.addEventListener("keydown", event => {
            if (event.key === "Enter") onSearchStart();
        });
    }

    function wireImageLoadHandlers() {
        const resultsList = getResultsList();
        if (!resultsList) return;

        function checkThumb(img) {
            if (!img.classList.contains("image-thumb")) return;
            const card = img.closest(".image-card");
            if (!card) return;
            if (img.complete && img.naturalWidth > 0) {
                markImageThumbLoaded(img);
            } else {
                card.classList.remove("lg-img-loaded");
                img.closest(".image-thumb-wrap")?.classList.remove("loaded");
                img.addEventListener("load", () => markImageThumbLoaded(img), { once: true });
                img.addEventListener("error", () => markImageThumbLoaded(img), { once: true });
            }
        }

        resultsList.querySelectorAll(".image-card .image-thumb").forEach(checkThumb);

        if (!resultsList.dataset.lgImgLoadObserver) {
            resultsList.dataset.lgImgLoadObserver = "1";
            new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1) continue;
                        if (node.classList.contains("image-card")) {
                            const img = node.querySelector(".image-thumb");
                            if (img) checkThumb(img);
                        } else {
                            node.querySelectorAll(".image-card .image-thumb").forEach(checkThumb);
                        }
                    }
                }
            }).observe(resultsList, { childList: true, subtree: true });
        }
    }

    function onSearchTypeOrResultsChange() {
        wireImageLoadHandlers();
        wrapResultsStats(getResultsMeta());
    }

    function init() {
        if (!isThemeEnabled()) return;
        lastIsDesktop = isDesktopViewport();
        bindRoots();
        wireImageLoadHandlers();
        window.addEventListener("degoog-results-ready", onSearchTypeOrResultsChange);
        window.addEventListener("lg-sync-search-type", onSearchTypeOrResultsChange);
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
            const nowDesktop = isDesktopViewport();
            if (nowDesktop === lastIsDesktop) return;
            lastIsDesktop = nowDesktop;
            clearUserOverrides();
            scheduleSync();
        });
        window.addEventListener("lg-results-layout-changed", () => {
            const nowDesktop = isDesktopViewport();
            if (nowDesktop !== lastIsDesktop) {
                lastIsDesktop = nowDesktop;
                clearUserOverrides();
            }
            scheduleSync();
        });
        scheduleSync();
    }

    onReady(init);
})();

/* ── 8. Translate settings gear title ───────────────────────────────────── */
(() => {
    function translateSettingsGear() {
        const settingsEl = document.getElementById("nav-settings-results");
        if (settingsEl) {
            settingsEl.setAttribute("title", getLgTranslation("settings"));
        }
    }
    onReady(translateSettingsGear);
})();
