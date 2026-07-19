# Extension Repository Refactor Plan

## Audit baseline

- Scope: 24 plugins, 5 engines, and 2 themes.
- Automated baseline: 251 repository-owned tests pass under Node 22 after the audit fixes.
- Deployed baseline: the pre-change Store checkout on `/opt/degoog` passed 248 tests under Bun 1.3.13.
- Browser matrix: canonical triggers rendered at desktop, 768px tablet, and 390px mobile widths.
- Theme matrix: LiterallyGoogle and LiterallyApple were exercised; LiterallyGoogle was restored afterward.

The audit found three concrete regressions:

1. LiterallyGoogle's intended 50px search bar lost to degoog's 44px compatibility rule.
2. Search History used generic result classes, letting unrelated enhancers such as Breadcrumbs rewrite its rows. Its private pager also introduced a second pagination model.
3. Sports rendered ESPN score objects as `[object Object]`; its mobile scoreboard also clips long team names.

The search bar, Search History, and Sports data adapter are fixed in the audit change. LiterallyGoogle's page architecture is the first major overhaul workstream; the Sports mobile layout follows as the first plugin-card refactor target.

## Target architecture

Every extension should be a thin composition of four layers:

1. **Intent** — conservative query parsing with fixture-driven positive and negative cases.
2. **Data** — provider adapters that normalize unstable payloads into repository-owned models.
3. **Rendering** — pure HTML/model renderers with no provider-specific conditionals.
4. **Enhancement** — optional client scripts for interaction, never the initial render owner.

Themes own page rails, breakpoints, and shared control geometry. Plugins own only their card internals and plugin-scoped classes.

## Phase 0 — One-command repository testing

Deliver as one infrastructure PR.

- Add explicit package scripts instead of relying on recursive test discovery.
- Exclude `source/` and `examples/` from Store tests.
- Add syntax, manifest, version-bump, asset, and capability-contract checks.
- Add browser smoke coverage using canonical queries from `plugins/trigger-smoke.test.mjs`.
- Record geometry and console errors at 390×844, 768×1024, 1069×681, and 1440×900.
- Run under Node and Bun in CI.

Exit criteria:

- One documented command runs only this repository's tests.
- CI fails on an unregistered folder, missing `isClientExposed`, stale version, invalid entrypoint, or body-level horizontal overflow.
- No test command enters `source/` or `examples/`.

## Phase 1 — LiterallyGoogle architecture and layout overhaul

Treat LiterallyGoogle as a first-class product surface, delivered in focused theme PRs rather than folded into incidental plugin fixes.

- Establish one primary results rail shared by tabs, Filter, status/spell-check, Web results, command status, and pagination. Keep the sidebar a secondary content rail only.
- Tokenize search/header geometry and defend it against degoog compatibility selectors; verify the home and results search shells match at every breakpoint.
- Make Web, media, full-width-slot, command, settings, admin, and Store surfaces explicit layout states with documented ownership and transitions.
- Decompose the 7,000-line stylesheet by surface and split the 5,000-line search behavior bundle into bounded modules without changing Store paths or runtime entrypoints.
- Remove obsolete selectors and runtime layout variables only after fixture-backed proof that no supported state consumes them.
- Standardize desktop/tablet/mobile gutters, control heights, touch targets, focus rings, overflow ownership, and sticky offsets.
- Add deterministic fixture pages and visual snapshots for light/dark mode at 390×844, 768×1024, 1069×681, and 1440×900.

The first implementation slice ships with this audit: a named 50px search-shell token plus primary-rail alignment for tabs, Filter, spell-check, and result status text. Filter and metadata no longer float at the sidebar edge.

Exit criteria:

- Every page-level control has an explicit rail owner documented in `themes/literallygoogle/design.md`.
- Home/results search shells, sticky header, tabs, Filter, metadata, content, and pagination stay aligned through all four standard viewports.
- Command pages hide irrelevant Web controls and use one full-width command canvas.
- Full-width plugin cards have one frame, no page overflow, and no theme-specific plugin selectors.
- Theme behavior modules can be tested independently and no monolithic file grows during the migration.

## Phase 2 — Shared UI contracts

Deliver as two PRs: theme rails first, plugin primitives second.

- Define shared tokens for card padding, control height, radius, type scale, focus rings, and responsive gaps.
- Formalize full-width, standard above-results, and knowledge-panel card shapes.
- Require self-contained cards to return `title: ""` and render titles internally.
- Require command pages to use `command-result` so themes hide irrelevant filters and align content.
- Ban generic result classes inside plugins unless intentional interoperability is documented.
- Create reusable pill-button, tab-rail, scroller, empty/error, and mobile-stack recipes.

Exit criteria:

- Both themes share breakpoint and rail behavior while preserving visual identity.
- Plugin roots never create a second panel frame.
- Filters, stats, titles, and content use a deliberate rail at every viewport.
- Interactive controls expose visible keyboard focus and use 44px touch targets where space permits.

## Phase 3 — Runtime and provider boundaries

Deliver provider-focused PRs rather than one repository-wide rewrite.

- Extract shared escaping, JSON response, route URL, timeout, cache, and error-card helpers.
- Add adapters for ESPN, TMDB, HERE/Nominatim, Yahoo/Stooq, weather, currency, and translation payloads.
- Make renderers consume normalized primitives only.
- Add malformed, missing, and changed-field fixtures for every adapter.
- Standardize route caching, abort/timeout behavior, and failure states.

Exit criteria:

- External payload objects cannot reach HTML interpolation directly.
- Every adapter has success, partial-data, and failure fixtures.
- Network failures create a scoped friendly state or cleanly suppress the plugin without console errors.

## Phase 4 — Plugin risk waves

### Wave A: large external-data cards

Sports, Places, TMDB, Stocks, Weather, and Currency.

- Split large entrypoints into intent, provider, model, and renderer modules.
- Redesign the Sports scoreboard so names, marks, scores, and metadata cannot collide at 320–390px.
- Preserve intentional internal scrollers for charts, maps, cast rails, and tables while preventing page overflow.

### Wave B: text and conversion utilities

Translate, Dictionary, Unit Converter, Calculator, Color Translator, Tip Calculator, Time, Until, and Timer/Stopwatch.

- Unify input/output rows, copy affordances, validation, keyboard behavior, and number formatting.
- Keep parsers independently testable and preserve cross-plugin negative cases.

### Wave C: interactive toys

Metronome, Minesweeper, Snake, Tic-Tac-Toe, Periodic Table, and Undecideds.

- Standardize cleanup for timers, animation frames, audio contexts, and global listeners.
- Add reduced-motion behavior and pause detached or hidden cards.
- Verify touch, keyboard, resize, reset, and repeated-mount behavior.

### Wave D: search-bar integrations

Search History, Auto Bang, and Speedtest.

- Establish one autocomplete ownership protocol so history, bangs, and provider suggestions cannot race.
- Add Enter, Escape, ArrowUp/ArrowDown, delete, focus/blur, and empty-state browser tests.
- Preserve built-in Speedtest collision coverage for `!speed` and the `speedtest` alias.

Exit criteria for every wave:

- Canonical queries render without console errors in both themes.
- Known cross-plugin queries do not false-trigger.
- No body-level horizontal overflow at the four standard viewports.
- Repeated navigation and remounting do not duplicate listeners or observers.

## Phase 5 — Visual regression and release discipline

- Build a deterministic fixture gallery without live-provider variance.
- Capture light/dark snapshots for both themes at every standard viewport.
- Cover open menus, selected tabs, failures, empty states, and long localized strings.
- Require semantic version bumps and generate a release checklist from the diff.
- Add a deployment smoke command that compares installed versions with the manifest and reruns canonical queries.

Exit criteria:

- Visual changes are reviewable as image diffs.
- Each changed extension has a version bump, focused tests, and a browser smoke result.
- The deployed Store checkout is verified without running unrelated degoog core tests.

## Recommended PR order

1. Test scripts and CI scoping.
2. LiterallyGoogle primary rail and search/header geometry.
3. LiterallyGoogle fixture gallery plus stylesheet/script decomposition seams.
4. Cross-theme UI primitives and contract tests.
5. Sports provider adapter and mobile scoreboard redesign.
6. Search-bar ownership protocol for History and Auto Bang.
7. Shared provider/runtime helpers.
8. Wave A provider-card migrations.
9. Wave B utility migrations.
10. Wave C lifecycle and accessibility migrations.
11. Release/deployment verification tooling.

Avoid a single repository-wide rewrite. Every PR must preserve Store paths and IDs and leave installed extensions usable.
