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
        linkCopied: "Link copied!",
        imageUnavailable: "Thumbnail unavailable",
        relatedSearches: "Related searches",
        more: "More",
        moreTabs: "More search types",
        tabIt: "IT",
        tabRepos: "Repos",
        tabFiles: "Files",
        tabMusic: "Music",
        tabScience: "Science",
        sources: "{count} sources",
        sourcesOne: "1 source",
        sourcesFailed: "{count} failed",
        sourcesTitle: "Sources for this search",
        sourcesHint: "Untick a source to hide its images.",
        sourcesReturned: "Returned images",
        sourcesFailedGroup: "Failed",
        sourcesEmpty: "{count} sources found nothing",
        sourcesEmptyOne: "1 source found nothing",
        sourcesSearching: "Searching…",
        retry: "Retry",
        retrying: "Retrying…",
        engineSettings: "Engine settings"
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
const CLOSE_ICON =
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
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

function runStreamingRenderBatch(render) {
    const list = getResultsList();
    if (!list?.isConnected) return render();
    const display = list.style.getPropertyValue("display");
    const priority = list.style.getPropertyPriority("display");
    const started = performance.now();
    // Core 0.26 rebuilds image cards and measures column heights after every
    // insertion. Skip those intermediate layouts, then lay out the batch once.
    // This is synchronous: nothing is hidden between frames or engine events,
    // and the original core nodes, handlers and search state remain in use.
    list.style.setProperty("display", "none", "important");
    try {
        return render();
    } finally {
        if (display) list.style.setProperty("display", display, priority);
        else list.style.removeProperty("display");
        list.getBoundingClientRect();
        const page = getResultsPage();
        if (page) page.dataset.lgStreamRenderMs = String(Math.round(performance.now() - started));
    }
}

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

// Like core, retain the native node when non-image searches detach it. A bang
// can resolve to images without core reattaching the bar first (cold loads too).
let imageFiltersBarNode = document.getElementById("image-filters-bar");
function getImageFiltersBar() {
    imageFiltersBarNode = document.getElementById("image-filters-bar") || imageFiltersBarNode;
    return imageFiltersBarNode;
}

function getResultsLayout() {
    return document.getElementById("results-layout");
}

function getMediaPreviewPanel() {
    return document.getElementById("media-preview-panel");
}

/** Re-measure grid after leaving bang-command layout (tabs/stats/sidebar). */
function scheduleCommandExitLayoutResync() {
    requestAnimationFrame(() => {
        window.dispatchEvent(new Event("lg-results-layout-changed"));
    });
}

// Engines send no image sizes, so thumbs reserve 4:3. A card seen on screen
// keeps that box; one that loads unseen takes the image's own shape.
const imageCardsSeen = new WeakSet();
const imageCardsMeasured = new WeakSet();
let imageCardViewObserver = null;

function settleImageThumbShape(card) {
    const wrap = card?.querySelector(".image-thumb-wrap");
    if (!wrap?.classList.contains("loaded") || wrap.classList.contains("lg-thumb-natural")) return;
    if (imageCardsMeasured.has(card) && !imageCardsSeen.has(card)) wrap.classList.add("lg-thumb-natural");
}

function observeImageCardView(card) {
    if (!(card instanceof HTMLElement) || typeof IntersectionObserver !== "function") return;
    imageCardViewObserver ??= new IntersectionObserver(entries => {
        for (const entry of entries) {
            imageCardsMeasured.add(entry.target);
            if (entry.isIntersecting) imageCardsSeen.add(entry.target);
            settleImageThumbShape(entry.target);
        }
    });
    imageCardViewObserver.observe(card);
}

function markImageThumbLoaded(img) {
    if (!(img instanceof HTMLImageElement) || !img.classList.contains("image-thumb")) return;
    const wrap = img.closest(".image-thumb-wrap");
    const card = img.closest(".image-card");
    if (img.naturalWidth > 0 && wrap?.classList.contains("lg-thumb-error")) {
        wrap.classList.remove("lg-thumb-error");
        wrap.querySelector(".lg-image-load-error")?.remove();
        img.hidden = false;
    }
    wrap?.classList.add("loaded");
    card?.classList.add("lg-img-loaded");
    observeImageCardView(card);
    settleImageThumbShape(card);
}

function handleMediaAssetError(event) {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;

    if (img.classList.contains("image-thumb")) {
        const fallback = String(img.dataset.fallback || "").trim();
        if (!img.dataset.triedFallback && fallback && fallback !== img.getAttribute("src") && fallback !== img.src) {
            img.dataset.triedFallback = "1";
            img.src = fallback;
            return;
        }
        const wrap = img.closest(".image-thumb-wrap");
        if (wrap instanceof HTMLElement) {
            wrap.classList.add("loaded", "lg-thumb-error");
            if (!wrap.querySelector(".lg-image-load-error")) {
                const message = document.createElement("span");
                message.className = "lg-image-load-error";
                message.textContent = getLgTranslation("imageUnavailable");
                wrap.appendChild(message);
            }
            img.hidden = true;
            const card = img.closest(".image-card");
            observeImageCardView(card);
            settleImageThumbShape(card);
        }
        return;
    }

    if (img.classList.contains("image-favicon")) {
        img.hidden = true;
        return;
    }

    if (img.classList.contains("video-thumb")) {
        img.hidden = true;
        const playIcon = img.parentElement?.querySelector(".video-play-icon");
        if (playIcon instanceof HTMLElement) playIcon.style.opacity = "1";
    }
}

document.addEventListener("error", handleMediaAssetError, true);

function getMediaPreviewSourceHref() {
    const panel = getMediaPreviewPanel();
    const link = panel?.querySelector(".media-preview-visit, .media-preview-link");
    const href = String(link?.getAttribute("href") || link?.href || "").trim();
    return href && !/^about:blank$/i.test(href) ? href : "";
}

function cacheImageCardSourceHref(card, href) {
    if (!(card instanceof HTMLElement)) return "";
    const nextHref = String(href || "").trim();
    if (!nextHref || /^about:blank$/i.test(nextHref)) return "";
    card.dataset.lgSourceHref = nextHref;
    card.querySelectorAll(".lg-image-meta-link").forEach(link => {
        if (link instanceof HTMLAnchorElement) {
            link.href = nextHref;
        }
    });
    return nextHref;
}

function getImageCardSourceHref(card) {
    if (!(card instanceof HTMLElement)) return "";
    const cachedHref = String(card.dataset.lgSourceHref || "").trim();
    if (cachedHref && !/^about:blank$/i.test(cachedHref)) return cachedHref;
    if (card.classList.contains("selected")) {
        const previewHref = getMediaPreviewSourceHref();
        if (previewHref) return cacheImageCardSourceHref(card, previewHref);
    }
    return "";
}

function previewMatchesImageCard(card) {
    if (!(card instanceof HTMLElement)) return false;
    const panel = getMediaPreviewPanel();
    const previewTitle = panel?.querySelector(".media-preview-title")?.textContent?.trim() || "";
    const previewSource = panel?.querySelector(".media-preview-link")?.textContent?.trim() || "";
    const cardTitle = card.querySelector(".image-title")?.textContent?.trim() || "";
    const cardSource = card.querySelector(".image-source")?.textContent?.trim() || "";
    const titleMatches = !cardTitle || !previewTitle || cardTitle === previewTitle;
    const sourceMatches = !cardSource || !previewSource || cardSource === previewSource;
    return titleMatches && sourceMatches;
}

function resolveImageCardSourceHref(card) {
    const cachedHref = getImageCardSourceHref(card);
    if (cachedHref) return Promise.resolve(cachedHref);
    if (!(card instanceof HTMLElement)) return Promise.resolve("");

    return new Promise(resolve => {
        const previewInfo = getMediaPreviewPanel()?.querySelector("#media-preview-info");
        const observeTarget = previewInfo || getMediaPreviewPanel() || document.body;
        let settled = false;

        const finish = href => {
            if (settled) return;
            settled = true;
            observer.disconnect();
            window.clearTimeout(timeoutId);
            resolve(href || "");
        };

        const maybeResolve = () => {
            if (!card.isConnected) {
                finish("");
                return;
            }
            if (!card.classList.contains("selected")) return;
            if (!previewMatchesImageCard(card)) return;
            const href = getMediaPreviewSourceHref();
            if (href) finish(cacheImageCardSourceHref(card, href));
        };

        const observer = new MutationObserver(() => {
            maybeResolve();
        });

        observer.observe(observeTarget, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["href", "class"],
        });

        const timeoutId = window.setTimeout(() => finish(""), 1500);
        card.dispatchEvent(
            new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
        );
        maybeResolve();
        requestAnimationFrame(maybeResolve);
        window.setTimeout(maybeResolve, 0);
    });
}

function navigateToImageCardSource(href, event) {
    if (!href) return;
    if (event?.metaKey || event?.ctrlKey || event?.shiftKey) {
        window.open(href, "_blank", "noopener,noreferrer");
        return;
    }
    window.location.assign(href);
}

function createImageCardMetaLink(node, card, extraClass) {
    if (!(node instanceof HTMLElement) || !(card instanceof HTMLElement)) return null;

    let link = node instanceof HTMLAnchorElement ? node : null;
    if (!link) {
        link = document.createElement("a");
        link.className = node.className;
        link.innerHTML = node.innerHTML;
        node.replaceWith(link);
    }

    link.classList.add("lg-image-meta-link");
    if (extraClass) link.classList.add(extraClass);
    link.draggable = false;
    link.href = getImageCardSourceHref(card) || "#";

    if (markWired(link, "lgImageMetaLinkWired")) {
        link.addEventListener(
            "click",
            async event => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const resolvedHref =
                    getImageCardSourceHref(card) || (await resolveImageCardSourceHref(card));
                if (!resolvedHref) return;
                cacheImageCardSourceHref(card, resolvedHref);
                navigateToImageCardSource(resolvedHref, event);
            },
            true,
        );
    }

    return link;
}

function wireImageCardMetaLinks(card) {
    if (!(card instanceof HTMLElement)) return;
    createImageCardMetaLink(card.querySelector(".image-title"), card, "lg-image-meta-link--title");
    createImageCardMetaLink(
        card.querySelector(".image-source-row"),
        card,
        "lg-image-meta-link--source",
    );
}

function getCurrentResults() {
    try {
        return window.degoog?.results?.list?.() || [];
    } catch {
        return [];
    }
}

function syncImageCardFavicon(card, results) {
    const favicon = card?.querySelector("img.image-favicon");
    if (!(favicon instanceof HTMLImageElement) || favicon.getAttribute("src")) return;
    // The proxy only serves server-signed favicon URLs. Image-card templates do
    // not receive one, so use the result core's own card click handler resolves.
    const src = results[Number(card.dataset.idx)]?.favicon;
    if (typeof src !== "string" || !src) return;
    favicon.src = src;
    favicon.hidden = false;
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

function isTextEntryTarget(target) {
    if (!(target instanceof Element)) return false;
    if (target instanceof HTMLElement && target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select"));
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

function readCorePrefs(keys) {
    // degoog keeps visitor preferences in IndexedDB; read without
    // creating or upgrading its database.
    return new Promise(resolve => {
        const prefs = {};
        let request;
        try {
            request = indexedDB.open("degoog");
        } catch {
            resolve(prefs);
            return;
        }
        request.onupgradeneeded = () => request.transaction?.abort();
        request.onerror = () => resolve(prefs);
        request.onblocked = () => resolve(prefs);
        request.onsuccess = () => {
            const db = request.result;
            const done = () => {
                db.close();
                resolve(prefs);
            };
            try {
                if (!db.objectStoreNames.contains("settings")) {
                    done();
                    return;
                }
                const tx = db.transaction("settings", "readonly");
                const store = tx.objectStore("settings");
                for (const key of keys) {
                    store.get(key).onsuccess = event => {
                        prefs[key] = event.target.result;
                    };
                }
                tx.oncomplete = done;
                tx.onerror = done;
                tx.onabort = done;
            } catch {
                done();
            }
        };
    });
}

const PHONE_SHEET_QUERY = window.matchMedia("(max-width: 767px)");

// Phone bottom sheets share one scrim. It takes the outside tap, so closing a
// sheet never also follows the link underneath it.
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

function placeBelowAnchor(panel, anchor, alignEnd, gap = 8) {
    // Document coordinates, so the open panel scrolls with its anchor.
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const rtl = getComputedStyle(anchor).direction === "rtl";
    const maxLeft = document.documentElement.clientWidth - width - 8;
    const leftAligned = alignEnd === rtl;
    const left = Math.max(8, Math.min(leftAligned ? rect.left : rect.right - width, maxLeft));
    panel.style.top = `${Math.round(rect.bottom + window.scrollY + gap)}px`;
    panel.style.left = `${Math.round(left + window.scrollX)}px`;
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

/* ── 1b. Clear (×) button: core empties the field; keep typing in place ── */
document.addEventListener("click", event => {
    if (!event.target?.closest?.("#results-search-clear-btn")) return;
    // Core's own handler runs on the button first and empties the value.
    getResultsSearchInput()?.focus();
});

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
        // Core's POST mode keeps a bare /search URL; its history entry still
        // records the server page it rendered.
        let raw = new URLSearchParams(window.location.search).get("page");
        const historyState = window.history.state;
        if (raw === null && historyState?.degoog === true && historyState.page != null) {
            raw = String(historyState.page);
        }
        const page = parseInt(raw || "1", 10);
        return Number.isFinite(page) && page > 0 ? page : 1;
    }

    let infiniteScrollSetting = false;

    function loadInfiniteScrollSetting() {
        const base = typeof window.__DEGOOG_BASE_URL__ === "string" ? window.__DEGOOG_BASE_URL__ : "";
        fetch(`${base}/api/settings/streaming`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (data?.infiniteScroll !== true) return;
                infiniteScrollSetting = true;
                window.requestAnimationFrame(syncPagination);
            })
            .catch(() => {});
    }

    function isInfiniteScrollMode() {
        // Core appends later pages to the same list and clears #pagination.
        return infiniteScrollSetting || Boolean(document.querySelector("#results-main .degoog-infinite"));
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
        if (isInfiniteScrollMode()) return false;
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
        // Core's prev/next-only nav marks no page current; it surrounds the
        // server page recorded in the URL (or history state in POST mode).
        const activePage = active ? active.page : (pages.length ? getUrlPage() : 1);
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
        prefix.setAttribute("aria-hidden", "true");
        oTrack.className = "lg-pager-o-track";
        oTrack.setAttribute("aria-hidden", "true");
        suffix.className = "lg-pager-suffix";
        suffix.setAttribute("aria-hidden", "true");

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
        lettersCore.appendChild(numberRow);
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
        if (!link) return;

        const page = getPageNumber(link);
        if (!page) return;

        const resultCount = getResultCount();
        if (!usesClientPagination(resultCount)) {
            const url = new URL(window.location.href);
            const query = getResultsSearchInput()?.value?.trim();
            // Server-rendered controls may have no native click handler. Keep
            // the existing GET search and all filters when changing pages.
            // A query absent from the URL stays in core's native POST flow.
            if (!query || url.searchParams.get("q")?.trim() !== query) return;
            if (page > 1) url.searchParams.set("page", String(page));
            else url.searchParams.delete("page");
            event.preventDefault();
            event.stopImmediatePropagation();
            window.location.assign(url.toString());
            return;
        }
        if (link.classList.contains("lg-pager-control")) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        applyClientPage(page);
    }

    function observePagination() {
        const pagination = document.getElementById("pagination");
        if (!pagination) return;

        loadInfiniteScrollSetting();

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

/* ── 4. Move spell-check notices into #results-meta ─────────────────────── */
(() => {
    let spellCheckFrame = 0;
    const SEARCHING_ATTR = "data-lg-sidebar-searching";
    const HOISTED_SPELL_CHECK_SELECTOR =
        '.spell-check-notice[data-lg-spell-check-meta="1"]';
    const PRESERVED_GLANCE_SKELETON_ATTR = "data-lg-preserved-glance-skeleton";
    let nativeGlanceSkeletonHtml = "";
    let hoistedSpellCheckNotice = null;

    function isWebSearchTab() {
        return getActiveSearchType() === "web";
    }

    function shouldKeepHoistedSpellCheck(notice) {
        return isWebSearchTab() && spellCheckMatchesCurrentQuery(notice);
    }

    function pruneInvalidSpellCheckFromMeta(meta = getResultsMeta()) {
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

        pruneInvalidSpellCheckFromMeta(meta);
        wrapResultsStats(meta);

        const notices = [...document.querySelectorAll(".spell-check-notice")].filter(
            notice =>
                !notice.closest("#results-meta") &&
                spellCheckMatchesCurrentQuery(notice),
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

    const desktopQuery = window.matchMedia("(min-width: 768px)");
    let imageFilterControl = null;

    function isImageDrawerMode(page) {
        const layout = document.documentElement.getAttribute("data-image-mode-desktop-layout") || "organizers-left";
        return page?.getAttribute("data-lg-search-type") === "images" &&
            (!desktopQuery.matches || ["organizers-left", "preview-left", "fab-left", "fab-right"].includes(layout));
    }

    function imageControlUsesRightAnchor() {
        if (desktopQuery.matches) {
            const layout = document.documentElement.getAttribute("data-image-mode-desktop-layout");
            return ["preview-left", "fab-right"].includes(layout);
        }
        const setting = document.documentElement.getAttribute("data-image-fab-side-mobile") || "auto";
        if (setting !== "auto") return setting === "right";
        const lang = (document.documentElement.lang || navigator.language || "").toLowerCase().split(/[-_]/)[0];
        return document.documentElement.dir !== "rtl" && !["he", "iw", "ja"].includes(lang);
    }

    function setImageFiltersSidebarOpen(open) {
        getImageFiltersBar()?.classList.toggle("open", open);
        document.querySelector(".degoog-img-sidebar-overlay")?.classList.remove("open");
        getResultsLayout()?.classList.remove("filters-open");
    }

    function syncFloatingFiltersLauncher() {
        imageFilterControl?.update({ right: imageControlUsesRightAnchor() });
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

    function initializeImageDrawerClosed(page, panel, toggle) {
        if (page.dataset.lgImageDrawerInitClosed === "1") return;
        page.dataset.lgImageDrawerInitClosed = "1";

        const close = () => {
            ensureFiltersClosed(panel, toggle);
            setImageFiltersSidebarOpen(false);
        };
        close();
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
        const list = getResultsList();

        // Rendered command content is authoritative. Commands may be invoked by
        // natural-language phrases or aliases, so command layout must not
        // depend on the query retaining a leading bang.
        if (list?.querySelector(".command-result, .command-help-table")) return true;

        if (!isBangCommandQuery(query)) return false;

        const metaText = getResultsMeta()?.textContent?.trim() ?? "";
        if (metaText === SEARCH_ACTIVITY_TEXT.runningCommand) return true;
        if (SEARCH_ACTIVITY_TEXT.aboutResultsPattern.test(metaText)) return false;

        if (!list) return false;

        if (list.querySelector(".loading-dots")) {
            return metaText === SEARCH_ACTIVITY_TEXT.runningCommand;
        }

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
        if (!page) return;
        const wasCommandMode = page.classList.contains("lg-command-mode");
        const commandMode = isCommandMode();
        page.classList.toggle("lg-command-mode", commandMode);
        if (!toolsBar || !panel || !toggle) return;
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
        const sidebar = getImageFiltersBar();
        if (!sidebar || !window.LgImageFilterControl) return;
        if (!sidebar.isConnected) getResultsLayout()?.appendChild(sidebar);
        if (imageFilterControl?.sidebar !== sidebar) {
            imageFilterControl?.destroy();
            initializeImageDrawerClosed(page, document.getElementById("tools-panel"), toggle);
            imageFilterControl = new window.LgImageFilterControl({
                page, sidebar, label: getLgTranslation("filters"), icon: LG_FILTERS_ICON,
                closeTools: () => ensureFiltersClosed(document.getElementById("tools-panel"), toggle),
            });
        }
        page.classList.add("lg-image-fab-filters");
        syncFloatingFiltersLauncher();
    }

    function deactivateImageDrawerMode(page) {
        imageFilterControl?.destroy();
        imageFilterControl = null;
        page?.classList.remove("lg-image-fab-filters", "lg-image-fab-open");
        if (page) delete page.dataset.lgImageDrawerInitClosed;
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
            // Command layout classification is independent of the optional
            // filters UI and must run even when those controls are absent.
            syncFiltersVisibilityFromDom();
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
                        node.id === "image-filters-bar" ||
                        node.id === "lg-meta-row" ||
                        node.querySelector?.("#tools-panel, #tools-toggle, #image-filters-bar, #lg-meta-row")
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
    const TABS_LIST_SELECTOR = ".lg-results-tabs__list";
    const TABS_RAIL_CLASS = "lg-results-tabs-rail";
    const TAB_OVERFLOW_CLASS = "lg-tab-overflow";
    const TAB_EXTRA_CLASS = "lg-tab-extra";
    const PRIMARY_TAB_COUNT = 4;
    const DEFAULT_PRIMARY_TABS = ["web", "images", "videos", "news"];
    const TAB_LABEL_KEYS = { it: "tabIt", repos: "tabRepos", file: "tabFiles", music: "tabMusic", science: "tabScience" };
    const MORE_CHEVRON =
        `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    let savedTabOrder = [];
    let pendingTabFocus = null;
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
        scrollEl.addEventListener("scroll", placeMoreMenu, { passive: true });
        const ro = new ResizeObserver(refresh);
        ro.observe(scrollEl);
        ro.observe(rail);
        // Core inserts plugin tabs next to #tools-bar and replaces them later.
        const observer = new MutationObserver(() => syncTabsRail());
        observer.observe(scrollEl, { childList: true });
        const list = rail.querySelector(TABS_LIST_SELECTOR);
        if (list) {
            observer.observe(list, { childList: true });
            new MutationObserver(syncTabOverflow).observe(list, {
                subtree: true,
                attributes: true,
                attributeFilter: ["class", "style", "hidden", "data-bang-hidden", "aria-disabled"],
            });
        }
        const more = rail.querySelector(".lg-tabs-more");
        more?.addEventListener("click", event => {
            // Keyboard activation (detail 0) moves focus into the menu.
            if (getMoreMenu().hidden) openMoreMenu(event.detail === 0 ? 0 : undefined);
            else closeMoreMenu(false);
        });
        more?.addEventListener("keydown", onMoreKeydown);
        refresh();
    }

    function createTabsRail() {
        const rail = document.createElement("div");
        rail.className = TABS_RAIL_CLASS;
        rail.innerHTML =
            `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--prev" data-lg-tabs-scroll="prev" aria-label="Scroll tabs left">` +
            NAV_ICON_PREV +
            `</button>` +
            `<div class="lg-results-tabs__scroll">` +
            `<div class="lg-results-tabs__list"></div>` +
            `<button type="button" class="lg-tabs-more" id="lg-tabs-more" aria-haspopup="menu" aria-expanded="false" aria-controls="lg-tabs-more-menu" hidden>` +
            `<span class="lg-tabs-more__label"></span>${MORE_CHEVRON}</button>` +
            `</div>` +
            `<button type="button" class="lg-media-engine-nav lg-media-engine-nav--next" data-lg-tabs-scroll="next" aria-label="Scroll tabs right">` +
            NAV_ICON_NEXT +
            `</button>`;
        return rail;
    }

    function collectTabNodes(parent) {
        return [...parent.children].filter(
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
        const list = rail.querySelector(TABS_LIST_SELECTOR);
        if (!scrollEl || !list) return;

        // Only move nodes that are not already in the right parent. Moving a
        // node to the same parent still fires a childList mutation, which the
        // observer below re-enters as another syncTabsRail() call — an infinite
        // loop. Guard every appendChild with a parent check. Core inserts new
        // tabs before #tools-bar, which is inside the scroll list on mobile.
        for (const tab of [...collectTabNodes(tabs), ...collectTabNodes(scrollEl)]) {
            if (tab.parentElement !== list) list.appendChild(tab);
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
        syncTabOverflow();
        updateTabsNavState();
    }

    function tabKey(tab) {
        // Same key core's saved tab order uses.
        const type = tab.dataset.type || "";
        if (type.startsWith("tab:engine:")) return type.slice(11);
        if (type.startsWith("tab:")) return type.slice(4);
        return type;
    }

    function relabelTab(tab) {
        // Core only capitalises engine types ("it" → "It"). Leave any label it
        // translated or a plugin named.
        const type = tab.dataset.type || "";
        if (!type.startsWith("tab:engine:")) return;
        const raw = type.slice(11);
        const key = TAB_LABEL_KEYS[raw];
        if (!key || tab.textContent.trim() !== raw.charAt(0).toUpperCase() + raw.slice(1)) return;
        const label = getLgTranslation(key);
        if (tab.textContent !== label) tab.textContent = label;
    }

    function isTabListed(tab) {
        return !tab.hidden && tab.style.display !== "none" && tab.dataset.bangHidden !== "true";
    }

    function pickTabRow(tabs, savedOrder) {
        // The first four tabs stay in the row: the user's saved order when
        // there is one, else Web, Images, Videos and News, topped up in DOM
        // order. An active tab from the rest joins them after the four; a
        // lone extra tab is shown instead of a one-item menu.
        const shown = tabs.filter(isTabListed);
        let primary = shown.slice(0, PRIMARY_TAB_COUNT);
        if (!savedOrder.length) {
            primary = DEFAULT_PRIMARY_TABS.map(key => shown.find(tab => tabKey(tab) === key)).filter(Boolean);
            for (const tab of shown) {
                if (primary.length >= PRIMARY_TAB_COUNT) break;
                if (!primary.includes(tab)) primary.push(tab);
            }
        }
        const active = shown.find(tab => tab.classList.contains("active"));
        const rest = shown.filter(tab => !primary.includes(tab));
        if (rest.length <= 1) return { overflow: [], extra: null };
        const extra = rest.includes(active) ? active : null;
        return { overflow: rest.filter(tab => tab !== extra), extra };
    }

    function loadSavedTabOrder() {
        const base = typeof window.__DEGOOG_BASE_URL__ === "string" ? window.__DEGOOG_BASE_URL__ : "";
        fetch(`${base}/api/settings/tab-order`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                savedTabOrder = Array.isArray(data?.engineTabsOrder) ? data.engineTabsOrder : [];
                syncTabOverflow();
            })
            .catch(() => {});
    }

    function syncTabOverflow() {
        const tabs = getResultsTabs();
        const list = tabs?.querySelector(TABS_LIST_SELECTOR);
        const more = tabs?.querySelector(".lg-tabs-more");
        if (!list || !more) return;
        const all = collectTabNodes(list);
        all.forEach(relabelTab);
        const row = pickTabRow(all, savedTabOrder);
        const overflow = new Set(row.overflow);
        for (const tab of all) {
            const hide = overflow.has(tab);
            if (tab.classList.contains(TAB_OVERFLOW_CLASS) !== hide) tab.classList.toggle(TAB_OVERFLOW_CLASS, hide);
            if (tab.classList.contains(TAB_EXTRA_CLASS) !== (tab === row.extra)) tab.classList.toggle(TAB_EXTRA_CLASS, tab === row.extra);
            if (hide && tab.getAttribute("aria-hidden") !== "true") tab.setAttribute("aria-hidden", "true");
            else if (!hide && tab.hasAttribute("aria-hidden")) tab.removeAttribute("aria-hidden");
        }
        const label = more.querySelector(".lg-tabs-more__label");
        if (label && label.textContent !== getLgTranslation("more")) label.textContent = getLgTranslation("more");
        if (more.hidden !== !overflow.size) more.hidden = !overflow.size;
        if (!overflow.size) closeMoreMenu(false);
        renderMoreMenu([...overflow]);
        if (pendingTabFocus && !overflow.has(pendingTabFocus) && pendingTabFocus.classList.contains("active")) {
            // Core blurs the page when a search starts; keep keyboard users on
            // the tab they picked unless they already moved on.
            const active = document.activeElement;
            if (!active || active === document.body || active === more) pendingTabFocus.focus();
            pendingTabFocus = null;
        }
    }

    function getMoreMenu() {
        let menu = document.getElementById("lg-tabs-more-menu");
        if (!menu) {
            menu = document.createElement("div");
            menu.id = "lg-tabs-more-menu";
            menu.className = "lg-tabs-more-menu";
            menu.setAttribute("role", "menu");
            menu.hidden = true;
            menu.addEventListener("keydown", onMoreMenuKeydown);
            menu.addEventListener("click", event => {
                const item = event.target?.closest?.(".lg-tabs-more-item");
                if (item) activateMoreItem(item);
            });
            document.body.appendChild(menu);
        }
        return menu;
    }

    function renderMoreMenu(overflow) {
        const signature = overflow
            .map(tab => `${tab.dataset.type}\u0000${tab.textContent.trim()}\u0000${tab.getAttribute("aria-disabled") || ""}`)
            .join("\u0001");
        const menu = getMoreMenu();
        menu.setAttribute("aria-label", getLgTranslation("moreTabs"));
        if (menu.dataset.signature === signature) return;
        menu.dataset.signature = signature;
        menu.replaceChildren(
            ...overflow.map(tab => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "lg-tabs-more-item";
                item.setAttribute("role", "menuitem");
                item.tabIndex = -1;
                item.dataset.lgTabType = tab.dataset.type || "";
                item.textContent = tab.textContent.trim();
                if (tab.getAttribute("aria-disabled") === "true") item.setAttribute("aria-disabled", "true");
                return item;
            }),
        );
    }

    function moreItems() {
        return [...getMoreMenu().querySelectorAll(".lg-tabs-more-item")];
    }

    function openMoreMenu(focusIndex) {
        const more = document.getElementById("lg-tabs-more");
        const menu = getMoreMenu();
        if (!more || more.hidden || !menu.childElementCount) return;
        menu.hidden = false;
        more.setAttribute("aria-expanded", "true");
        placeMoreMenu();
        const items = moreItems();
        if (focusIndex !== undefined) items.at(focusIndex)?.focus();
    }

    function placeMoreMenu() {
        const menu = document.getElementById("lg-tabs-more-menu");
        const more = document.getElementById("lg-tabs-more");
        if (menu && more && !menu.hidden) placeBelowAnchor(menu, more, false, 4);
    }

    function closeMoreMenu(restoreFocus) {
        const menu = document.getElementById("lg-tabs-more-menu");
        const more = document.getElementById("lg-tabs-more");
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        more?.setAttribute("aria-expanded", "false");
        if (restoreFocus) more?.focus();
    }

    function activateMoreItem(item) {
        if (item.getAttribute("aria-disabled") === "true") return;
        const type = item.dataset.lgTabType;
        const tab = collectTabNodes(getResultsTabs()?.querySelector(TABS_LIST_SELECTOR) || document.createElement("div"))
            .find(node => node.dataset.type === type);
        closeMoreMenu(true);
        if (!tab) return;
        pendingTabFocus = tab;
        // Core's own click handler on the original tab runs the search.
        tab.click();
    }

    function onMoreKeydown(event) {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            openMoreMenu(event.key === "ArrowDown" ? 0 : -1);
        }
    }

    function onMoreMenuKeydown(event) {
        const items = moreItems();
        const index = items.indexOf(document.activeElement);
        let next = -1;
        if (event.key === "ArrowDown") next = (index + 1) % items.length;
        else if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        else if (event.key === "Escape") {
            event.preventDefault();
            closeMoreMenu(true);
            return;
        } else if (event.key === "Tab") {
            closeMoreMenu(false);
            return;
        } else if ((event.key === "Enter" || event.key === " ") && index >= 0) {
            event.preventDefault();
            if (!event.repeat) activateMoreItem(items[index]);
            return;
        } else {
            return;
        }
        event.preventDefault();
        items[next]?.focus();
    }

    function onDocumentPointerDown(event) {
        const menu = document.getElementById("lg-tabs-more-menu");
        if (!menu || menu.hidden) return;
        if (menu.contains(event.target) || event.target?.closest?.("#lg-tabs-more")) return;
        closeMoreMenu(false);
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
        if (!getResultsTabs()) return;
        loadSavedTabOrder();
        mobileQuery.addEventListener?.("change", syncTabsRail);
        window.addEventListener("resize", () => {
            updateTabsNavState();
            placeMoreMenu();
        }, { passive: true });
        window.addEventListener("tab-order-saved", loadSavedTabOrder);
        document.addEventListener("pointerdown", onDocumentPointerDown, true);
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

    function getCorePreviewFaviconSrc(panel) {
        // Core's setPreviewSource fills this hidden wrap with a signed favicon.
        return panel.querySelector("#media-preview-favicon-wrap img")?.getAttribute("src") || "";
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
        if (!img || !wrap) return;
        const clearPlaceholder = () => {
            wrap.classList.remove("lg-preview-pending");
            wrap.style.removeProperty("background-image");
            wrap.style.removeProperty("min-height");
            wrap.removeAttribute("aria-busy");
        };
        if (img.style.display === "none" || !img.getAttribute("src")) {
            clearPlaceholder();
            return;
        }
        const body = wrap.closest(".mp2-body");
        const maxW = Math.max(120, body?.clientWidth || wrap.clientWidth || 360);
        const maxH = Math.min(window.innerHeight * 0.62, 560);
        if (!img.complete) {
            const thumb = document.querySelector("#results-list .image-card.selected .image-thumb");
            if (thumb?.complete && thumb.naturalWidth > 0 && thumb.naturalHeight > 0) {
                // Reuse the already loaded thumbnail while core fetches the original.
                // Keep core's source, fallback, download and lightbox handlers intact.
                const source = thumb.currentSrc || thumb.src;
                wrap.style.backgroundImage = `url(${JSON.stringify(source)})`;
                wrap.style.minHeight = `${Math.min(maxW * thumb.naturalHeight / thumb.naturalWidth, maxH)}px`;
                wrap.classList.add("lg-preview-pending");
                wrap.setAttribute("aria-busy", "true");
            } else clearPlaceholder();
            return;
        }
        clearPlaceholder();
        wrap.style.removeProperty("width");
        wrap.style.removeProperty("aspect-ratio");
        img.style.removeProperty("width");
        img.style.removeProperty("height");
        const nw = img.naturalWidth, nh = img.naturalHeight;
        if (!nw || !nh) return;
        const scale = Math.min(maxW / nw, maxH / nh, 1);
        wrap.style.width = "100%";
        img.style.width = `${Math.max(1, Math.round(nw * scale))}px`;
        img.style.height = `${Math.max(1, Math.round(nh * scale))}px`;
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
                const src = getCorePreviewFaviconSrc(panel);
                if (!src) {
                    favicon.removeAttribute("src");
                    favicon.style.display = "none";
                } else if (favicon.getAttribute("src") !== src) {
                    favicon.classList.remove("mp2-favicon--fill");
                    favicon.onload = () => tuneFavicon(favicon);
                    favicon.onerror = () => { favicon.style.display = "none"; };
                    favicon.style.display = "block";
                    favicon.src = src;
                }
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
            const metaObserver = new MutationObserver(() => {
                syncMeta(panel);
            });
            metaObserver.observe(info, { childList: true, subtree: true });
            const faviconWrap = panel.querySelector("#media-preview-favicon-wrap");
            if (faviconWrap) {
                metaObserver.observe(faviconWrap, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ["src"],
                });
            }
        }

        const previewImg = panel.querySelector("#media-preview-img");
        if (previewImg) {
            fitPreviewImage(panel);
            previewImg.addEventListener("load", () => fitPreviewImage(panel));
            previewImg.addEventListener("error", () => queueMicrotask(() => fitPreviewImage(panel)));
            document.addEventListener("load", event => {
                if (event.target instanceof HTMLImageElement && event.target.matches(".image-card.selected .image-thumb")) fitPreviewImage(panel);
            }, true);
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
                if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
                // Text fields and the image filter radios own their arrow keys.
                if (isTextEntryTarget(e.target) || e.target?.closest?.("#lg-image-filter-control")) return;
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
    const getThemeTranslation = getLgTranslation;
    let lightboxPointerFrame = 0;
    let lightboxPointerClientX = 0;
    let lightboxPointerClientY = 0;

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

    function syncLightboxOpenState(lightbox = getLightbox()) {
        const isOpen =
            lightbox instanceof HTMLElement &&
            lightbox.classList.contains("open") &&
            !lightbox.hasAttribute("hidden") &&
            lightbox.getAttribute("aria-hidden") !== "true";
        getResultsPage()?.classList.toggle(LIGHTBOX_OPEN_CLASS, isOpen);
        document.body.classList.toggle(LIGHTBOX_OPEN_CLASS, isOpen);
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

    function applyLightboxTransformOrigin(clientX, clientY) {
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
        const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
        const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
        img.style.transformOrigin = `${x}% ${y}%`;
    }

    function syncLightboxTransformOrigin(event) {
        applyLightboxTransformOrigin(event.clientX, event.clientY);
    }

    function queueLightboxTransformOrigin(event) {
        lightboxPointerClientX = event.clientX;
        lightboxPointerClientY = event.clientY;
        if (lightboxPointerFrame) return;
        lightboxPointerFrame = requestAnimationFrame(() => {
            lightboxPointerFrame = 0;
            applyLightboxTransformOrigin(lightboxPointerClientX, lightboxPointerClientY);
        });
    }

    function closeLightbox() {
        const lightbox = getLightbox();
        const img = getLightboxImage();
        if (!(lightbox instanceof HTMLElement)) return;
        if (lightboxPointerFrame) {
            cancelAnimationFrame(lightboxPointerFrame);
            lightboxPointerFrame = 0;
        }
        lightbox.classList.remove("open");
        lightbox.setAttribute("hidden", "");
        lightbox.setAttribute("aria-hidden", "true");
        lightbox.dataset.zoomLevel = "0";
        syncLightboxOpenState(lightbox);
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
        // Core fires degoog-results-ready for every streamed batch; keep an
        // open lightbox (and its zoom) intact across those re-runs.
        if (!lightbox.classList.contains("open")) {
            lightbox.setAttribute("hidden", "");
            lightbox.setAttribute("aria-hidden", "true");
            lightbox.dataset.zoomLevel = "0";
        }

        const stage = getLightboxStage();
        const img = getLightboxImage();
        const closeBtn = lightbox.querySelector("#img-lightbox-close, .lg-lightbox-close");
        const backdrop = lightbox.querySelector("#img-lightbox-bg, .lg-lightbox-backdrop");
        stage?.classList.add("lg-lightbox-stage");
        img?.classList.add("lg-lightbox-img");
        if (img instanceof HTMLImageElement) {
            img.decoding = "async";
            img.fetchPriority = "high";
        }
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

        if (lightbox.dataset.lgLightboxObserved !== "1") {
            lightbox.dataset.lgLightboxObserved = "1";
            new MutationObserver(() => {
                syncLightboxOpenState(lightbox);
            }).observe(lightbox, {
                attributes: true,
                attributeFilter: ["class", "hidden", "aria-hidden"],
            });
        }

        closeBtn?.addEventListener("click", event => {
            event.preventDefault();
            event.stopImmediatePropagation();
            closeLightbox();
        });

        lightbox.addEventListener("click", event => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            if (target.closest(".lg-lightbox-close, #img-lightbox-close")) {
                event.preventDefault();
                event.stopImmediatePropagation();
                closeLightbox();
                return;
            }
            if (target.closest(".lg-lightbox-img, #img-lightbox-img")) {
                event.preventDefault();
                event.stopImmediatePropagation();
                cycleLightboxZoom(event);
                return;
            }
            event.preventDefault();
            event.stopImmediatePropagation();
            closeLightbox();
        }, true);

        lightbox.addEventListener("mousemove", event => {
            if (!(event.target instanceof Element)) return;
            if (!event.target.closest(".lg-lightbox-stage, #img-lightbox-wrap")) return;
            queueLightboxTransformOrigin(event);
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
                    // Buttons (e.g. close) and fields keep their native activation.
                    if (isTextEntryTarget(event.target) || event.target?.closest?.("button, a[href]")) return;
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
        syncLightboxOpenState(lightbox);
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


/* Core owns image-column packing and preview-width changes. */
document.addEventListener("load", event => markImageThumbLoaded(event.target), true);
onReady(() => {
    document.querySelectorAll("#results-list .image-thumb").forEach(img => {
        if (img.complete && img.naturalWidth > 0) markImageThumbLoaded(img);
    });
});

/* ── 5c. Engine performance row → filter results by engine ─────────────── */
(() => {
    const FILTER_ATTR = "data-lg-engine-filter";
    const ACTIVE_CLASS = "lg-engine-stat-row--active";
    const HIDDEN_CLASS = "lg-engine-filtered-out";
    const RESULT_SELECTORS = ".result-item, .image-card, .video-card";
    const SOURCES_PILL_ID = "lg-image-sources-pill";
    const SOURCES_PANEL_ID = "lg-image-sources-panel";
    const SOURCES_READY_CLASS = "lg-media-engine-pills-ready";
    let currentSources = { engines: [], returned: [], failed: [], empty: [] };
    let sourcesSeen = new Set();
    let sourcesEmptyOpen = false;

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
                    return runStreamingRenderBatch(() => listener.call(this, event));
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

    function isImagePillsMode() {
        return getActiveSearchType() === "images";
    }

    function setNativeEnginePanelAvailability(available) {
        getPage()?.classList.toggle(SOURCES_READY_CLASS, !available);
    }

    function imageEngineRows() {
        return [
            ...document.querySelectorAll(
                "#image-engine-panel .engine-stat-row, #image-filters-bar .engine-stat-row",
            ),
        ].filter(row => row instanceof HTMLElement);
    }

    function readEngineRow(row) {
        // Core's row: name, "<count> results[ · page N failed] · <time>ms",
        // a reason tooltip when the engine failed, and its retry link.
        const name = row.querySelector(".engine-stat-label")?.textContent?.trim() || "";
        const meta = row.querySelector(".engine-stat-meta")?.textContent?.replace(/\s+/g, " ").trim() || "";
        const reason = row.querySelector(".engine-stat-reason")?.getAttribute("data-tooltip")?.trim() || "";
        const retry = row.querySelector(".engine-retry-link");
        const count = Number.parseInt(meta.match(/-?\d+/)?.[0] ?? "", 10);
        const time = meta.match(/(\d+)\s*ms$/)?.[1] || "";
        let state = "ok";
        if (row.classList.contains("engine-failed") || reason) state = "failed";
        else if (count < 0) state = "pending";
        else if (count === 0) state = "empty";
        return {
            name,
            count: count > 0 ? count : 0,
            time,
            reason,
            retry,
            retrying: Boolean(retry?.classList.contains("retrying")),
            state,
        };
    }

    function summarizeSources(rows) {
        const engines = rows.map(readEngineRow).filter(engine => engine.name);
        return {
            engines,
            returned: engines.filter(engine => engine.state === "ok" || engine.state === "pending"),
            failed: engines.filter(engine => engine.state === "failed"),
            empty: engines.filter(engine => engine.state === "empty"),
        };
    }

    function countLabel(total, one, many) {
        return total === 1 ? getLgTranslation(one) : getLgTranslation(many).replace("{count}", String(total));
    }

    function ensureSourcesPill() {
        let pill = document.getElementById(SOURCES_PILL_ID);
        if (!pill) {
            pill = document.createElement("button");
            pill.type = "button";
            pill.id = SOURCES_PILL_ID;
            pill.className = "lg-image-sources-pill";
            pill.setAttribute("aria-haspopup", "dialog");
            pill.setAttribute("aria-expanded", "false");
            pill.setAttribute("aria-controls", SOURCES_PANEL_ID);
            pill.innerHTML =
                `<span class="lg-image-sources-pill__label"></span>` +
                `<span class="lg-image-sources-pill__failed"></span>` +
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
            pill.addEventListener("click", () => {
                if (document.getElementById(SOURCES_PANEL_ID)?.hidden === false) closeSourcesPanel(false);
                else openSourcesPanel();
            });
        }
        // Phones: the last item of the scrolling tab list, where Filter sits
        // on other tabs. Wider screens: the end of the tabs row.
        const tabs = getResultsTabs();
        const host = PHONE_SHEET_QUERY.matches ? tabs?.querySelector(".lg-results-tabs__scroll") || tabs : tabs;
        if (host && pill.parentElement !== host) host.appendChild(pill);
        return pill;
    }

    function ensureSourcesPanel() {
        let panel = document.getElementById(SOURCES_PANEL_ID);
        if (panel) return panel;
        panel = document.createElement("div");
        panel.id = SOURCES_PANEL_ID;
        panel.className = "lg-image-sources-panel";
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-labelledby", "lg-image-sources-title");
        panel.tabIndex = -1;
        panel.hidden = true;
        panel.innerHTML =
            `<div class="lg-image-sources-head"><div class="lg-image-sources-heading">` +
            `<h2 class="lg-image-sources-title" id="lg-image-sources-title"></h2>` +
            `<p class="lg-image-sources-status"></p><p class="lg-image-sources-hint"></p></div>` +
            `<button type="button" class="lg-image-sources-close">${CLOSE_ICON}</button></div>` +
            `<div class="lg-image-sources-body"></div>` +
            `<div class="lg-image-sources-foot"><a class="lg-image-sources-settings"></a></div>`;
        panel.addEventListener("click", onSourcesPanelClick);
        panel.addEventListener("change", onSourcesPanelChange);
        panel.addEventListener("keydown", onSourcesPanelKeydown);
        document.body.appendChild(panel);
        return panel;
    }

    function sourceRow(engine, selected) {
        const key = normalizeEngine(engine.name);
        if (engine.state === "failed") {
            const row = document.createElement("div");
            row.className = "lg-image-sources-row lg-image-sources-row--failed";
            row.innerHTML =
                `<span class="lg-image-sources-dot" aria-hidden="true"></span>` +
                `<span class="lg-image-sources-name"><span></span><span class="lg-image-sources-reason"></span></span>` +
                `<button type="button" class="lg-image-sources-retry"></button>`;
            row.querySelector(".lg-image-sources-name > span").textContent = engine.name;
            row.querySelector(".lg-image-sources-reason").textContent = engine.reason;
            const retry = row.querySelector(".lg-image-sources-retry");
            retry.dataset.engineName = engine.name;
            retry.dataset.lgFocusKey = `retry:${key}`;
            retry.textContent = getLgTranslation(engine.retrying ? "retrying" : "retry");
            retry.disabled = engine.retrying || !engine.retry;
            return row;
        }
        const row = document.createElement(engine.state === "empty" ? "div" : "label");
        row.className = "lg-image-sources-row";
        row.innerHTML =
            (engine.state === "empty" ? "" : `<input type="checkbox" class="lg-image-sources-check">`) +
            `<span class="lg-image-sources-name"></span>` +
            `<span class="lg-image-sources-count"></span><span class="lg-image-sources-time"></span>`;
        row.querySelector(".lg-image-sources-name").textContent = engine.name;
        row.querySelector(".lg-image-sources-count").textContent =
            engine.state === "pending" ? getLgTranslation("sourcesSearching") : engine.state === "empty" ? "" : String(engine.count);
        row.querySelector(".lg-image-sources-time").textContent = engine.time ? `${engine.time} ms` : "";
        const box = row.querySelector(".lg-image-sources-check");
        if (box) {
            box.dataset.engineName = engine.name;
            box.dataset.lgFocusKey = `check:${key}`;
            box.checked = !selected.length || selected.includes(key);
        }
        return row;
    }

    function groupLabel(key) {
        const label = document.createElement("p");
        label.className = "lg-image-sources-group";
        label.textContent = getLgTranslation(key);
        return label;
    }

    function renderSourcesPanel(force = false) {
        const panel = document.getElementById(SOURCES_PANEL_ID);
        if (!panel || (panel.hidden && !force)) return;
        const { returned, failed, empty } = currentSources;
        const selected = getSelectedEngines().map(normalizeEngine);
        const meta = getResultsMeta();
        const status = (meta?.querySelector(".results-meta-stats") || meta)?.textContent?.trim() || "";
        const signature = JSON.stringify([
            currentSources.engines.map(e => [e.name, e.state, e.count, e.time, e.reason, e.retrying]),
            selected,
            status,
            sourcesEmptyOpen,
        ]);
        if (!force && panel.dataset.signature === signature) return;
        panel.dataset.signature = signature;

        panel.querySelector(".lg-image-sources-title").textContent = getLgTranslation("sourcesTitle");
        panel.querySelector(".lg-image-sources-status").textContent = status;
        panel.querySelector(".lg-image-sources-hint").textContent = returned.length > 1 ? getLgTranslation("sourcesHint") : "";
        panel.querySelector(".lg-image-sources-close").setAttribute("aria-label", getLgTranslation("close"));
        const settings = panel.querySelector(".lg-image-sources-settings");
        const base = typeof window.__DEGOOG_BASE_URL__ === "string" ? window.__DEGOOG_BASE_URL__ : "";
        settings.href = `${base}/settings/engines`;
        settings.textContent = getLgTranslation("engineSettings");

        const focusKey = panel.contains(document.activeElement) ? document.activeElement.dataset?.lgFocusKey : "";
        const body = panel.querySelector(".lg-image-sources-body");
        const nodes = [];
        if (returned.length) nodes.push(groupLabel("sourcesReturned"), ...returned.map(e => sourceRow(e, selected)));
        if (failed.length) nodes.push(groupLabel("sourcesFailedGroup"), ...failed.map(e => sourceRow(e, selected)));
        if (empty.length) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "lg-image-sources-empty-toggle";
            toggle.dataset.lgFocusKey = "empty";
            toggle.setAttribute("aria-expanded", String(sourcesEmptyOpen));
            toggle.innerHTML =
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>` +
                `<span><span class="lg-image-sources-empty-title"></span><span class="lg-image-sources-empty-names"></span></span>`;
            toggle.querySelector(".lg-image-sources-empty-title").textContent =
                countLabel(empty.length, "sourcesEmptyOne", "sourcesEmpty");
            toggle.querySelector(".lg-image-sources-empty-names").textContent = empty.map(e => e.name).join(", ");
            nodes.push(toggle);
            if (sourcesEmptyOpen) {
                const list = document.createElement("div");
                list.className = "lg-image-sources-empty-list";
                list.append(...empty.map(e => sourceRow(e, selected)));
                nodes.push(list);
            }
        }
        body.replaceChildren(...nodes);
        if (focusKey) {
            const target = [...panel.querySelectorAll("[data-lg-focus-key]")].find(el => el.dataset.lgFocusKey === focusKey);
            (target && !target.disabled ? target : panel).focus({ preventScroll: true });
        }
        if (!panel.hidden) positionSourcesPanel();
    }

    function positionSourcesPanel() {
        const panel = document.getElementById(SOURCES_PANEL_ID);
        const pill = document.getElementById(SOURCES_PILL_ID);
        if (!panel || panel.hidden || !pill) return;
        const sheet = PHONE_SHEET_QUERY.matches;
        panel.classList.toggle("lg-sheet", sheet);
        setSheetScrim("sources", sheet);
        if (sheet) {
            panel.style.removeProperty("top");
            panel.style.removeProperty("left");
        } else {
            placeBelowAnchor(panel, pill, true);
        }
    }

    function openSourcesPanel() {
        const pill = document.getElementById(SOURCES_PILL_ID);
        if (!pill) return;
        const panel = ensureSourcesPanel();
        panel.hidden = false;
        pill.setAttribute("aria-expanded", "true");
        renderSourcesPanel(true);
        panel.focus({ preventScroll: true });
    }

    function closeSourcesPanel(restoreFocus) {
        const panel = document.getElementById(SOURCES_PANEL_ID);
        if (!panel || panel.hidden) return;
        panel.hidden = true;
        setSheetScrim("sources", false);
        const pill = document.getElementById(SOURCES_PILL_ID);
        pill?.setAttribute("aria-expanded", "false");
        if (restoreFocus) pill?.focus();
    }

    function onSourcesPanelClick(event) {
        const target = event.target;
        if (target.closest?.(".lg-image-sources-close")) {
            closeSourcesPanel(true);
            return;
        }
        if (target.closest?.(".lg-image-sources-empty-toggle")) {
            sourcesEmptyOpen = !sourcesEmptyOpen;
            renderSourcesPanel(true);
            return;
        }
        const retry = target.closest?.(".lg-image-sources-retry");
        if (!retry || retry.disabled) return;
        const key = normalizeEngine(retry.dataset.engineName);
        const engine = currentSources.failed.find(e => normalizeEngine(e.name) === key);
        // Core's own retry link performs the request and re-renders its rows.
        engine?.retry?.click();
    }

    function onSourcesPanelChange(event) {
        const box = event.target?.closest?.(".lg-image-sources-check");
        if (!box) return;
        const returned = currentSources.returned.map(e => e.name);
        const key = normalizeEngine(box.dataset.engineName);
        let selected = getSelectedEngines();
        if (!selected.length) selected = [...returned];
        selected = selected.filter(name => normalizeEngine(name) !== key);
        if (box.checked) selected.push(box.dataset.engineName);
        if (!selected.length) {
            // Keep at least one source; an empty filter would mean "all".
            box.checked = true;
            return;
        }
        const keys = new Set(selected.map(normalizeEngine));
        setSelectedEngines(returned.every(name => keys.has(normalizeEngine(name))) ? [] : selected);
    }

    function onSourcesPanelKeydown(event) {
        const panel = event.currentTarget;
        if (event.key === "Escape") {
            event.preventDefault();
            closeSourcesPanel(true);
            return;
        }
        if (event.key !== "Tab") return;
        // The panel lives at the end of <body>; leaving it returns to the pill
        // so keyboard order continues from there.
        const focusable = [...panel.querySelectorAll("input, button, a[href]")].filter(el => !el.disabled);
        const first = focusable[0];
        const last = focusable.at(-1);
        const active = document.activeElement;
        if ((event.shiftKey && (active === first || active === panel)) || (!event.shiftKey && active === last)) {
            event.preventDefault();
            closeSourcesPanel(true);
        }
    }

    function onSourcesOutsidePointer(event) {
        const panel = document.getElementById(SOURCES_PANEL_ID);
        if (!panel || panel.hidden) return;
        if (panel.contains(event.target) || event.target?.closest?.(`#${SOURCES_PILL_ID}`)) return;
        closeSourcesPanel(false);
    }

    // Rows exist only while the visitor shows Engine Performance.
    let sourcesExpected = (window.__DEGOOG_SYNCED_DEFAULTS__ || {}).display_engine_performance !== false;
    readCorePrefs(["display_engine_performance"]).then(prefs => {
        if (typeof prefs.display_engine_performance !== "boolean") return;
        sourcesExpected = prefs.display_engine_performance;
        renderImageSources();
    });

    function renderImageSources() {
        currentSources = summarizeSources(isImagePillsMode() ? imageEngineRows() : []);
        if (!currentSources.engines.length) {
            closeSourcesPanel(false);
            if (isImagePillsMode() && sourcesExpected && window.degoog?.results?.current?.().settled !== true) {
                // Rows come with the first engine; hold the pill (meta stays hidden) until then.
                const pill = ensureSourcesPill();
                pill.querySelector(".lg-image-sources-pill__label").textContent = getLgTranslation("sourcesSearching");
                pill.querySelector(".lg-image-sources-pill__failed").hidden = true;
                setNativeEnginePanelAvailability(false);
                return;
            }
            document.getElementById(SOURCES_PILL_ID)?.remove();
            setNativeEnginePanelAvailability(true);
            return;
        }
        // "Untick to hide": sources that answer after a filter was chosen
        // join it instead of staying hidden.
        const fresh = currentSources.returned.filter(e => !sourcesSeen.has(normalizeEngine(e.name)));
        fresh.forEach(e => sourcesSeen.add(normalizeEngine(e.name)));
        const selected = getSelectedEngines();
        if (selected.length && fresh.length) setSelectedEngines([...selected, ...fresh.map(e => e.name)]);

        const pill = ensureSourcesPill();
        const total = currentSources.engines.length;
        const failed = currentSources.failed.length;
        pill.querySelector(".lg-image-sources-pill__label").textContent = countLabel(total, "sourcesOne", "sources");
        const failedNode = pill.querySelector(".lg-image-sources-pill__failed");
        failedNode.hidden = !failed;
        failedNode.textContent = failed ? getLgTranslation("sourcesFailed").replace("{count}", String(failed)) : "";
        setNativeEnginePanelAvailability(false);
        renderSourcesPanel();
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
        renderSourcesPanel();
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
            renderImageSources();
        }).observe(root, { childList: true, subtree: true });
    }

    function refreshEnginePanels() {
        for (const root of enginePanelRoots()) {
            ensureRootObserved(root);
        }
        decorateRows();
        syncRowHighlights(getSelectedEngines());
        renderImageSources();
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
        // Image filters are hosted beside the page, not inside it. The handlers
        // themselves restrict actions to our engine rows.
        document.addEventListener("click", onClick);
        document.addEventListener("keydown", onKeydown);
        document.addEventListener("pointerdown", onSourcesOutsidePointer, true);
    }

    function clearFilter() {
        resetSourceEngineLearner();
        sourcesSeen = new Set();
        setSelectedEngines([]);
    }

    function scheduleApply() {
        const engines = getSelectedEngines();
        if (!engines.length) return;
        requestAnimationFrame(() => applyFilter(engines));
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
        wrapResultsStats(getResultsMeta());

        const resultsMeta = getResultsMeta();
        if (resultsMeta && !resultsMeta.dataset.lgMetaStatsObserver) {
            resultsMeta.dataset.lgMetaStatsObserver = "1";
            new MutationObserver(() => {
                wrapResultsStats(resultsMeta);
                renderSourcesPanel();
            }).observe(resultsMeta, {
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
            renderImageSources();
        });
        window.addEventListener("degoog-results-settled", renderImageSources);

        window.addEventListener("lg-sync-search-type", () => {
            wrapResultsStats(getResultsMeta());
            refreshEnginePanels();
        });

        window.addEventListener("resize", positionSourcesPanel, { passive: true });
        PHONE_SHEET_QUERY.addEventListener?.("change", () => {
            renderImageSources();
            positionSourcesPanel();
        });

        decorateRows();
        renderImageSources();
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
    const TWO_COL_MIN = 1024;
    const SIDEBAR_MAX_REM = 21;
    const SIDEBAR_MIN_REM = 17;
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
        // Videos render as a web-style list beside the regular sidebar.
        if (type === "images") return false;
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
            return;
        }

        const innerWidth = targetGridInnerWidth(layout);
        const fluid = computeFluidColumns(innerWidth);
        const wasActive = fluidActive;
        fluidActive = true;

        applyFluidLayout(page, fluid);

        if (!wasActive) {
            window.dispatchEvent(new Event("lg-results-layout-changed"));
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
        const next = normalizeType(type);
        if (root.getAttribute(TYPE_ATTR) !== next) root.setAttribute(TYPE_ATTR, next);
    }

    function getTabSearchQuery() {
        // Core's tab handlers only search with a text (or bang) query. After an
        // image-only search they ignore clicks, so the other tabs are inert.
        const current = window.degoog?.results?.current;
        if (typeof current === "function") {
            try {
                return String(current()?.query || "").trim();
            } catch {
                /* Fall back to the URL and search box below. */
            }
        }
        const urlQuery = new URLSearchParams(window.location.search).get("q") || "";
        return (urlQuery || getResultsSearchInput()?.value || "").trim();
    }

    function syncInertTabs() {
        const tabs = getResultsTabs();
        if (!tabs) return;
        const inert = !getTabSearchQuery();
        tabs.querySelectorAll(".results-tab[data-type]").forEach(tab => {
            const active = tab.classList.contains("active") || tab.getAttribute("aria-selected") === "true";
            if (inert && !active) {
                if (tab.getAttribute("aria-disabled") !== "true") tab.setAttribute("aria-disabled", "true");
            } else if (tab.hasAttribute("aria-disabled")) {
                tab.removeAttribute("aria-disabled");
            }
        });
    }

    function setAttrIfChanged(node, name, value) {
        if (node.getAttribute(name) !== value) node.setAttribute(name, value);
    }

    function isTabShown(tab) {
        // Tabs folded under More are reached through that menu instead.
        return (
            !tab.hidden &&
            tab.style.display !== "none" &&
            tab.dataset.bangHidden !== "true" &&
            !tab.classList.contains("lg-tab-overflow")
        );
    }

    function syncTabSemantics() {
        // Core renders tabs (plugin tabs too, later) as plain divs and marks
        // the selected one with .active only. Keep them a keyboard tab list.
        const tabs = getResultsTabs();
        if (!tabs) return;
        const list = [...tabs.querySelectorAll(".results-tab[data-type]")];
        if (!list.length) return;
        const owner = list[0].parentElement;
        for (const node of [tabs, ...tabs.querySelectorAll('[role="tablist"]')]) {
            if (node !== owner && node.getAttribute("role") === "tablist") node.removeAttribute("role");
        }
        if (owner) setAttrIfChanged(owner, "role", "tablist");
        const active = list.find(tab => tab.classList.contains("active"));
        const tabStop = active && isTabShown(active) ? active : list.find(isTabShown) || list[0];
        for (const tab of list) {
            setAttrIfChanged(tab, "role", "tab");
            setAttrIfChanged(tab, "aria-selected", tab === active ? "true" : "false");
            setAttrIfChanged(tab, "tabindex", tab === tabStop ? "0" : "-1");
        }
    }

    function onTabsKeydown(event) {
        const tabs = getResultsTabs();
        const tab = event.target?.closest?.(".results-tab[data-type]");
        if (!tabs || !tab || !tabs.contains(tab)) return;
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            // Core's own click handler performs the tab search.
            if (!event.repeat) tab.click();
            return;
        }
        const list = [...tabs.querySelectorAll(".results-tab[data-type]")]
            .filter(item => isTabShown(item) && item.getClientRects().length > 0)
            .sort((a, b) => a.classList.contains("lg-tab-extra") - b.classList.contains("lg-tab-extra"));
        const index = list.indexOf(tab);
        if (index < 0) return;
        let next = -1;
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            const forward = (event.key === "ArrowRight") !== (getComputedStyle(tab).direction === "rtl");
            next = (index + (forward ? 1 : -1) + list.length) % list.length;
        } else if (event.key === "Home") {
            next = 0;
        } else if (event.key === "End") {
            next = list.length - 1;
        } else {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        list[next].focus();
    }

    function syncSearchType() {
        syncTabSemantics();
        syncInertTabs();
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
                // Switching optimistically when core will ignore the click
                // swaps the layout and then flips straight back (flicker).
                if (!getTabSearchQuery()) return;
                setSearchType(tab.dataset.type || "web");
            },
            true,
        );
        tabs.addEventListener("keydown", onTabsKeydown);

        new MutationObserver(syncSearchType).observe(tabs, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class", "aria-selected", "data-bang-hidden", "hidden"],
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
        window.addEventListener("degoog-results-ready", syncInertTabs);
        syncSearchType();
    }

    onReady(init);
})();

/* ── 6b. Related-search chips above the image grid ────────────────────── */
(() => {
    // Core keeps the sidebar (and its related searches) off the Images tab.
    // Offer the same terms as chips, reusing the Web sidebar's list when the
    // query matches and otherwise asking /api/suggest the way core does.
    const ROW_ID = "lg-image-related";
    const MAX_TERMS = 8;
    const termsByQuery = new Map();
    const pendingTerms = new Map();
    let renderSeq = 0;

    function currentQuery() {
        try {
            const query = window.degoog?.results?.current?.()?.query;
            if (typeof query === "string") return query.trim();
        } catch {
            /* Fall back to the search box. */
        }
        return (getResultsSearchInput()?.value || "").trim();
    }

    function normalizeTerms(raw, query) {
        if (!Array.isArray(raw)) return [];
        const seen = new Set([query.toLowerCase()]);
        const terms = [];
        for (const item of raw) {
            const text = typeof item === "string" ? item : item?.text;
            const term = typeof text === "string" ? text.trim() : "";
            if (!term || seen.has(term.toLowerCase())) continue;
            seen.add(term.toLowerCase());
            terms.push(term);
            if (terms.length >= MAX_TERMS) break;
        }
        return terms;
    }

    function rememberSidebarTerms() {
        const links = document.querySelectorAll("#results-sidebar .related-search-link[data-query]");
        const query = currentQuery();
        if (!links.length || !query) return;
        termsByQuery.set(query, normalizeTerms([...links].map(link => link.dataset.query), query));
    }

    function suggestPrefsFrom(prefs) {
        const defaults = window.__DEGOOG_SYNCED_DEFAULTS__ || {};
        const pref = key => (typeof prefs[key] === "boolean" ? prefs[key] : defaults[key]);
        return {
            enabled: pref("display_search_suggestions") !== false,
            post: pref("post_method_enabled") === true,
        };
    }

    // Read once per page; until then instance defaults decide the placeholder.
    let suggestPrefs = null;
    async function readSuggestPrefs() {
        suggestPrefs ??= suggestPrefsFrom(await readCorePrefs(["display_search_suggestions", "post_method_enabled"]));
        return suggestPrefs;
    }

    async function fetchTerms(query, prefs) {
        const base = typeof window.__DEGOOG_BASE_URL__ === "string" ? window.__DEGOOG_BASE_URL__ : "";
        const auth = window.__DEGOOG_SEARCH_AUTH__;
        const headers = auth ? { "x-search-nonce": auth.n, "x-search-sig": auth.s } : {};
        try {
            const res = prefs.post
                ? await fetch(`${base}/api/suggest`, {
                    method: "POST",
                    body: JSON.stringify({ query }),
                    headers: { "Content-Type": "application/json", ...headers },
                })
                : await fetch(`${base}/api/suggest?q=${encodeURIComponent(query)}`, { headers });
            return res.ok ? normalizeTerms(await res.json(), query) : [];
        } catch {
            return [];
        }
    }

    function termsFor(query, prefs) {
        let pending = pendingTerms.get(query);
        if (!pending) {
            pending = fetchTerms(query, prefs).then(terms => {
                termsByQuery.set(query, terms);
                pendingTerms.delete(query);
                return terms;
            });
            pendingTerms.set(query, pending);
        }
        return pending;
    }

    function removeRow() {
        document.getElementById(ROW_ID)?.remove();
    }

    function placeRow(row, query) {
        const list = getResultsList();
        if (!list) return;
        row.dataset.query = query;
        removeRow();
        list.before(row);
    }

    // Holds the chips' height while terms load, so the grid never moves down.
    function buildPendingRow() {
        const row = document.createElement("div");
        row.id = ROW_ID;
        row.className = "lg-image-related";
        row.dataset.pending = "1";
        row.setAttribute("aria-hidden", "true");
        const chip = document.createElement("span");
        chip.className = "lg-image-related-chip lg-image-related-chip--pending";
        row.appendChild(chip);
        return row;
    }

    function buildRow(terms) {
        const row = document.createElement("div");
        row.id = ROW_ID;
        row.className = "lg-image-related";
        row.setAttribute("role", "group");
        row.setAttribute("aria-label", getLgTranslation("relatedSearches"));
        for (const term of terms) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "lg-image-related-chip";
            chip.dataset.query = term;
            chip.innerHTML =
                `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>` +
                `<span class="lg-image-related-label"></span>`;
            chip.querySelector(".lg-image-related-label").textContent = term;
            row.appendChild(chip);
        }
        return row;
    }

    async function sync() {
        const seq = ++renderSeq;
        const query = currentQuery();
        if (getActiveSearchType() !== "images") rememberSidebarTerms();
        if (getActiveSearchType() !== "images" || !query || query.startsWith("!")) {
            removeRow();
            return;
        }
        const existing = document.getElementById(ROW_ID);
        if (existing?.dataset.query === query && !existing.dataset.pending) return;
        let terms = termsByQuery.get(query);
        if (!terms) {
            const likely = suggestPrefs || suggestPrefsFrom({});
            if (likely.enabled && document.getElementById(ROW_ID)?.dataset.query !== query) {
                placeRow(buildPendingRow(), query);
            }
            const prefs = await readSuggestPrefs();
            if (seq !== renderSeq) return;
            terms = prefs.enabled ? await termsFor(query, prefs) : [];
            if (seq !== renderSeq) return;
        }
        if (!terms.length || !getResultsList() || getActiveSearchType() !== "images" || currentQuery() !== query) {
            removeRow();
            return;
        }
        placeRow(buildRow(terms), query);
    }

    function onChipClick(event) {
        const chip = event.target?.closest?.(".lg-image-related-chip");
        if (!chip) return;
        const term = chip.dataset.query || "";
        if (!term) return;
        if (typeof window.degoog?.search === "function") {
            window.degoog.search(term, "images");
            return;
        }
        const input = getResultsSearchInput();
        if (input) input.value = term;
        document.getElementById("results-search-btn")?.click();
    }

    onReady(() => {
        if (!getResultsPage()) return;
        document.addEventListener("click", onChipClick);
        const sidebar = document.getElementById("results-sidebar");
        if (sidebar) new MutationObserver(rememberSidebarTerms).observe(sidebar, { childList: true, subtree: true });
        // Reserve the row at the skeleton, before any image arrives.
        const list = getResultsList();
        if (list) {
            new MutationObserver(mutations => {
                if (mutations.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && n.matches(".skeleton-image-grid")))) void sync();
            }).observe(list, { childList: true });
        }
        window.addEventListener("degoog-results-ready", () => void sync());
        window.addEventListener("lg-sync-search-type", () => void sync());
        window.addEventListener("popstate", () => window.requestAnimationFrame(() => void sync()));
        void sync();
    });
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
    const DESKTOP_MIN = 1024;
    const SEARCHING_ATTR = "data-lg-sidebar-searching";
    const USER_ATTR_ENGINE = "data-lg-sidebar-user-engine";
    const USER_ATTR_RELATED = "data-lg-sidebar-user-related";
    const USER_ATTR_KNOWLEDGE = "data-lg-sidebar-user-knowledge";
    // These toolkit cards return an empty slot title because they own their
    // content. In knowledge placement, reuse core's surrounding accordion and
    // give it a translated group heading without moving interactive content.
    const TOOLKIT_KNOWLEDGE_PANELS = [
        [".calc-card", "calculator", "name", "Calculator"],
        [".metro-card", "metronome", "name", "Metronome"],
        [".snake-card", "snake", "name", "Snake Game"],
        [".clrtr-card", "color-translator", "colorTranslator", "Color Translator"],
        [".books-card", "books", "name", "Books"],
        [".ms-card", "minesweeper", "name", "Minesweeper"],
        [".dslot-card", "define-slot", "name", "Dictionary"],
        [".places-wrap", "osm-slot", "name", "Places"],
        [".tipcalc-card", "tip-calculator", "name", "Tip Calculator"],
        [".pt-card", "periodic-table", "name", "Periodic Table of Elements"],
        [".stocks-card", "stocks", "name", "Stocks"],
        [".ttt-card", "tic-tac-toe", "name", "Tic-Tac-Toe"],
        [".timer-widget", "stopwatch", "name", "Timer / Stopwatch"],
        [".time-result", "time", "name", "Time"],
        [".music-card", "music", "name", "Music / Discography"],
        [".undecideds-slot", "undecideds", "name", "Decision tools"],
        [".until-card", "until", "name", "Countdown board"],
    ];
    const pluginPanelOverrides = new Map();
    let lastIsDesktop = null;
    let sidebarSyncFrame = 0;

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

    function isSelfContainedKnowledgePanel(accordion) {
        if (!accordion) return false;
        const toggle = accordion.querySelector(":scope > .sidebar-accordion-toggle");
        const body = accordion.querySelector(":scope > .sidebar-accordion-body");
        return (
            !!toggle &&
            !!body &&
            !toggle.textContent.trim() &&
            (body.childElementCount > 0 || !!body.textContent.trim())
        );
    }

    function isKnowledgePanel(accordion) {
        if (
            !accordion ||
            isEnginePerformancePanel(accordion) ||
            isRelatedSearchesPanel(accordion)
        ) {
            return false;
        }
        return (
            accordion.classList.contains("theme-plugin-panel") ||
            isSelfContainedKnowledgePanel(accordion) ||
            !!accordion.querySelector("[data-theme-panel-title], .kp-title, .kp-description, .kp-image, .wiki-card")
        );
    }

    function getKnowledgePanels(root) {
        return [...root.querySelectorAll(".sidebar-accordion")].filter(isKnowledgePanel);
    }

    function syncKnowledgeAccordion(accordion) {
        const selfContained = isSelfContainedKnowledgePanel(accordion);
        accordion.classList.toggle("lg-sidebar-knowledge-self-contained", selfContained);
        if (!accordion.classList.contains("lg-sidebar-knowledge")) {
            accordion.classList.add("lg-sidebar-knowledge");
        }
        if (selfContained) {
            accordion.classList.add("open");
            return;
        }
        const pluginKey = accordion.getAttribute("data-theme-plugin-panel");
        const override = pluginKey ? pluginPanelOverrides.get(pluginKey) : undefined;
        if (override !== undefined) {
            accordion.setAttribute(USER_ATTR_KNOWLEDGE, "1");
            accordion.classList.toggle("open", override);
        } else if (!accordion.hasAttribute(USER_ATTR_KNOWLEDGE)) {
            accordion.classList.toggle("open", getKnowledgeMode() === "open");
        }
        accordion.querySelector(":scope > .sidebar-accordion-toggle")?.setAttribute(
            "aria-expanded", String(accordion.classList.contains("open")),
        );
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
        const override = root.getAttribute(USER_ATTR_ENGINE);
        const shouldBeOpen = override === null
            ? shouldEngineBeOpen(getEngineMode(root), isSearching())
            : override === "true";
        if (accordion.classList.contains("open") !== shouldBeOpen) {
            accordion.classList.toggle("open", shouldBeOpen);
        }
        accordion.querySelector(".sidebar-accordion-toggle")?.setAttribute("aria-expanded", String(shouldBeOpen));
    }

    function syncRelatedAccordion(accordion) {
        if (accordion.hasAttribute(USER_ATTR_RELATED)) return;
        const shouldBeOpen = getRelatedMode() === "open";
        if (accordion.classList.contains("open") !== shouldBeOpen) {
            accordion.classList.toggle("open", shouldBeOpen);
        }
    }

    function toolkitPanelTitle([, folder, key, fallback]) {
        const namespace = `plugin-${folder}`;
        const translated = window.scopedT?.(namespace)?.(key);
        return translated && translated !== key && translated !== `${namespace}.${key}`
            ? translated
            : fallback;
    }

    function syncPluginPanels() {
        const contents = new Map();
        document.querySelectorAll("#results-sidebar .sidebar-accordion > .sidebar-accordion-body").forEach(body => {
            // Unit Converter already owns its accessible header and picker.
            if (body.querySelector(".uxs-wrap")) return;
            const descriptor = TOOLKIT_KNOWLEDGE_PANELS.find(([selector]) => body.querySelector(selector));
            if (!descriptor) return;
            const content = body.querySelector(descriptor[0]);
            contents.set(content, {
                title: content.getAttribute("data-theme-panel-title") || toolkitPanelTitle(descriptor),
                id: descriptor[1],
            });
        });
        document.querySelectorAll("#results-sidebar [data-theme-panel-title], .results-slot-panel-full-width [data-theme-panel-title]").forEach(content => {
            if (contents.has(content) || content.matches(".uxs-wrap") || content.closest(".uxs-wrap")) return;
            const title = content.getAttribute("data-theme-panel-title");
            if (title) contents.set(content, { title, id: title });
        });
        contents.forEach(({ title, id }, content) => {
            let accordion = content.closest(".sidebar-accordion");
            if (!accordion) {
                accordion = document.createElement("div");
                accordion.className = "sidebar-panel sidebar-accordion degoog-panel degoog-panel--accordion degoog-panel--stack-item";
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "sidebar-accordion-toggle degoog-accordion-toggle degoog-accordion-toggle--sidebar";
                toggle.innerHTML = '<span></span><svg class="accordion-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
                const body = document.createElement("div");
                body.className = "sidebar-accordion-body degoog-accordion-body";
                content.before(accordion);
                body.append(content);
                accordion.append(toggle, body);
            }
            accordion.classList.add("theme-plugin-panel");
            content.classList.add("theme-plugin-content");
            const scope = accordion.closest("#results-sidebar") ? "sidebar" : "full-width";
            const pluginKey = `${scope}:${id}`;
            accordion.setAttribute("data-theme-plugin-panel", pluginKey);
            const toggle = accordion.querySelector(":scope > .sidebar-accordion-toggle");
            const body = accordion.querySelector(":scope > .sidebar-accordion-body");
            if (!toggle || !body) return;
            const label = toggle.querySelector("span");
            if (label && label.textContent !== title) label.textContent = title;
            if (!toggle.hasAttribute("data-theme-plugin-toggle")) {
                toggle.setAttribute("data-theme-plugin-toggle", "");
                toggle.dataset.sidebarToggleWired = "true";
                toggle.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    accordion.setAttribute(USER_ATTR_KNOWLEDGE, "1");
                    const open = !accordion.classList.contains("open");
                    pluginPanelOverrides.set(accordion.getAttribute("data-theme-plugin-panel"), open);
                    accordion.classList.toggle("open", open);
                    toggle.setAttribute("aria-expanded", String(open));
                }, true);
            }
            syncKnowledgeAccordion(accordion);
            toggle.setAttribute("aria-expanded", String(accordion.classList.contains("open")));
        });
    }

    function syncAll() {
        if (!isThemeEnabled()) return;
        syncPluginPanels();
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
        if (sidebarSyncFrame) return;
        sidebarSyncFrame = window.requestAnimationFrame(() => {
            sidebarSyncFrame = 0;
            bindRoots();
            syncAll();
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
        pluginPanelOverrides.clear();
        document.querySelectorAll(".theme-plugin-panel").forEach(accordion => {
            accordion.removeAttribute(USER_ATTR_KNOWLEDGE);
        });
        sidebarRoots().forEach(root => {
            root.removeAttribute(USER_ATTR_ENGINE);
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
                    // Core's streaming toggle and sidebar-suggestion wiring can
                    // both attach click handlers. Own this one action in capture
                    // so a click cannot toggle twice and appear unresponsive.
                    event.preventDefault();
                    event.stopPropagation();
                    const open = !accordion.classList.contains("open");
                    root.setAttribute(USER_ATTR_ENGINE, String(open));
                    accordion.classList.toggle("open", open);
                    toggle.setAttribute("aria-expanded", String(open));
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

        function checkThumb(img, results) {
            if (!img.classList.contains("image-thumb")) return;
            const card = img.closest(".image-card");
            if (!card) return;
            observeImageCardView(card);
            wireImageCardMetaLinks(card);
            syncImageCardFavicon(card, results);
            if (img.complete && img.naturalWidth > 0) {
                markImageThumbLoaded(img);
            } else if (!img.closest(".image-thumb-wrap")?.classList.contains("lg-thumb-error")) {
                card.classList.remove("lg-img-loaded");
                img.closest(".image-thumb-wrap")?.classList.remove("loaded");
            }
        }

        const results = getCurrentResults();
        resultsList.querySelectorAll(".image-card .image-thumb").forEach(img => checkThumb(img, results));

        if (!resultsList.dataset.lgImgLoadObserver) {
            resultsList.dataset.lgImgLoadObserver = "1";
            new MutationObserver(mutations => {
                let batchResults = null;
                const check = img => checkThumb(img, (batchResults ??= getCurrentResults()));
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== 1 || !node.isConnected) continue;
                        if (node.classList.contains("image-card")) {
                            const img = node.querySelector(".image-thumb");
                            if (img) check(img);
                        } else {
                            node.querySelectorAll(".image-card .image-thumb").forEach(check);
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
                            node.matches?.("[data-theme-panel-title]") ||
                            !!node.querySelector?.(
                                "#results-sidebar, #image-engine-panel, [data-theme-panel-title]",
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

/* ── 9. Autocomplete display observer ───────────────────────────────────── */
(() => {
    function initAutocompleteObserver() {
        const observer = new MutationObserver((mutations) => {
            let acDropdownsChanged = false;
            for (const mutation of mutations) {
                if (mutation.type === "attributes" && mutation.attributeName === "style") {
                    const target = mutation.target;
                    if (target.classList.contains("ac-dropdown") || target.classList.contains("bang-ac-dropdown")) {
                        acDropdownsChanged = true;
                        break;
                    }
                }
            }
            if (acDropdownsChanged) {
                updateAllBars();
            }
        });

        function updateBar(bar) {
            if (!bar) return;
            const ac = bar.querySelector(".ac-dropdown");
            const bangAc = bar.querySelector(".bang-ac-dropdown");

            const isAcVisible = ac && ac.style.display && ac.style.display !== "none";
            const isBangVisible = bangAc && bangAc.style.display && bangAc.style.display !== "none";

            if (isAcVisible || isBangVisible) {
                bar.classList.add("lg-ac-open");
            } else {
                bar.classList.remove("lg-ac-open");
            }

            if (isAcVisible) {
                bar.classList.add("lg-ac-dropdown-open");
            } else {
                bar.classList.remove("lg-ac-dropdown-open");
            }

            if (isBangVisible) {
                bar.classList.add("lg-bang-ac-dropdown-open");
            } else {
                bar.classList.remove("lg-bang-ac-dropdown-open");
            }
        }

        function updateAllBars() {
            document.querySelectorAll(".results-search-bar, .search-bar").forEach(updateBar);
        }

        // Start observing style mutations anywhere in the body
        observer.observe(document.body, {
            attributes: true,
            attributeFilter: ["style"],
            subtree: true
        });

        // Also run once initially and on degoog-results-ready
        updateAllBars();
        window.addEventListener("degoog-results-ready", updateAllBars);
    }
    onReady(initAutocompleteObserver);
})();
