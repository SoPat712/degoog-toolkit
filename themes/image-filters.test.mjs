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
