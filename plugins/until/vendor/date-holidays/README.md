# Offline holiday calendar

`index.mjs` bundles **date-holidays 3.36.1** and its runtime dependencies with
esbuild 0.25.10. It is server-only; it is not included by `script.js`.
`catalog.mjs` is a compact generated exact-name index for 206 countries,
627 calendars, and localized names/aliases. It indexes rules, not a frozen list
of this year's dates. Dates are calculated only for the selected calendar/year
and held in bounded caches (12 calendar instances, 48 year results).

The main source is https://github.com/commenthol/date-holidays .
Code licenses, the holiday data's **CC BY-SA 3.0** license, and upstream source
attributions are preserved in `LICENSES.txt`. The generated catalog and copied
Time/Places name guards are adaptations of that data under CC BY-SA 3.0.
English-name grouping, normalization, aliases, and supplemental records are our
changes; the upstream runtime is bundled but not edited.

Until's `holiday-supplement.mjs` documents additional sources and a correction to
the 2026 Mauritius Ganesh Chaturthi date. India's festival dates are not inferred
from Mauritius or Singapore. Only explicitly sourced years are added. Official
calendars sometimes list an office/court recess rather than the festival itself;
supplements use actual festival dates, not recess start dates.

## Rebuild

Create a temporary directory with `mktemp -d`, then:

```sh
npm install --prefix /absolute/temp/path --ignore-scripts --no-audit --no-fund date-holidays@3.36.1 esbuild@0.25.10
node scripts/build-holiday-vendor.mjs /absolute/temp/path
node --test plugins/until-holidays.test.mjs plugins/osm-slot/intent-regressions.test.mjs
```

The builder also refreshes the standalone Time and Places holiday-name guards
and their attribution files. Store installs each plugin independently, so these
guards intentionally do not import Until or need Until to be installed.

No catalog is exhaustive. Islamic dates can vary by moon sighting; Hebrew dates
begin on the preceding evening, so the card explicitly labels its civil-day
countdown, not an exact sunset. The plugin limits holiday years to 1970–2080;
some lunar tables and one-off regional data are narrower. Missing dates fail
closed with an unavailable message, never a Gregorian month/day extrapolation.
Review source updates periodically, especially the 2026–2027 Indian supplements.
