import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { slot, routes } from './index.js';
const langs = ['en','de','es','fr','it','pt','ru','uk','zh'];
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const flatten = (obj, prefix = '') => Object.entries(obj).flatMap(([key, value]) => typeof value === 'object' ? flatten(value, prefix + key + '.') : [prefix + key]).sort();
test('Sports catalogs have matching keys and cover every settings field', async () => {
  const banks = await Promise.all(langs.map(async lang => JSON.parse(await read(`locales/${lang}.json`))['plugin-sports-slot']));
  for (const bank of banks) {
    assert.deepEqual(flatten(bank), flatten(banks[0]));
    for (const field of slot.settingsSchema) {
      assert.ok(bank.settings[field.key].label);
      if (field.description) assert.ok(bank.settings[field.key].description);
    }
  }
});
test('Sports isolates concurrent request locales and refresh cache languages', async () => {
  await slot.init({ apiBase: '/api/plugin/test-sports', readFile: read, fetch: async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    throw new Error('mock provider unavailable');
  }});
  slot.configure({ useEspnApi: true });
  const [de, fr] = await Promise.all([
    slot.execute('arsenal score', { locale: 'de', lang: 'en' }),
    slot.execute('arsenal score', { locale: 'fr' }),
  ]);
  assert.match(de.html, /Keine Daten/);
  assert.match(fr.html, /Aucune donnée/);
  assert.doesNotMatch(de.html, /Aucune donnée/);
  const refresh = routes.find(route => route.path === 'refresh');
  for (const [lang, expected] of [['de', 'Keine Daten'], ['fr', 'Aucune donnée'], ['de', 'Keine Daten']]) {
    const response = await refresh.handler(new Request(`https://example.test/api/plugin/test-sports/refresh?query=arsenal%20score&lang=${lang}`));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.html.includes(expected));
  }
  const script = await read('script.js');
  assert.match(script, /params.set\("lang", panel.dataset.sportsLang/);
});
