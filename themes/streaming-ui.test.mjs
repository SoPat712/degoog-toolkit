import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

for (const theme of ['literallygoogle', 'literallyapple']) {
    const source = await readFile(new URL(`./${theme}/scripts/search.js`, import.meta.url), 'utf8');
    const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

    test(`${theme}: server pagination preserves GET filters and leaves POST queries private`, () => {
        let navigated;
        let stopped = false;
        const link = {classList:{contains:()=>false}};
        const location = {href:'https://search.example/search?q=%21openalex+sleep&type=scientific+publications&lang=en&time=year',assign:url=>{navigated=url;}};
        const input = {value:'!openalex sleep'};
        const context = vm.createContext({
            URL, window:{location}, getResultsSearchInput:()=>input,
            getPageNumber:()=>2, getResultCount:()=>20, usesClientPagination:()=>false,
        });
        vm.runInContext(section('    function interceptPaginationClicks(', '    function observePagination('), context);
        const click = () => context.interceptPaginationClicks({
            target:{closest:()=>link}, preventDefault(){}, stopImmediatePropagation(){stopped=true;},
        });
        click();
        const url = new URL(navigated);
        assert.equal(url.searchParams.get('page'),'2');
        assert.equal(url.searchParams.get('q'),'!openalex sleep');
        assert.equal(url.searchParams.get('type'),'scientific publications');
        assert.equal(url.searchParams.get('lang'),'en');
        assert.equal(url.searchParams.get('time'),'year');
        assert.equal(stopped,true);
        navigated=undefined;stopped=false;
        location.href='https://search.example/search?type=scientific+publications';
        click();
        assert.equal(navigated,undefined);
        assert.equal(stopped,false);
        location.href='https://search.example/search?q=old+query';
        click();
        assert.equal(navigated,undefined, 'a stale URL must not expose a new input query');
    });

    test(`${theme}: a streaming batch restores display before returning, including errors`, () => {
        for (const previous of ['', 'grid', 'none']) {
            const values = new Map(previous ? [['display', previous]] : []);
            let layoutReads = 0;
            const list = {
                isConnected: true,
                style: {
                    getPropertyValue: key => values.get(key) || '',
                    getPropertyPriority: () => previous ? 'important' : '',
                    setProperty: (key, value) => values.set(key, value),
                    removeProperty: key => values.delete(key),
                },
                getBoundingClientRect() { layoutReads++; return {}; },
            };
            const context = vm.createContext({ getResultsList: () => list, getResultsPage: () => ({dataset:{}}), performance: {now:()=>0} });
            vm.runInContext(section('function runStreamingRenderBatch(', 'function onReady('), context);
            const result = context.runStreamingRenderBatch(() => {
                assert.equal(values.get('display'), 'none');
                return 42;
            });
            assert.equal(result, 42);
            assert.equal(values.get('display') || '', previous);
            assert.equal(layoutReads, 1);
            assert.throws(() => context.runStreamingRenderBatch(() => { throw new Error('renderer failed'); }), /renderer failed/);
            assert.equal(values.get('display') || '', previous);
            assert.equal(layoutReads, 2);
        }
    });

    test(`${theme}: engine accordions toggle once and preserve choice through replacement`, () => {
        const makePanel = () => {
            const classes = new Set();
            const attrs = new Map();
            const toggle = {setAttribute:(k,v)=>attrs.set(k,v), closest:()=>panel};
            const panel = {
                classList: {contains:k=>classes.has(k), toggle:(k,on)=>on?classes.add(k):classes.delete(k)},
                querySelector:()=>toggle,
            };
            return {panel, toggle, attrs};
        };
        const rootAttrs = new Map();
        let click;
        const root = {
            hasAttribute:k=>rootAttrs.has(k), setAttribute:(k,v)=>rootAttrs.set(k,v),
            getAttribute:k=>rootAttrs.get(k) ?? null, contains:()=>true,
            addEventListener:(name,fn,capture)=>{assert.equal(capture,true);click=fn;},
        };
        const context = vm.createContext({
            USER_ATTR_ENGINE:'engine-choice', USER_ATTR_RELATED:'related-choice', USER_ATTR_KNOWLEDGE:'knowledge-choice',
            isEnginePerformancePanel:()=>true, isRelatedSearchesPanel:()=>false, isKnowledgePanel:()=>false,
            getEngineMode:()=> 'open', isSearching:()=>true, shouldEngineBeOpen:()=>true,
            MutationObserver:class {observe() {}},
        });
        vm.runInContext(section('    function syncEngineAccordion(', '    function syncRelatedAccordion(') + section('    function bindSidebar(', '    function observeSearchLifecycle('), context);
        context.bindSidebar(root);
        let {panel,toggle,attrs} = makePanel();
        const activate = () => {
            let stopped = false;
            click({target:{closest:()=>toggle}, preventDefault(){}, stopPropagation(){stopped=true;}});
            assert.ok(stopped, 'native duplicate listeners must not also toggle');
        };
        activate();
        assert.equal(panel.classList.contains('open'), true);
        assert.equal(attrs.get('aria-expanded'), 'true');
        activate();
        assert.equal(panel.classList.contains('open'), false);
        assert.equal(rootAttrs.get('engine-choice'), 'false');
        ({panel,toggle,attrs} = makePanel());
        context.syncEngineAccordion(panel,root);
        assert.equal(panel.classList.contains('open'), false, 'stream completion must not override a manual collapse');
        assert.equal(attrs.get('aria-expanded'), 'false');
    });
}

class FakeElement {
    constructor({ tag = 'div', open = false, editable = false, href = '' } = {}) {
        this.tag = tag;
        this.href = href;
        this.isContentEditable = editable;
        this.attrs = new Map();
        this.dataset = {};
        this.style = {};
        this.listeners = {};
        const classes = new Set(open ? ['open'] : []);
        this.classList = {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
        };
    }
    setAttribute(key, value) { this.attrs.set(key, String(value)); }
    getAttribute(key) { return this.attrs.has(key) ? this.attrs.get(key) : null; }
    hasAttribute(key) { return this.attrs.has(key); }
    removeAttribute(key) { this.attrs.delete(key); }
    addEventListener(type, handler) { this.listeners[type] = handler; }
    querySelector() { return (this.child ??= new FakeElement()); }
    closest(selector) {
        const matches = selector.split(',').map(part => part.trim()).some(part =>
            part === this.tag || (part === 'a[href]' && this.tag === 'a' && this.href) || part === `#${this.id}`);
        return matches ? this : null;
    }
}

for (const theme of ['literallygoogle', 'literallyapple']) {
    const source = await readFile(new URL(`./${theme}/scripts/search.js`, import.meta.url), 'utf8');
    const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const textEntry = section('function isTextEntryTarget(', 'function nodeStartsSearch(');

    test(`${theme}: text entry targets are recognized for key handlers`, () => {
        const context = vm.createContext({ Element: FakeElement, HTMLElement: FakeElement });
        vm.runInContext(textEntry, context);
        for (const tag of ['input', 'textarea', 'select']) assert.equal(context.isTextEntryTarget(new FakeElement({ tag })), true, tag);
        assert.equal(context.isTextEntryTarget(new FakeElement({ editable: true })), true, 'contenteditable');
        assert.equal(context.isTextEntryTarget(new FakeElement({ tag: 'button' })), false);
        assert.equal(context.isTextEntryTarget(new FakeElement()), false);
        assert.equal(context.isTextEntryTarget(null), false);
    });

    test(`${theme}: preview arrow keys leave text fields and the filter control alone`, () => {
        const start = source.indexOf('            e => {\n                if (isVideosTabActive()) return;\n                if (e.key !== "ArrowLeft"');
        const end = source.indexOf('\n            },\n            true,', start);
        assert.ok(start > 0 && end > start);
        const moves = [];
        const panel = new FakeElement({ open: true });
        const context = vm.createContext({
            Element: FakeElement, HTMLElement: FakeElement, panel,
            isVideosTabActive: () => false,
            navigatePreviewByVisualOrder: direction => moves.push(direction),
        });
        vm.runInContext(textEntry, context);
        const handler = vm.runInContext(`(${source.slice(start, end + '\n            }'.length).trim()})`, context);
        const press = (target, extra = {}) => {
            let prevented = false;
            handler({ key: 'ArrowLeft', target, preventDefault() { prevented = true; }, stopImmediatePropagation() {}, ...extra });
            return prevented;
        };
        assert.equal(press(new FakeElement({ tag: 'input' })), false, 'caret movement in the search box');
        assert.equal(press(new FakeElement({ editable: true })), false);
        const radio = new FakeElement({ tag: 'button' });
        radio.closest = selector => (selector === '#lg-image-filter-control' ? radio : null);
        assert.equal(press(radio), false, 'filter radios keep arrow navigation');
        assert.equal(press(new FakeElement(), { altKey: true }), false, 'browser history shortcut');
        assert.deepEqual(moves, []);
        assert.equal(press(new FakeElement()), true);
        assert.deepEqual(moves, [-1]);
    });

    test(`${theme}: streamed batches keep an open lightbox visible and keyboard-safe`, () => {
        let keydown;
        const counts = { zoom: 0, close: 0 };
        const context = vm.createContext({
            Element: FakeElement, HTMLElement: FakeElement, HTMLImageElement: class extends FakeElement {},
            MutationObserver: class { observe() {} },
            document: { addEventListener: (type, handler) => { if (type === 'keydown') keydown = handler; } },
            getThemeTranslation: key => key,
            syncLightboxOpenState() {}, queueLightboxTransformOrigin() {},
            cycleLightboxZoom: () => counts.zoom++, closeLightbox: () => counts.close++,
        });
        vm.runInContext(textEntry + section('    function ensureLightbox() {', '    function openLightboxFromPreview('), context);
        const lightbox = new FakeElement({ open: true });
        lightbox.dataset.zoomLevel = '2';
        context.getLightbox = () => lightbox;
        context.getLightboxStage = () => null;
        context.getLightboxImage = () => null;

        context.ensureLightbox();
        assert.equal(lightbox.hasAttribute('hidden'), false, 'results-ready re-run must not hide an open lightbox');
        assert.notEqual(lightbox.getAttribute('aria-hidden'), 'true');
        assert.equal(lightbox.dataset.zoomLevel, '2', 'zoom survives streamed batches');

        const key = (name, target) => {
            let prevented = false;
            keydown({ key: name, target, preventDefault() { prevented = true; } });
            return prevented;
        };
        assert.equal(key('Enter', new FakeElement({ tag: 'button' })), false, 'Enter activates the focused close button');
        assert.equal(key(' ', new FakeElement({ tag: 'input' })), false, 'Space still types');
        assert.equal(counts.zoom, 0);
        assert.equal(key('Enter', new FakeElement()), true);
        assert.equal(counts.zoom, 1);

        const closed = new FakeElement();
        closed.dataset.lgLightboxWired = '1';
        context.getLightbox = () => closed;
        context.ensureLightbox();
        assert.equal(closed.hasAttribute('hidden'), true, 'a closed lightbox is still initialized hidden');
        assert.equal(closed.getAttribute('aria-hidden'), 'true');
    });

    test(`${theme}: favicons come from core's signed result URLs`, () => {
        class FakeImage extends FakeElement { set src(value) { this.setAttribute('src', value); } }
        const results = [{ favicon: '' }, { favicon: '/api/proxy/favicon?domain=example.com&sig=abc&s=32' }];
        const context = vm.createContext({ HTMLImageElement: FakeImage, window: { degoog: { results: { list: () => results } } } });
        vm.runInContext(section('function getCurrentResults(', 'function getResultsSearchInput('), context);
        const card = idx => {
            const img = new FakeImage({ tag: 'img' });
            img.hidden = true;
            return { img, dataset: { idx: String(idx) }, querySelector: () => img };
        };
        const signed = card(1);
        context.syncImageCardFavicon(signed, context.getCurrentResults());
        assert.equal(signed.img.getAttribute('src'), results[1].favicon);
        assert.equal(signed.img.hidden, false);
        const unsigned = card(0);
        context.syncImageCardFavicon(unsigned, context.getCurrentResults());
        assert.equal(unsigned.img.getAttribute('src'), null, 'no favicon provider: keep the placeholder hidden');
        assert.equal(unsigned.img.hidden, true);
        context.window.degoog = { results: { list() { throw new Error('not ready'); } } };
        assert.equal(context.getCurrentResults().length, 0);

        const coreFavicon = new FakeElement({ tag: 'img' });
        coreFavicon.setAttribute('src', results[1].favicon);
        const header = new FakeImage({ tag: 'img' });
        header.style.display = 'block';
        const link = { href: 'https://example.com/cat' };
        const nodes = {
            '#media-preview-info': { querySelector: () => link },
            '#mp2-favicon': header,
            '#mp2-host': new FakeElement(),
            '#media-preview-favicon-wrap img': coreFavicon,
        };
        const panel = { querySelector: selector => nodes[selector] ?? null };
        const preview = vm.createContext({ URL, tuneFavicon() {} });
        vm.runInContext(section('    function getCorePreviewFaviconSrc(', '    function tuneFavicon(') + section('    function syncMeta(', '    function isVideosTabActive('), preview);
        preview.syncMeta(panel);
        assert.equal(header.getAttribute('src'), results[1].favicon, 'preview header reuses the signed core favicon');
        nodes['#media-preview-favicon-wrap img'] = null;
        preview.syncMeta(panel);
        assert.equal(header.getAttribute('src'), null);
        assert.equal(header.style.display, 'none');
    });
}

for (const theme of ['literallygoogle', 'literallyapple']) {
    const source = await readFile(new URL(`./${theme}/scripts/search.js`, import.meta.url), 'utf8');
    const start = source.indexOf('    const TYPE_ATTR = ');
    const typeSync = source.slice(start, source.indexOf('    function init() {', start));
    const typeAttr = theme === 'literallygoogle' ? 'data-lg-search-type' : 'data-la-search-type';

    test(`${theme}: tabs core will ignore after an image-only search do not flip the layout`, () => {
        const makeTab = (type, active = false) => {
            const tab = new FakeElement();
            tab.dataset.type = type;
            if (active) tab.classList.add('active');
            tab.closest = () => tab;
            return tab;
        };
        const tabList = [makeTab('web'), makeTab('images', true), makeTab('videos')];
        let click;
        const tabs = {
            addEventListener: (type, handler, capture) => { assert.equal(capture, true); click = handler; },
            contains: () => true,
            querySelectorAll: () => tabList,
        };
        const root = new FakeElement();
        root.setAttribute(typeAttr, 'images');
        const input = { value: '' };
        let current = () => ({ query: '' });
        const window = {
            location: { search: '?type=images' },
            degoog: { results: { current: () => current() } },
            dispatchEvent() {},
        };
        const context = vm.createContext({
            window, URLSearchParams, Event: class {}, MutationObserver: class { observe() {} },
            getResultsPage: () => root, getResultsTabs: () => tabs, getResultsSearchInput: () => input,
            getActiveResultsTab: () => tabList.find(tab => tab.classList.contains('active')),
        });
        vm.runInContext(typeSync, context);
        context.bindTabsClick();
        const clickTab = type => click({ target: tabList.find(tab => tab.dataset.type === type) });

        clickTab('web');
        assert.equal(root.getAttribute(typeAttr), 'images', 'image-only search: core ignores the click, so must the theme');
        context.syncInertTabs();
        assert.deepEqual(tabList.map(tab => tab.getAttribute('aria-disabled')), ['true', null, 'true']);

        current = () => ({ query: '!w cats' });
        clickTab('web');
        assert.equal(root.getAttribute(typeAttr), 'web', 'text and bang queries still switch optimistically');
        context.syncInertTabs();
        assert.deepEqual(tabList.map(tab => tab.getAttribute('aria-disabled')), [null, null, null]);

        root.setAttribute(typeAttr, 'images');
        window.degoog = undefined;
        clickTab('videos');
        assert.equal(root.getAttribute(typeAttr), 'images', 'without the results API, an empty URL query is inert');
        window.location.search = '?q=cats&type=images';
        clickTab('videos');
        assert.equal(root.getAttribute(typeAttr), 'videos');
    });
}
