import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (theme, file) => readFile(new URL(`./${theme}/${file}`, import.meta.url), 'utf8');

test('both themes load the same expanding-control assets before search initialization', async () => {
    for (const file of ['image-filters.css', 'scripts/image-filters.js']) {
        assert.equal(await read('literallygoogle', file), await read('literallyapple', file));
    }
    for (const theme of ['literallygoogle', 'literallyapple']) {
        const template = await read(theme, 'search.html');
        assert.ok(template.indexOf('/scripts/image-filters.js') < template.indexOf('/scripts/search.js'));
        assert.match(template, /__THEME_PATH__\/image-filters.css/);
        assert.match(template, /__THEME_PATH__\/scripts\/image-filters.js/);
        const context = vm.createContext({ window: {} });
        new vm.Script(await read(theme, 'scripts/image-filters.js')).runInContext(context);
        assert.equal(typeof context.window.LgImageFilterControl, 'function');
    }
});

test('search integration no longer starts the competing drawer animation', async () => {
    for (const theme of ['literallygoogle', 'literallyapple']) {
        const script = await read(theme, 'scripts/search.js');
        assert.doesNotMatch(script, /prepareImageDrawerAnimation|wireImageDrawerPullDismiss|lg-drawer-pull-tab/);
        assert.match(script, /imageFilterControl\?\.destroy\(\)/);
    }
});

for (const theme of ['literallygoogle', 'literallyapple']) {
    test(`${theme}: a cold-loaded image shortcut recovers the detached native filter node`, async () => {
        const script = await read(theme, 'scripts/search.js');
        const original = { name: 'native filters' };
        let connected = original;
        const context = vm.createContext({ document: { getElementById: () => connected } });
        const start = script.indexOf('let imageFiltersBarNode =');
        const end = script.indexOf('\nfunction getResultsLayout()', start);
        assert.ok(start > 0 && end > start);
        vm.runInContext(script.slice(start, end), context);
        assert.equal(context.getImageFiltersBar(), original);
        connected = null;
        assert.equal(context.getImageFiltersBar(), original, 'cached native node survives a non-image detachment');
        const replacement = { name: 'replacement filters' };
        connected = replacement;
        assert.equal(context.getImageFiltersBar(), replacement, 'a genuine core replacement supersedes the cached node');
        assert.match(script, /if \(!sidebar\.isConnected\) getResultsLayout\(\)\?\.appendChild\(sidebar\)/);
    });

    test(`${theme}: reclaim the native filter node after tab switching without reviving detached panels`, async () => {
        const context = vm.createContext({ window: {} });
        new vm.Script(await read(theme, 'scripts/image-filters.js')).runInContext(context);
        const control = Object.create(context.window.LgImageFilterControl.prototype);
        const layout = {};
        const nativeHandler = () => {};
        const sidebar = { isConnected: true, parentNode: layout, onclick: nativeHandler, selection: 'large' };
        let moves = 0;
        const anchors = [];
        const shell = {
            appendChild(node) { assert.equal(node, sidebar); moves++; node.parentNode = shell; },
            classList: { toggle(name, value) { anchors.push([name, value]); } },
        };
        Object.assign(control, {
            sidebar, shell, open: true, destroyed: false,
            syncState() {}, scheduleMeasure() {},
        });

        control.update({ right: false });
        assert.equal(sidebar.parentNode, shell, 'native node returns to the expanding surface');
        assert.equal(sidebar.onclick, nativeHandler, 'core handlers are preserved');
        assert.equal(sidebar.selection, 'large');
        assert.equal(control.open, true, 'mount repair does not toggle the disclosure');
        control.update({ right: true });
        assert.equal(moves, 1, 'repeated updates do not reparent an already-owned panel');
        assert.deepEqual(anchors.at(-1), ['anchor-right', true]);

        sidebar.isConnected = false;
        sidebar.parentNode = null;
        control.update({ right: true });
        assert.equal(sidebar.parentNode, null, 'non-image tab can detach its cached node');
        assert.equal(moves, 1);
        sidebar.isConnected = true;
        sidebar.parentNode = layout;
        control.update({ right: true });
        assert.equal(sidebar.parentNode, shell, 'return to Images repairs ownership again');
        assert.equal(moves, 2);

        control.destroyed = true;
        sidebar.parentNode = layout;
        control.update({ right: false });
        assert.equal(sidebar.parentNode, layout, 'stale controller cannot reclaim a released panel');

        const script = await read(theme, 'scripts/search.js');
        assert.match(script, /node\.id === "image-filters-bar"/, 'core reattachment schedules setup even when search type stays images');
    });
}

class TestClassList {
    constructor(...names) {
        this.names = new Set(names.filter(Boolean));
    }

    add(...names) {
        names.forEach(name => this.names.add(name));
    }

    remove(...names) {
        names.forEach(name => this.names.delete(name));
    }

    contains(name) {
        return this.names.has(name);
    }

    toggle(name, force) {
        const next = force === undefined ? !this.names.has(name) : Boolean(force);
        if (next) this.names.add(name);
        else this.names.delete(name);
        return next;
    }
}

class TestStyle {
    constructor() {
        this.values = new Map();
    }

    setProperty(name, value) {
        this.values.set(name, String(value));
    }

    removeProperty(name) {
        this.values.delete(name);
    }

    getPropertyValue(name) {
        return this.values.get(name) || "";
    }
}

class TestElement {
    constructor(tagName = "div", id = "") {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.children = [];
        this.parentNode = null;
        this.classList = new TestClassList();
        this.attributes = new Map();
        this.dataset = {};
        this.style = new TestStyle();
        this.hidden = false;
        this.text = "";
    }

    get parentElement() {
        return this.parentNode;
    }

    get className() {
        return [...this.classList.names].join(" ");
    }

    set className(value) {
        this.classList = new TestClassList(...String(value ?? "").split(/\s+/));
    }

    get childNodes() {
        return this.children;
    }

    get childElementCount() {
        return this.children.length;
    }

    get nextElementSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        return this.parentNode.children[index + 1] || null;
    }

    get isConnected() {
        return Boolean(this.parentNode);
    }

    get textContent() {
        return this.text + this.children.map(child => child.textContent).join("");
    }

    set textContent(value) {
        this.text = String(value ?? "");
        this.replaceChildren();
    }

    set innerHTML(value) {
        this.replaceChildren();
        if (!String(value).includes("lg-media-engine-pills__scroll")) return;

        const previous = new TestElement("button");
        previous.setAttribute("data-lg-engine-scroll", "prev");
        const scroll = new TestElement();
        scroll.classList.add("lg-media-engine-pills__scroll");
        const pills = new TestElement();
        pills.classList.add("lg-media-engine-pills");
        const next = new TestElement("button");
        next.setAttribute("data-lg-engine-scroll", "next");
        scroll.appendChild(pills);
        this.append(previous, scroll, next);
    }

    append(...nodes) {
        nodes.forEach(node => this.appendChild(node));
    }

    appendChild(node) {
        if (node?.isFragment) {
            this.append(...node.children);
            return node;
        }
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
        node.parentNode = this;
        this.children.push(node);
        return node;
    }

    insertBefore(node, anchor) {
        if (!anchor || !this.children.includes(anchor)) return this.appendChild(node);
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
        node.parentNode = this;
        this.children.splice(this.children.indexOf(anchor), 0, node);
        return node;
    }

    after(node) {
        if (!this.parentNode) return;
        const parent = this.parentNode;
        const index = parent.children.indexOf(this);
        if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(child => child !== node);
        node.parentNode = parent;
        parent.children.splice(index + 1, 0, node);
    }

    replaceChildren(...nodes) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = [];
        nodes.forEach(node => this.appendChild(node));
    }

    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }

    setAttribute(name, value) {
        const stringValue = String(value);
        this.attributes.set(name, stringValue);
        if (name === "id") this.id = stringValue;
        if (name === "class") this.classList = new TestClassList(...stringValue.split(/\s+/));
    }

    getAttribute(name) {
        if (name === "id") return this.id || null;
        if (name === "class") return [...this.classList.names].join(" ") || null;
        return this.attributes.get(name) ?? null;
    }

    removeAttribute(name) {
        this.attributes.delete(name);
        if (name === "id") this.id = "";
    }

    matches(selector) {
        const simple = selector.trim().replace(/^:scope\s*>\s*/, "");
        if (simple.startsWith(".")) return simple.split(".").filter(Boolean).every(name => this.classList.contains(name));
        if (simple.startsWith("#")) return this.id === simple.slice(1);
        const dataMatch = simple.match(/^\[data-lg-engine-scroll=["'](prev|next)["']\]$/);
        if (dataMatch) return this.getAttribute("data-lg-engine-scroll") === dataMatch[1];
        return false;
    }

    querySelectorAll(selector) {
        const selectors = selector.split(",").map(item => item.trim());
        const descendants = [];
        const visit = node => {
            node.children.forEach(child => {
                descendants.push(child);
                visit(child);
            });
        };
        visit(this);
        return descendants.filter(node => selectors.some(item => node.matches(item)));
    }

    querySelector(selector) {
        if (selector === ".results-meta-stats" || selector === ".spell-check-notice") {
            return this.querySelectorAll(selector)[0] || null;
        }
        return this.querySelectorAll(selector)[0] || null;
    }

    getBoundingClientRect() {
        return { top: 0, bottom: 0, left: 0, right: 390, width: 390, height: 24 };
    }

    addEventListener() {}
}

function createMediaEngineHarness() {
    const page = new TestElement("main", "results-page");
    page.setAttribute("data-lg-search-type", "images");
    const meta = new TestElement("div", "results-meta");
    const stats = new TestElement("span");
    stats.classList.add("results-meta-stats");
    const results = new TestElement("div", "results-list");
    const filters = new TestElement("div", "image-filters-bar");
    const panel = new TestElement("div", "image-engine-panel");
    const rows = [
        ["Fast engine", "18 ms"],
        ["Unavailable engine", "0 results · 3000ms"],
    ].map(([label, timing]) => {
        const row = new TestElement("div");
        row.classList.add("engine-stat-row");
        const labelNode = new TestElement("span");
        labelNode.classList.add("engine-stat-label");
        labelNode.textContent = label;
        const metaNode = new TestElement("span");
        metaNode.classList.add("engine-stat-meta");
        metaNode.textContent = timing;
        if (label === "Unavailable engine") {
            const reason = new TestElement("span");
            reason.classList.add("engine-stat-reason");
            reason.setAttribute("data-tooltip", "Timed out");
            metaNode.appendChild(reason);
        }
        row.append(labelNode, metaNode);
        return row;
    });
    panel.append(...rows);
    filters.appendChild(panel);
    meta.appendChild(stats);
    page.append(meta, filters, results);

    const body = new TestElement("body");
    body.appendChild(page);
    const document = {
        readyState: "complete",
        body,
        documentElement: new TestElement("html"),
        createElement: tagName => new TestElement(tagName),
        createDocumentFragment: () => Object.assign(new TestElement(), { isFragment: true }),
        getElementById(id) {
            const all = [page, meta, stats, results, filters, panel, ...rows];
            const find = node => node.id === id ? node : node.children.map(find).find(Boolean);
            return all.map(find).find(Boolean) || null;
        },
        querySelectorAll(selector) {
            if (selector.includes(".engine-stat-row")) return rows;
            return body.querySelectorAll(selector);
        },
        addEventListener() {},
    };
    const window = {
        innerWidth: 390,
        addEventListener() {},
        matchMedia: () => ({ matches: false }),
        dispatchEvent() {},
    };
    class EventSource {}
    EventSource.prototype.addEventListener = function () {};
    let frameId = 0;
    const context = vm.createContext({
        window,
        document,
        EventSource,
        HTMLElement: TestElement,
        Node: TestElement,
        ResizeObserver: class { observe() {} },
        requestAnimationFrame(callback) { callback(); return ++frameId; },
        cancelAnimationFrame() {},
        getComputedStyle: () => ({ getPropertyValue: () => "", paddingLeft: "0px" }),
        performance: { now: () => 0 },
        onReady() {},
        getResultsPage: () => page,
        getResultsMeta: () => meta,
        getResultsTabs: () => null,
        getResultsList: () => results,
        getActiveSearchType: () => page.getAttribute("data-lg-search-type"),
        getMediaPreviewPanel: () => null,
        getMediaContentRailRightEdge: () => null,
        getNormalResultsRightEdge: () => null,
        getMediaResultsLeftEdge: () => null,
        getMediaResultsRightEdge: () => null,
        isDockedMediaPreviewOpen: () => false,
        wrapResultsStats() {},
    });
    return { context, page, meta, window, rows };
}

for (const theme of ['literallygoogle', 'literallyapple']) {
    test(`${theme}: engine pills stay in flow across mobile/desktop resize`, async () => {
        const script = await read(theme, 'scripts/search.js');
        const start = script.indexOf('/* ── 5c. Engine performance row');
        const end = script.indexOf('\n/* ── 5d.', start);
        assert.ok(start >= 0 && end > start);
        const section = script.slice(start, end).replace(
            '    onReady(init);\n})();',
            '    globalThis.__mediaEnginePills = { renderMediaEnginePills, getMediaEnginePillsHost };\n})();',
        );
        const harness = createMediaEngineHarness();
        new vm.Script(section).runInContext(harness.context);
        const controls = harness.context.__mediaEnginePills;

        controls.renderMediaEnginePills();
        const host = controls.getMediaEnginePillsHost();
        assert.ok(host, 'mobile image searches create an in-flow engine control host');
        assert.equal(host.parentNode, harness.meta);
        assert.equal(host.hidden, false);
        assert.equal(harness.page.classList.contains('lg-media-engine-pills-ready'), true);
        assert.equal(host.querySelectorAll('.lg-media-engine-pill').length, 2);
        assert.match(host.textContent, /Fast engine18 ms/);
        assert.match(host.textContent, /Unavailable engine0 results · 3000ms · Timed out/);

        harness.rows[0].querySelector('.engine-stat-label').textContent = '';
        harness.rows[1].querySelector('.engine-stat-label').textContent = '';
        controls.renderMediaEnginePills();
        assert.equal(host.hidden, true, 'empty engine rows keep the native drawer fallback');
        assert.equal(harness.page.classList.contains('lg-media-engine-pills-ready'), false);
        harness.rows[0].querySelector('.engine-stat-label').textContent = 'Fast engine';
        controls.renderMediaEnginePills();
        assert.equal(harness.page.classList.contains('lg-media-engine-pills-ready'), true);

        harness.window.innerWidth = 1024;
        controls.renderMediaEnginePills();
        assert.equal(controls.getMediaEnginePillsHost(), host, 'desktop resize keeps the same control host');

        harness.window.innerWidth = 390;
        controls.renderMediaEnginePills();
        assert.equal(controls.getMediaEnginePillsHost(), host, 'mobile resize restores normal-flow controls');
        assert.equal(host.classList.contains('lg-media-engine-rail--stuck'), false);

        harness.page.setAttribute('data-lg-search-type', 'web');
        controls.renderMediaEnginePills();
        assert.equal(controls.getMediaEnginePillsHost(), null, 'non-image searches remove the image-only host');
    });
}
