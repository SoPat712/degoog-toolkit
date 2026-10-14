import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { load } from 'cheerio';
import slot, { routes, testRenderPerson } from './index.js';

const languages = ['en', 'de', 'es', 'fr', 'it', 'pt', 'ru', 'uk', 'zh'];
async function setup(settings = {}, overrides = {}) {
  slot.configure({ apiKey: 'fixture', ...settings });
  const calls = [];
  const cache = new Map();
  await slot.init({
    apiBase: '/api/plugin/store-author-tmdb',
    template: '<div class="tmdb-result">{{content}}</div>',
    readFile: filename => readFile(new URL(filename, import.meta.url), 'utf8'),
    useCache: () => ({ get: key => cache.get(key), set: (key, value) => cache.set(key, value) }),
    fetch: async address => {
      const url = new URL(address);
      calls.push(url);
      const lang = url.searchParams.get('language');
      if (overrides.fetch) return overrides.fetch(url);
      if (url.pathname === '/3/movie/10') return Response.json({ id: 10, title: `Title ${lang}`, overview: lang === 'en-US' ? 'English fallback plot' : '', tagline: `Tag ${lang}`, runtime: 150, release_date: '2024-05-10' });
      return Response.json({ cast: [], crew: [], results: [], posters: [], backdrops: [] });
    },
  });
  return calls;
}
async function movie(lang) {
  const response = await routes.find(r => r.path === 'movie').handler(new Request(`https://example.test/api/plugin/store-author-tmdb/movie?id=10&lang=${lang}`));
  assert.equal(response.status, 200);
  return (await response.json()).html;
}

test('filmography buttons navigate locally by media type and preserve explicit external links', async () => {
  await setup();
  const $ = load(testRenderPerson({ id: 1, name: 'Actor' }, {}, { cast: [
    { id: 10, media_type: 'movie', title: 'Movie <one>' },
    { id: 20, media_type: 'tv', name: 'TV "two"' },
  ] }, 'nm123', { locale: 'de-DE', resolveTranslations: true }));
  assert.equal($('button.tmdb-film-card[data-tmdb-nav="movie"]').attr('data-tmdb-id'), '10');
  assert.equal($('button.tmdb-film-card[data-tmdb-nav="tv"]').attr('data-tmdb-id'), '20');
  assert.equal($('.tmdb-film-card[href]').length, 0);
  assert.equal($('.tmdb-film-card').first().attr('data-tmdb-name'), 'Movie <one>');
  assert.match($('[data-tmdb-services]').attr('data-tmdb-services'), /themoviedb/);
});

test('all nine route dictionaries resolve highlighted person strings and client messages', async () => {
  await setup();
  for (const locale of languages) {
    const bank = JSON.parse(await readFile(new URL(`locales/${locale}.json`, import.meta.url), 'utf8'))['plugin-tmdb'];
    const html = testRenderPerson({ id: 1, name: 'Actor', known_for_department: 'Acting', birthday: '1980-01-01', biography: 'Bio', place_of_birth: 'Berlin' }, {}, { cast: [{ id: 10, media_type: 'movie', title: 'Film' }] }, null, { locale, resolveTranslations: true });
    const $ = load(html);
    for (const key of ['knownFor', 'birthday', 'birthplace', 'biography', 'filmsTv', 'department0']) assert.ok($.text().includes(bank[key]), `${locale}: ${key}`);
    const client = JSON.parse($('[data-tmdb-i18n]').attr('data-tmdb-i18n'));
    assert.equal(client.back, bank.back);
    assert.equal(client.navigationError, bank.navigationError);
    assert.doesNotMatch(html, /\{\{\s*t:/);
  }
});

test('automatic API language follows locale; missing text falls back without replacing translated fields', async () => {
  const calls = await setup();
  const html = await movie('de-DE');
  assert.match(html, /Title de-DE/);
  assert.match(html, /English fallback plot/);
  assert.match(html, /2 Std\. 30 Min\./);
  assert.ok(calls.some(url => url.pathname === '/3/movie/10' && url.searchParams.get('language') === 'en-US'));
  const before = calls.length;
  await movie('de-DE');
  assert.equal(calls.length, before, 'same language uses cached responses');
  await movie('fr-FR');
  assert.ok(calls.slice(before).some(url => url.searchParams.get('language') === 'fr-FR'));
});

test('saved content language overrides interface language; core locale works on first render', async () => {
  const calls = await setup({ language: 'es-ES' });
  const html = await movie('de-DE');
  assert.match(html, /Title es-ES/);
  assert.match(html, /Veröffentlichungsdatum/);
  assert.ok(calls.every(url => ['es-ES', 'en-US'].includes(url.searchParams.get('language'))));
  await setup();
  const out = await slot.execute('Example movie', { locale: 'uk-UA', results: [{ url: 'https://www.themoviedb.org/movie/10' }] });
  assert.match(out.html, /Title uk-UA/);
  assert.match(out.html, /2 год 30 хв/);
});

test('invalid locale is safe and unavailable English fallback preserves localized response', async () => {
  await setup({}, { fetch: url => {
    if (url.searchParams.get('language') === 'en-US') throw new Error('offline');
    return Response.json(url.pathname === '/3/movie/10' ? { id: 10, title: 'Lokaler Titel', overview: '' } : {});
  } });
  assert.match(await movie('de-DE'), /Lokaler Titel/);
  await setup();
  assert.match(await movie('not_a_locale'), /Title en-US/);
});
