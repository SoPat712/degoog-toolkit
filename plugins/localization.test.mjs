import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('scripts/plugin-languages.json', root), 'utf8'));
const store = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
test('translation manifest covers every Store-listed plugin', () => {
  assert.deepEqual([...manifest.languages].sort(), ['de', 'en', 'es', 'fr', 'it', 'pt', 'ru', 'uk', 'zh']);
  assert.equal(manifest.fallback, 'en');
  assert.deepEqual(manifest.completedPlugins.map(folder => `plugins/${folder}`).sort(), store.plugins.map(plugin => plugin.path).sort());
});
function flatten(value, prefix = '') {
  if (typeof value === 'string') return { [prefix]: value };
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Invalid translation at ${prefix}`);
  return Object.assign({}, ...Object.entries(value).map(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key)));
}
function placeholders(value) {
  return [...new Set([...value.matchAll(/(?<!\{)\{([A-Za-z][\w]*)\}(?!\})/g)].map(match => match[1]))].sort();
}
for (const folder of manifest.completedPlugins) {
  test(`${folder}: nine catalogs, settings keys, placeholders, and template tokens`, async () => {
    const entry = store.plugins.find(item => item.path === `plugins/${folder}`);
    assert.ok(entry, `${folder} must be listed in the Store`);
    const base = new URL(`${entry.path}/`, root);
    const namespace = `plugin-${folder}`;
    const catalogs = Object.fromEntries(await Promise.all(manifest.languages.map(async language => {
      const content = JSON.parse(await readFile(new URL(`locales/${language}.json`, base), 'utf8'));
      assert.ok(content[namespace], `${folder}/${language}: namespace`);
      return [language, flatten(content[namespace])];
    })));
    const english = catalogs[manifest.fallback];
    for (const [language, catalog] of Object.entries(catalogs)) {
      assert.deepEqual(Object.keys(catalog).sort(), Object.keys(english).sort(), `${folder}/${language}: keys`);
      for (const [key, value] of Object.entries(catalog)) {
        assert.ok(value.trim(), `${folder}/${language}/${key}: empty`);
        assert.deepEqual(placeholders(value), placeholders(english[key]), `${folder}/${language}/${key}: placeholders`);
      }
    }
    const module = await import(new URL('index.js', base));
    const capabilities = [...new Set([module.default, module.slot, module.command, module.plugin].filter(Boolean))];
    for (const field of capabilities.flatMap(cap => cap.settingsSchema || [])) {
      for (const property of ['label', 'description']) {
        if (field[property]) assert.ok(english[`settings.${field.key}.${property}`], `${folder}: settings.${field.key}.${property}`);
      }
    }
    for (const filename of await readdir(base)) {
      if (!/\.(?:js|html)$/.test(filename)) continue;
      const source = await readFile(new URL(filename, base), 'utf8');
      for (const match of source.matchAll(/\{\{\s*t:([\w-]+)\.([\w.]+)(?:\s*[,}]|\s+\}\})/g)) {
        if (match[1] === namespace) assert.ok(english[match[2]], `${folder}/${filename}: unknown translation ${match[2]}`);
      }
    }
  });
}
