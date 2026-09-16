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
