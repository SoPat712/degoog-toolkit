# Plugin translations

Every Store-listed plugin supports English (`en`), German (`de`), Spanish (`es`), French (`fr`), Italian (`it`), Portuguese (`pt`), Russian (`ru`), Ukrainian (`uk`), and simplified Chinese (`zh`). The required set and completion checks live in `scripts/plugin-languages.json`.

Keep one dictionary per language in each plugin's `locales/` folder, under `plugin-<folder>`. English defines the key and interpolation-placeholder contract. Add a key to all nine dictionaries together. Translate interface labels, settings, errors, accessibility text, and client-side updates. Preserve service names, identifiers, user input, provider content, and scientific symbols. Parser examples must remain valid queries; translating the interface does not add new query syntax.

Initial plugin HTML uses degoog's `{{ t:plugin-name.key }}` tokens. JSON routes must resolve their own translations, including English fallback for individual missing keys. Client updates must use the rendered translations or core's scoped translator; never replace localized labels with hardcoded English. Use core's `context.locale`, with `context.lang` compatibility where applicable, and propagate the page language to refresh routes.

Settings dictionaries use the actual schema field keys. Core controls which settings properties are translated; keep stored enum values and API identifiers stable. Some core versions do not localize slot configuration schemas or select-option labels; the dictionaries must remain complete for hosts that support them.

TMDB defaults to following the interface language for API content. Explicit saved TMDB language selections remain overrides. Missing descriptions and biographies fall back to English. This is separate from translation of the plugin's interface labels.

Run `node --test plugins/localization.test.mjs` for catalog, placeholder, settings, and literal template-token coverage. Run the affected plugin's behavior tests and `npm test` before release. The manifest's completed list makes each finished batch enforceable while remaining plugins are migrated; it must cover every Store plugin when the migration is complete.

The optional `scripts/check-tmdb-browser.mjs` regression uses Playwright with mocked providers to check keyboard navigation, history, retry, rapid clicks, and mobile width. Run it with `node scripts/check-tmdb-browser.mjs` when Playwright is installed, or set `PLAYWRIGHT_MODULE` to the absolute path of an available Playwright module. It does not call production providers.
