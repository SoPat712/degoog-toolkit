# LiterallyGoogle Design System

Authoritative reference for colors, radii, layout, and component styling in this theme. Derived from `style.css`, `4play.css`, and the reference snapshots in `examples/Settings – degoog.html` and `examples/serversettings – degoog.html`.

The theme requires degoog 0.24 or newer for its native full-width slot container.

This theme should feel like modern Google Search — a little denser and cleaner for self-hosted use. New work should follow these rules before adding one-off tweaks.

## Typography

| Role | Value |
| --- | --- |
| UI font | `"Google Sans", sans-serif` |
| Monospace | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` |
| Section headings | Normal weight, no forced uppercase |
| Secondary labels | `var(--text-secondary)` — dark `#9aa0a6`, light `#70757a`; typically `0.8125rem` |
| Body / toggle labels | `0.875rem`, `var(--text-primary)` |

Primary actions and labels should be calm and direct. Do not overuse uppercase, letter spacing, or heavy font weights.

## Border radius scale

Defined on `:root` as `--theme-radius-*`:

| Token | Value | Use |
| --- | --- | --- |
| `--theme-radius-xs` | `4px` | Inner row seams inside stacked lists |
| `--theme-radius-sm` | `8px` | Generic buttons (results page), small controls |
| `--theme-radius-md` | `12px` | Glance boxes, compact cards |
| `--theme-radius-lg` | `16px` | Sidebar panels, drawers, result cards |
| `--theme-radius-xl` | `20px` | Stacked list outer corners (first/last row) |
| `--theme-radius-search` | `24px` | Search bars, store update panels |
| `--theme-radius-pill` | `999px` | Pills, chips, settings buttons, selects |

### Stacked list radius pattern (settings, store, engine lists)

Rows inside `.ext-cards`, `.settings-toggle-grid`, or `.store-updates-body` use a **2px gap** stack:

1. Each row: `--theme-radius-xs` (`4px`) on all corners by default.
2. First row: top corners `--theme-radius-xl` (`20px`).
3. Last row: bottom corners `--theme-radius-xl` (`20px`).
4. Single-row lists: full `--theme-radius-xl` pill-like block.

Expanded accordion tops can step down from `16px` outer corners to `4px` inner seams when the body opens. Do not mix ad-hoc values like `25px` or `100px` for these stacks.

## Color palette

Semantic tokens are set on `:root` (dark default), `[data-theme="dark"]`, `[data-theme="light"]`, and `@media (prefers-color-scheme: light)`.

### Dark mode

| Token | Value | When to use |
| --- | --- | --- |
| `--bg` | `#1f1f1f` | Page canvas, nested inset surfaces (store update rows) |
| `--bg-light` | `#303134` | **List rows**, panels, cards, inputs, preset/theme selects |
| `--bg-hover` | `#3c4043` | Hover states only — **never** list row or select fill |
| `--border` | `#5f6368` | Control outlines |
| `--border-light` | `#444746` | Subtle dividers |
| `--text-primary` | `#e8eaed` | Labels, titles |
| `--text-secondary` | `#9aa0a6` | Descriptions, metadata (Google's dark secondary; about 5:1 on `#303134` cards) |
| `--text-link` | `#99c3ff` | Links (e.g. spell-check “Search instead”) |
| `--primary` | `#4285f4` | Primary actions, focus rings |
| `--btn-bg` | `#303134` | Filled secondary buttons, select fills |
| `--btn-text` | `#e8eaed` | Secondary button and chip labels |
| `--search-bar-bg` | `#4d5156` | Search shells, nav filter fields |
| `--search-bar-focused` | `#303134` | Focused search/select shell |

### Light mode

| Token | Value | When to use |
| --- | --- | --- |
| `--bg` | `#fff` | Page canvas |
| `--bg-light` | `#f7f8fa` | Panels, cards |
| `--bg-hover` | `#e8eaed` | Hover states |
| `--border` | `#dadce0` | Control outlines |
| `--text-primary` | `#202124` | Labels, titles |
| `--text-secondary` | `#70757a` | Descriptions, metadata |
| `--text-link` | `#1a0dab` | Links |
| `--btn-bg` | `#f8f9fa` | Filled secondary buttons |
| `--btn-text` | `#3c4043` | Secondary button labels |
| `--search-bar-bg` | `#ebebeb` | Search shells |
| `--search-bar-focused` | `white` | Focused search shell |

### Settings-specific tokens

| Token | Dark | Light | When to use |
| --- | --- | --- | --- |
| `--lg-settings-row-bg` | `var(--bg-light)` → `#303134` | `white` | Engine/plugin rows, toggle rows |
| `--lg-settings-chip-btn-bg` | `#282a2c` | — | Configure / Apply pill on a row |
| `--lg-settings-chip-btn-bg-light` | — | `#d5dff0` | Configure / Apply in light mode |
| `--lg-settings-select-light` | — | `#dde3ea` | Theme / preset `<select>` fill |
| `--lg-settings-select-light-hover` | — | `#ced3da` | Theme / preset hover |
| `--lg-settings-page-bg-light` | — | `#f0f4f9` | Settings page body |
| `--lg-settings-apps-pocket-bg` | — | `#e9eef6` | Apps pocket panel |

### Surface color rationale (`#303134`, `#3c4043`, `#37393b`)

| Hex | Role |
| --- | --- |
| `#303134` | Canonical dark list row, panel, button, and **preset/theme select** fill (`--bg-light` / `--btn-bg` dark) |
| `#3c4043` | Hover only (`--bg-hover` dark) — slightly lighter than `#303134` |
| `#282a2c` | Dark chip button on a row (`--lg-settings-chip-btn-bg`) — darker inset on a row |
| `#37393b` | **Legacy** hard-code from older LiterallyGoogle snapshots — do **not** use; replaced by `#303134` via `--lg-settings-row-bg` |
| `#3d4041` | **Not used** in this theme. Closest legitimate neighbors are `#3c4043` (hover) and `#303134` (row fill). If you see `#3d4041` in a mockup, map it to the correct token above. |

**Rule:** list rows and settings selects in dark mode both resolve to `#303134` through `var(--lg-settings-row-bg)` or `var(--btn-bg)`. Hover uses `var(--bg-hover)` (`#3c4043`). Never substitute hover gray for row/select fill.

## Layout

- Web results stay left-aligned with a stable content gutter. Do not invent new horizontal offsets for individual widgets.
- The results logo, tabs and Web results share one left edge, `--literallygoogle-results-content-inline-base`, as on Google's results page; the search bar follows the logo. The edge is `clamp(1.25rem, 9vw, …)`, matching Google's 96px at a ~1070px window, and stops growing where the search bar used to start (about 182px), so results never sit further right than they did. `#results-header` pads its start by the same token on every tab, so the header does not move when switching to Images.
- Tabs and Web results share the same starting gutter. On wide screens, tabs can use the space across both columns before Filter; Filter and result status align with the sidebar's right edge. Spell-check stays with the main results.
- Media layouts use the tighter media gutter already defined in the theme. Image and video views should feel compact and edge-aligned.
- Desktop side content should read as a rail of stacked cards, not floating boxes with mixed spacing.
- Mobile panels should become drawers or stacked blocks. Do not keep desktop popovers on phone widths when the content is important.

### Results layout states

The Web tab has **two layout states** keyed off a single 768px breakpoint.

| State | Viewport | `#results-page` markers | Layout |
| --- | --- | --- | --- |
| **Two-column** | ≥1024px | Fluid vars set inline | CSS grid: main column + sidebar column (`grid-template-columns: var(--lg-results-grid-columns)`). Sidebar sticky. |
| **Tablet single-column** | 768–1023px | No fluid vars | Flex column aligned to the desktop content rail and capped at the desktop main width (`48rem`) so lines stay readable. The tabs grid and the meta row use the same cap, so Filter and the results count end on the column's edge. Sidebar order below. |
| **Mobile single-column** | <768px | No fluid vars | Core mobile single-column with compact gutters. No sticky sidebar. Sidebar order below. |

**Sidebar order in single column (<1024px, both themes):** `#sidebar-col`, its `.sticky` wrapper and `#results-sidebar` get `display: contents`, so each sidebar panel is its own item in the `#results-layout` column. The knowledge panel (`.lg-sidebar-knowledge`) comes first, as Google shows the entity card at the top on phones; Engine Performance, People also search for and the above/below-sidebar slots follow the results (after pagination) instead of pushing them down. Core's own mobile CSS puts the whole sidebar first; do not go back to `order: -1` on `#sidebar-col`.

**RTL:** the two-column grid mirrors by itself under `dir="rtl"`; never swap `grid-column` for RTL (that put the results in the narrow column). The fluid column JS measures toward the edge the layout grows into (`rect.right` in RTL). The logo and the pager's "degooog" letters are `direction: ltr; unicode-bidi: isolate` so the wordmark never reads backwards; the pager's Prev/Next still follow the page direction.

**LiterallyApple tablets:** the start gutter is `clamp(1.25rem, 9vw, …)` like this theme's instead of its fixed desktop offset (148.5px), and `--literallyapple-results-rail-inline-size` is defined on `#results-page` like ours.

Below the two-column minimum (1024px), the Web layout uses a single flex column. The 768–1023px tablet band preserves the desktop content-rail alignment without the legacy grid/class machinery; below 768px compact mobile gutters take over. Images and bang-command pages keep their specialized full-width layouts. Videos render as a web-style list in core, so they use the Web grid, fluid columns and the full sidebar (Engine Performance, retry links, related searches, sidebar slots); never hide `#sidebar-col` for the Videos tab.

### Centered mode (`#results-page.centered-mode`)

Core's Settings toggle adds `.centered-mode`. Instead of core's 64.5rem column, the theme centers the page block: `--literallygoogle-results-content-inline-start` becomes `max(base, (100vw − --literallygoogle-results-page-max) / 2)`, where `--literallygoogle-results-page-max` is the block from the logo edge to the sidebar's end (main column + gap + sidebar column) at the widest column sizes. It is resolved on `:root` so the fluid-column JS cannot feed back into it. Every rail reads the start token, so internal alignment never changes. The header starts at the same token and keeps its icons at the viewport's end (1.25rem), as in Google's centered results test, where the content block has equal margins and the header icons stay at the far right. Until the viewport is wider than the block plus its normal edge, the layout is identical to normal mode. Images and bang-command pages keep their full-width layout and normal header padding.

### Web two-column shrink order (≥1024px)

On the Web tab, `scripts/search.js` sets fluid `--literallygoogle-results-sidebar-max` and `--literallygoogle-results-main-col-max` on `#results-page`. The fluid logic only runs ≥1024px (where the two-column grid is active); below that threshold (or any non-web/command/media case) fluid vars are cleared and single-column CSS owns the layout.

1. **Wide:** sidebar panel `calc(21rem + 5px)`, main column up to `48rem`.
2. **Tighten:** shrink the **sidebar first** from max down to `calc(17rem + 5px)` while main stays at `48rem`.
3. **Tighter:** sidebar holds at `17rem`; main column (glance, URLs, results) shrinks below `48rem`.

**Viewport fit:** fluid column **sizes** are computed from `min(layout inner width, viewport width)` so the sidebar's right edge never extends past the viewport when the window is narrowed. The sidebar shrinks fluidly (21rem → 17rem) before the main column gives way; do not lock the sidebar at 21rem.

JS sets fixed fluid column values so CSS grid cannot shrink the main column before the sidebar. `--literallygoogle-results-rail-inline-size` is defined on `#results-page` (not `:root`) so it follows the runtime main-column override and remains the shared geometry contract for Web chrome. Layout sync runs on **resize**, **degoog-results-ready**, and **search-type** changes only — not on every subtree mutation.

### Results tabs row (`#results-tabs`)

- `#results-tabs` stays **full width** so its `border-bottom` spans edge to edge of the viewport (it is deliberately NOT included in the shrink-to-fit container block that constrains `#results-meta` / `#results-layout`).
- **Labels on the edge:** as on Google, each tab's underline spans just its label (tabs have no inline padding; `1rem` margins keep the spacing and a `::after` keeps the hit area across the gap and carries the focus ring), and the first tab has no start margin, so the "Web" label sits on the shared logo/results edge. On phones `#results-tabs` starts at `0.75rem`, the results' edge; the search bar keeps its own gutter. LiterallyApple's pill tabs start the scroll rail at `0.75rem` on phones.
- **Desktop (≥768px):** `#results-tabs` starts at the result-content gutter. Tablets use one column; at ≥1024px the tab rail spans both result columns so it can use the otherwise empty space before Filter. Filter remains right-aligned, and the rail reserves `6.5rem` when it is visible. The Filters button keeps a stable `500` weight when open.
- **Mobile (<768px):** the grid is removed. `syncTabsRail()` in `scripts/search.js` mounts the scroll rail and appends Filter as the **last item in the scroll list**. Filter is non-sticky and scrolls with the tabs.
- **All widths:** enabled edge arrows are visible whenever the list overflows. The previous arrow disappears at the beginning, the next arrow disappears at the end, and both disappear when everything fits. The scroll list fades out (`mask-image`) under an enabled arrow, and a tapped item (More, Filter) scrolls into view clear of the arrows (`scroll-padding-inline`). Inactive tabs show a gray underline on keyboard focus, and on hover only under `@media (hover: hover)` so a tap does not leave it behind; the active underline retains its selected color without changing geometry.
- The rail is mounted at **all** widths (it owns the scroll container and the grid grouping); the difference is just what lives inside the scroll and whether the arrows are visible.
- Images/Videos (`media-mode`) and bang-command pages are exempt from the grid — `#results-tabs` keeps its full-width flex layout there.
- **Four tabs plus More.** The rail wraps core's tabs in `.lg-results-tabs__list` (the `role=tablist` owner), followed by the `#lg-tabs-more` menu button. The first four tabs stay in the row: the saved tab order when one exists (`/api/settings/tab-order`; core already applied it to the DOM), else Web, Images, Videos and News, topped up in DOM order. An active tab from the rest gets `.lg-tab-extra` (CSS `order: 1`, after the four). A lone extra tab is shown instead of a one-item menu. Folded tabs get `.lg-tab-overflow`: visually hidden but **not** `display: none`, so core's tab shortcuts (which skip `display: none`) still cycle through them; arrows skip them. The menu (`#lg-tabs-more-menu`, on `<body>`) mirrors labels and `aria-disabled`, and activating an item clicks the original tab so core's handler runs.
- **Tab labels.** Core only capitalises engine types. `tab:engine:` tabs whose text is still that default get theme labels (it → IT, repos → Repos, file → Files, music → Music, science → Science); translated or plugin-named tabs are left alone.

### Removed: desktop stack band (`lg-results-layout-single`)

A previous version of this theme had a third layout state — a "desktop stack band" at ~768–990px that used `display: contents` on `#results-main` plus a `grid-template-areas` stack. It was removed because long unbroken result URLs overflowed the main grid cell during the 990↔1070px hysteresis transitions, the band had no sticky sidebar / full-bleed results (violating the stable-content-gutter rule), and the 80px hysteresis band could leave a two-column grid active at ~791px producing smushed columns. The `lg-results-layout-single` class no longer exists — do not re-add it. Below 768px the layout now falls straight to mobile single-column.

### Results meta row (`#results-meta`)

- The meta row is a **shared skeleton** across Web, Images, and Videos. Keep its horizontal alignment rules **simple and global**.
- **Web (desktop, two-column ≥768px):** `#results-meta` is a flex row whose right edge is `content start + --literallygoogle-results-rail-inline-size`. Spell-check and engine chrome sit at the rail start; `.results-meta-stats` uses `margin-inline-start: auto` at the rail end. This keeps simultaneous items from overlapping and prevents status text from floating over the sidebar.
- **Web (single-column <768px):** stats span the row with `text-align: end` via the baseline flex layout.
- Default padding uses `--literallygoogle-results-content-inline-*` like the tabs row; spell-check and engine chrome stay in column 1 on two-column Web.
- **Results count in the tabs row (Web, ≥1024px):** pure CSS, no script. `#results-meta` is `position: relative` and `.results-meta-stats` is lifted out of it with `position: absolute; bottom: calc(100% + 1px)` (LiterallyApple: `100%`, no tabs border) and the tabs row height (`2.75rem`; LiterallyApple `2.3125rem`) as a centered flex line, so it sits in the tabs row, vertically centered with the tab labels and right-aligned `5.75rem` (LiterallyApple `5.5rem`) from the sidebar edge, just clear of Filter. When core hides Filter while the filters panel is pinned (`#tools-bar[style*="none"]`) it ends the row instead. Core keeps writing the count into the same node, so streaming updates, new searches and clears need nothing extra. With no spell-check notice or engine chrome the meta row keeps only its top padding; a notice stays in the meta row as before. Below 1024px, on Images (the Sources pill shows the status and the meta row stays hidden) and on command pages the meta row is unchanged.
- **Images:** while the Sources pill owns the status (`.lg-media-engine-pills-ready`), `#results-meta` is hidden and core's status text ("About N results (X seconds)") is shown in the Sources panel header instead. The pill holds that role for the whole search: between search start and the first engine it reads "Searching…", so the meta row never shows and then collapses above a filled grid (that collapse moved the grid up ~41px on every image search). Without engine rows (the visitor turned Engine Performance off, read from core's IndexedDB prefs with the instance default as the first guess) the meta row stays, and a settled search with no rows drops the pill.
- **No results:** "About 0 results" is hidden (`#results-page:has(#results-list > .no-results)`); the no-results message says it already.
- If you need media-specific chrome (filters, spell-check), prefer **separate elements inside `#results-meta`** instead of redefining paddings or widths on `#results-meta` itself.
- When adjusting Images/Videos behavior, verify that the **right edge of the stats text** stays aligned with the layout rail at common widths (preview open and closed).

### Images Sources pill (`#lg-image-sources-pill`)

Images show one pill instead of an engine row: "7 sources · 1 failed" (the failure part only when something failed). Desktop: the end of the tabs row. Phones: the last item of the scrolling tab list, where Filter sits on other tabs. The related-search chips are the only row above the grid.

| Part | Detail |
| --- | --- |
| Data | Core's own Engine Performance rows in `#image-engine-panel` (name, "N results · Xms", failure tooltip, retry link). The panel re-renders from the same observer while engines stream in. |
| Panel | `#lg-image-sources-panel` on `<body>` (`role=dialog`): status text, engines that returned images with count and time, failed engines with Retry, engines with no images folded into one expandable row, and an Engine settings link. Desktop: anchored under the pill. Phones: bottom sheet with `#lg-sheet-scrim`. |
| Filter | Checkboxes drive the existing `data-lg-engine-filter`. Unticking from "all" keeps the others; the last checked source cannot be unticked; ticking every source clears the filter. Sources that answer after a filter was chosen join it. |
| Retry | Clicks core's `.engine-retry-link`, so core runs the request and re-renders its rows. |
| Keyboard | The pill is a button with `aria-expanded`. Opening focuses the panel; Escape closes and returns to the pill; tabbing out of either end closes and returns to the pill. |

### Engine filter + pagination

Selecting an engine (Sources checkboxes or sidebar stat row) sets `data-lg-engine-filter` on `#results-page` and hides non-matching cards via `.lg-engine-filtered-out`.

When the filter **changes** and at least one engine remains selected, the theme dispatches `lg-engine-filter-change`:

- **Web client pagination:** reset to page 1 and rebuild the pager from the filtered set.
- **Server pagination (Images, etc.):** navigate to page 1 if URL or pager shows page &gt; 1; filter re-applies on `degoog-results-ready`.

Clearing all engine filters does **not** reset the page (user keeps their place).

**Pager on phones:** in the narrow pager container (≤34rem) page numbers keep a `1.5rem` (24px) pitch so each is a full tap target, and when only Next (page 1) or only Previous (last page) is left it spans the middle two columns, centered under the wordmark. `#results-page` ends with `2.5rem` plus the safe-area inset of room under the last block (the pager, or the sidebar panels that follow it in one column).

## List styles

### Settings / store / engine rows

```css
background: var(--lg-settings-row-bg);  /* #303134 dark, white light */
padding: 17px;
border: none;
border-radius: var(--theme-radius-xs);  /* stack rules adjust corners */
gap: 2px;  /* between stacked rows */
```

| State | Dark | Light |
| --- | --- | --- |
| Default | `--lg-settings-row-bg` (`#303134`) | `#ffffff` on `.ext-card`, `.store-card`, and `.store-repo-detail` only — not `.store-repos-section` (transparent section, same as dark). Do not use `--bg-light` (`#f7f8fa`) on light-mode card surfaces |
| Hover (nav items) | `--bg-hover` (`#3c4043`) | `--bg-hover` (`#e8eaed`) |
| Active nav item | default hover | `white`, no border/shadow |
| Selected / active (filters) | Blue-tinted `--lg-selection-active-bg` + inset ring | same |

### Store update rows

Use `var(--bg)` (page inset), not `--bg-light`, when nested inside the updates panel.

### Store catalog filter bar (light mode only)

`.store-search-input`, extension-tab `.store-filter-bar > .degoog-search-bar--square-advanced`, and `.store-filter-select` use the same white search shell as settings extension search: `background: var(--bg)` (`#ffffff`), `border: 1px solid var(--border)`, `box-shadow: var(--lg-search-shadow)`. Dark mode keeps core tokens (`--search-bar-bg`, `--bg-light`) — do not add `:root:not([data-theme="dark"])` rules without a `prefers-color-scheme: light` guard.

### Indexer tab

Indexer **forms** stay flat: section fieldsets with pill/rounded inputs only — do not wrap filters, storage limits, or toggles in stacked row panels like Server/General.

**Toggle rows** inside `.settings-fieldset-inverse` (public export, prune, fuzzy recall) use the same filled pill row as Server settings: `display: flex`, `row-reverse`, `17px` padding, `--theme-radius-xl`, white/`--lg-settings-row-bg` fill. Helper `.settings-desc` lines sit directly under their toggle with tight spacing — not inside the row.

**Index stats** (`#indexer-stats-wrap` only): summary metrics use a compact bordered pill-table (label column + right-aligned values); per-type counts use lowercase chips in a flex wrap. Do not apply stats chrome to `#indexer-storage-wrap` (core shares `degoog-indexer-stats` class name).

### Server / General settings inputs (not Indexer tab)

Core `.settings-fieldset-inverse` paints nested inset panels (`background: var(--bg)`, padding). On Server/General tabs, flatten those blocks — no extra panel chrome; only toggle rows use the stacked white row fill.

Inputs and textareas in `.settings-section` (except `#indexer-tab-section`) match the Indexer tab pattern: pill single-line fields (`--theme-radius-pill`), `--theme-radius-lg` textareas, bordered shells, `#ffffff` background in light mode. Do not override `.degoog-btn` radius — settings buttons stay pill-shaped per the button table below.

## Button styles

| Variant | Dark | Light | Notes |
| --- | --- | --- | --- |
| Primary (`.btn--primary`) | `var(--primary)` bg, white text | same | Pill on settings page |
| Secondary (`.settings-page`) | `var(--btn-bg)` / `var(--btn-text)` | `var(--btn-bg)` / `var(--btn-text)` | Filled pill with border — matches reference snapshots |
| Secondary hover | `var(--bg-hover)` / `var(--text-primary)` | same | |
| Configure / Apply chip | `--lg-settings-chip-btn-bg` | `--lg-settings-chip-btn-bg-light` | Neutral text, not blue |
| Results generic `.btn` | core defaults | core defaults | `1px solid var(--border)`, `--theme-radius-sm` |
| Links in copy | `var(--text-link)` | `var(--text-link)` | Blue — e.g. spell-check “Search instead for …” |

**Blue text is for links and primary actions only.** Settings secondary buttons, Configure/Apply chips, and preset controls use neutral `var(--btn-text)` / `var(--text-primary)`.

**Regression note:** commit `9f54156` briefly made global `.btn--secondary` transparent with `color: var(--primary)`. That was wrong for settings. The fix scopes filled secondary styling to `.settings-page` and leaves core degoog neutral secondary styling everywhere else (`color: var(--text-secondary)` per bundled core CSS).

**Never** make settings secondary buttons transparent with blue text.

## Inputs and selects

| Control | Dark | Light | Radius |
| --- | --- | --- | --- |
| `.theme-select`, `.settings-server-preset-select` | `var(--btn-bg)` → `#303134`; hover `var(--bg-hover)` | `--lg-settings-select-light` / `-hover` | pill |
| Settings search fields | `var(--search-bar-bg)` shell | `var(--bg)` shell with search shadow | pill |
| Core `.degoog-input` (generic) | `var(--bg-light)` | same | `0.375rem` (core) |

Preset dropdowns and theme selectors share the same fill tokens as list rows in dark mode (`#303134`), not the lighter search-bar gray (`#4d5156`).

## Controls (general)

- Small controls should look like pills, not square buttons.
- Default pattern: quiet surface, subtle border, rounded shape, stronger text on hover.
- Prefer inline SVG over icon fonts for theme-authored controls.
- Active rows and selected options use the existing blue-tinted selection background and inset ring.

## Highlight / focus / active

- Focus rings: `outline: 2px solid var(--primary)` with offset where core defines it.
- Result keyboard focus (Tab or core's result-up/down shortcuts): the whole `.result-item` gets a rounded `--theme-radius-lg` ring via `:has(a.result-title:focus-visible)`; only the focused row trades negative margin for padding so nothing shifts. Browsers without `:has()` keep a ring on the title itself.
- Results tabs are a roving-tabindex tab list (`role=tab`, `aria-selected` mirrors core's `.active`, arrows/Home/End move, Enter/Space dispatch core's click). Plugin tabs added later are picked up by the same observer.
- More is a menu button after the tab list: Arrow Down/Up open it on the first/last item, arrows/Home/End move inside, Enter/Space click the original tab (focus then follows to that tab, which core blurs on search), Escape returns to More, Tab closes.
- Toggle switches: inset `box-shadow` ring on track, not border (avoids knob gap).
- Filter / sidebar selection: `--lg-selection-accent` blue tint + `--lg-selection-active-ring`.
- Links: `var(--text-link)`; visited `var(--text-link-visited)`.

## Spell-check (theme behavior)

The official spell-check plugin (`examples/official-extensions/plugins/spell-check/`) uses:

- An **interceptor** that corrects queries via Yandex Speller (all search types at the server).
- An **at-a-glance slot** that renders `.spell-check-notice` when a correction was applied.

Theme JS (`scripts/search.js`) hoists the notice into `#results-meta` **only on the Web tab** (`getActiveSearchType() === "web"`). On Images, Videos, or News tabs the theme clears any hoisted notice. The “Search instead for …” link inside the notice correctly uses `var(--text-link)` (blue).

## Sticky behavior

- `#results-header`: `position: sticky; top: 0` from 768px (it scrolls with the page on phones), `z-index: 120`, `background: var(--bg)`; `.scrolled` adds the bottom border.
- Image filter control: one fixed surface expands from a 56px circle to its content height in 320ms. See **FAB (image filters)** below.
- Media preview panel: docked beside the grid only from 1000px. Below that it is a bottom sheet (`position: fixed`, full width, `--mp2-panel-width: 100vw`), as on phones; core docks from 768px, so the 768–999px band puts its sheet geometry back. A docked panel there left the grid three ~80px columns. The image Filter button hides while the sheet is open.
- Media preview panel (desktop docked, ≥1000px): `position: sticky`; outer shell `overflow: hidden` with full `border-radius`; scroll on `.mp2-body` so the scrollbar stays inside the rounded card. Panel width stays at CSS `--mp2-panel-width: min(30rem, calc(100vw - 2rem))` — do not shrink it dynamically to the grid gap.

## Scrolling

### Streaming interaction

- Each native SSE `engine-result` handler runs inside a synchronous results-list layout batch. Core 0.26 reads column heights for every image insertion; temporarily suppressing intermediate list layout avoids repeated page reflow. The original display value/priority is restored in `finally` before returning to the event loop, including error paths. This never waits for the remaining engines or changes engine results/timeouts.
- That batch hooks `EventSource`, which core used up to 1.1.0. From 1.1.1 core streams over `fetch` (`FetchEventStream`), so the hook (and the engine-source learner beside it) never runs there. On those cores the Images tab rebuilt every card on each engine (about 4,000 card removals and 4,500 forced layouts for one search); the fix belongs in core's `streamImageGrid`, which keeps cards a visitor has seen in place and appends the rest. Do not try to recover the old hook by patching `EventTarget.prototype.dispatchEvent`: hiding the list during a batch would also blind core's on-screen check.
- `data-lg-stream-render-ms` on the results page records the most recent native batch plus its final layout for live diagnostics.
- Engine Performance toggles are owned once, in capture, because core's streaming and sidebar-suggestion wiring can both attach click handlers. Manual open/closed choice is kept on the sidebar root through streamed and final panel replacement and reset for a new search.
- Engine-row click delegation is document-level with engine-root checks because the image filter control lives outside `#results-page`.
- Search-type attributes are written only on an actual type change; sidebar synchronization is coalesced to one frame.

- Results layout: `scrollbar-gutter: stable` where chrome needs it.
- Drawers / preview panel: keep preview scrolling visually distinct from page scroll; do not add preview-pane scroll chaining.
- **Expanding image filters:** the same button remains visible at the bottom anchor. Only the filter content scrolls when it exceeds the visual viewport; there is no overlay or body scroll lock.
- Skeleton / loading rows: no scroll hijacking.

### Sticky sidebar scroll chaining (`scripts/search.js`)

The Web sidebar can be `position: sticky` and taller than the viewport. Without care, wheel events over that rail trap scroll momentum inside it and the page feels “stuck” until the pointer moves. The theme keeps chaining only for the sidebar.

**Shared rules (do not regress):**

1. **No internal scroll until physically stuck.** JS toggles a `*-is-stuck` class when the element’s `getBoundingClientRect().top` has reached its sticky `top` offset. Until then, `overflow` stays visible and the document scrolls normally.
2. **Wheel handler only when stuck + overflow.** If content fits, never `preventDefault` — page scroll always wins.
3. **Edge chaining.** At `scrollTop === 0` and scrolling up, or at the bottom edge and scrolling down, do **not** `preventDefault`. Remove the `*-scroll-active` class and let the event bubble so page scroll continues without moving the mouse.
4. **Mid-range capture.** Between edges, `preventDefault` and apply `deltaY` to the pane’s `scrollTop` so trackpad momentum over the pane scrolls the pane, not the page.
5. **Scrollbar visibility.** CSS keeps `overflow-y: hidden` while stuck but idle; `*-scroll-active` (set on wheel, cleared on `pointerleave`) enables `overflow-y: auto` + thin scrollbar. Use `overscroll-behavior: auto` — not `contain` — so browser chaining still works at edges.
6. **Reset on stick/unstick.** When `*-is-stuck` toggles, reset `scrollTop` to `0` (sidebar also clears its inner `.sticky` child).
7. **Disabled contexts.** Sidebar chaining is off below `768px` (the two-column grid engages at 768px; below that the layout is single-column with no sticky sidebar).

| Target | Stuck class | Active class | Scroll element |
| --- | --- | --- | --- |
| Web sidebar `#sidebar-col.is-sticky` | `lg-sidebar-is-stuck` | `lg-sidebar-scroll-active` | `#sidebar-col` |

Do not apply this chaining contract to the image preview pane unless the product requirement changes again.

### Images tab: selection ring + grid dimming (`style.css` + core `.selected`)

When the desktop preview pane is open, degoog core adds `.selected` to the active `.image-card` and opens `#media-preview-panel`. LiterallyGoogle layers Google-like chrome on top.

**Intention**

- **Selected card** should read as “this result is driving the preview pane” — blue ring around the thumb, full-opacity metadata below (not overlaid on the image).
- **Non-selected cards** stay at normal brightness; core’s hover opacity still applies on hover only.
- The ring must not be clipped on the first/last grid columns (left/right edge of the results column).

**How it works**

| Layer | Mechanism |
| --- | --- |
| Selection state | Core toggles `.image-card.selected` when a thumb is clicked / preview navigates (`data-idx` on each card). |
| Blue ring | `.image-card.selected::before` — padded halo (`inset: -0.25rem`, primary-tinted fill + inset 2px stroke). `.image-thumb-wrap::after` — 2px primary border on the thumb. Theme sets `outline: none` (core uses a thick outline). |
| Metadata tint | Selected `.image-title` / `.image-source` use a slight primary mix so the caption matches the ring. |
| Thumb brightness | Core applies `filter: brightness(0.5)` on `.image-card.selected .image-thumb` for overlay-style UIs. **Override to `filter: none`** — metadata sits below the image in this theme. |
| Edge clipping | `.image-grid` gets `padding-inline: var(--lg-image-selection-ring)` (0.375rem). `.image-column { overflow: visible }`. Selected card uses `overflow: visible` + `z-index: 2` so the halo paints outside the column box without being cut by `#results-main { overflow-x: clip }`. |

**Do not**

- Re-enable core thumb dimming without moving metadata back onto the image.
- Remove grid inline padding without replacing it (edge cards will lose half the ring).
- Put the ring on `.image-thumb-wrap` alone — the `::before` halo on the card is what matches Google’s selection affordance.

The theme no longer folds the grid in script (`lg-image-grid-fold` and its `data-lg-*-cols` attributes are gone). When the docked preview opens (≥1000px), `#results-main` simply shrinks in the flex row and core's column steps re-flow the grid; as a bottom sheet (below 1000px) the preview is out of the row and the grid keeps its full width.

**Phones (<480px):** core keeps at least three columns, so each image card shows one title line and no source row.

**Videos:** YouTube thumbnails are 4:3 frames with letterbox bars; `.degoog-result--thumb--video` is a 16:9 box with `object-fit: cover`, which crops the bars.

**Closed docked preview:** on docked `media-mode` (≥1000px), `#media-preview-panel:not(.open):not(.lg-preview-closing)` must be `display: none` — not `display: flex` with `width: 0`. A zero-width flex item still consumes `--literallygoogle-media-row-gap` (~0.5rem) and shifts the grid inward after close. Exit animation uses `.lg-preview-closing` (`position: fixed`) so the panel is out of the flex row while animating.

### Image card load sequencing (`scripts/search.js` + `style.css`)

Titles and sources render immediately, independently of thumbnail readiness.
Slow or failed images must not hide result text or collapse its reserved space.

**A box a visitor has seen never changes size.** Engines send no image sizes, so every `.image-thumb` reserves a 4:3 box (`object-fit: cover`, `object-position: 50% 30%`). An IntersectionObserver marks cards that have been on screen. When a thumbnail finishes (load or final error): a card that has been seen keeps its 4:3 box; a card that finished while still off screen gets `.lg-thumb-natural` and takes the image's own shape before anyone sees it. Until a card has been measured once, it keeps the box. The first screen is therefore a regular 4:3 grid and the masonry shapes start below it. Measured on replayed searches: the 4:3-to-natural switch was the only remaining source of visible jumps (CLS ~0.05–0.08); with the lock it is 0. The source row also reserves `min-height: 1rem` so the favicon appearing after the text does not push later cards down.

| Layer | Mechanism |
| --- | --- |
| Thumb shimmer | `.image-thumb-wrap::before` animation until `.image-thumb-wrap.loaded` |
| Thumbnail readiness | `.image-card.lg-img-loaded` is set when **`.image-thumb`** fires `load` / `error` (`markImageThumbLoaded()`). It must not gate metadata visibility. |
| Box shape | `settleImageThumbShape()` adds `.lg-thumb-natural` to the wrap only for loaded cards that were measured off screen and never seen. Failed thumbnails settle the same way (`lg-thumb-error` keeps the 4:3 box unless natural). |
| Metadata | `.image-info` remains visible and reserves its normal text space while the thumbnail loads. |

## Motion

| Duration | Easing | Use |
| --- | --- | --- |
| `120ms` | ease | Hover, toggle, pill state |
| `180ms` | ease | Toasts |
| `220–250ms` | ease / custom cubic | Drawer open |
| `320ms` | cubic-bezier(.2, .8, .2, 1) | Single image-filter surface width/height |
| `140–240ms` | ease | Filter content opacity/translation |

Philosophy: quick feedback on controls; slower only for spatial hierarchy (drawers, FAB morph). Motion should support hierarchy, not call attention to itself.

**Image-filter timing:** native CSS transitions reverse from their current dimensions. There are no transition-end listeners, completion timers, delayed readiness classes, or drag geometry. Reduced-motion preferences disable transitions entirely.

**Settings gears:** both home and results headers use the same 20px SVG, with a
centered view-box rotation. Hover and keyboard focus apply only the two-second
rotation; never add a hover-specific top offset, translation, or size change.
The home-header template is owned by the theme so font-icon baseline metrics
cannot move the glyph during rotation. Reduced-motion preferences skip the spin.

## Spacing

- Tight control and row spacing: `0.35rem`, `0.5rem`, `0.75rem`, or `1rem`.
- Card rows: consistent vertical padding; `14px`–`17px` for interactive rows.
- Avoid mixing many nearby values that visually collapse to the same size.

## Menus, drawers, and sidebars

- Desktop filter menus: Google-like popovers — compact, rounded, light shadow, tight row spacing.
- Mobile image filters: content-sized expanding button; physical left/right placement follows the selected setting (auto follows language/direction).
- Drawer headers: title, close control, bottom border — no extra decoration.
- Engine performance, related searches, and knowledge cards share the same card shell language.

## Settings panels and modals

- **Page body (light):** `--lg-settings-page-bg-light` (`#f0f4f9`).
- **Section wrapper (`.settings-section`):** transparent — chrome lives on inner rows/cards.
- **Stacked cards:** 2px gap, xl outer radius — see list pattern above.
- **Server tab accordions:** core renders each section as `.settings-section.settings-accordion` inside `.settings-accordion-group`. Each group is one stacked list (row fill, 2px seams, xl outer corners; LiterallyApple: grouped list with hairlines). Headings are `1rem`/500 and wrap their EXPERIMENTAL badge beside the title.
- **Store → Repositories:** one full-width row per repository (row fill, xl radius); the open row's detail joins it as its lower half on the content edge and does not repeat the name. "Show all N" is a quiet pill.
- **Empty tabs** (indexer off, no autocomplete providers): the note is one settings row.
- **Secondary buttons** use `--btn-text`, not `--text-secondary`, so they do not read disabled. In light mode the sticky filter bar (`.filter-bar-wrap`) uses the page color, not white.
- **Favicon shape picker:** unselected shapes at 70%; the selected one gets a primary ring and tint.
- **Phones:** the tab select sits `0.5rem` under the search field; a row whose only action is the drag handle keeps it beside the text. On touch screens, small links and chips (home gear and footer, Back, bang chips, shortcut reset) get a 24px `::before` hit area.
- **Server presets block:** preset `<select>` matches theme select styling (`#303134` dark); preview block uses core `var(--bg)` inset; Apply uses primary button.
- **Modals (`.ext-modal`):** inherit core degoog modal structure; theme adds pill radius on actions where `.settings-page .btn` applies. The × is a 2.5rem round target with a hover fill.

## FAB (image filters)

The shared `scripts/image-filters.js` controller and `image-filters.css` are loaded before `scripts/search.js` in both themes.

- One persistent `#lg-image-filter-control` surface contains the native `#image-filters-bar` and the same `#lg-image-tools-fab` button in both states. Do not nest interactive controls inside a button.
- The bottom edge and filter icon stay anchored. The surface expands from 3.5rem to at most 23.5rem wide and the measured content height; it never reserves 44rem of empty space.
- The content keeps its final width during the surface transition so text does not squash or repeatedly wrap. ResizeObserver updates geometry on accordion changes and streamed content. Height is capped to the visual viewport, including keyboard offset and safe-area gutters.
- Closed content is inert and aria-hidden. The persistent button uses aria-expanded and aria-controls, with no dialog semantics, overlay, focus trap, or body scroll lock.
- Dismiss with the same button, Escape, an outside pointer, or keyboard focus leaving the control. Escape returns focus; outside interactions do not steal it. The old pull handle and swipe-to-dismiss gesture are removed.
- Radio options have one tab stop per group, arrow-key navigation, and Home/End. Selecting a value uses degoog's existing option handler.
- Core may re-pin its sidebar on searches/resizing. The controller preserves the user's open/closed state. Teardown disconnects observers, aborts listeners, cancels the measurement frame, and restores the original core node without replacing its filter handlers.
- Core also detaches its cached filter node on non-image tabs. Keep a reference to that native node, restore it when an image shortcut resolves, and reclaim it if core reattaches it to `results-layout`. Observe reattachments even if the resolved search type did not change; never clone the filter markup or leave an empty launcher behind.
- Test manually with `python3 -m http.server 4319 --bind 127.0.0.1 --directory themes`, then open `http://127.0.0.1:4319/image-filters.browser-test.html`. Use `?theme=apple` for Apple; run at desktop and narrow/mobile sizes. This isolated harness tests the shipped control; live search integration must also be checked after a Store update.

## Results page panels

Scoped to `#results-page` only — do not leak to settings:

```css
#results-page .degoog-panel,
#results-page .sidebar-panel,
#results-page .results-slot-panel { … background: var(--bg-light); border-radius: var(--theme-radius-lg); }
```

Sidebar row surfaces use `--lg-sidebar-row-surface` (alias of `--bg-light`).

**Light mode edges:** `#f7f8fa` cards nearly vanish on white, so in light mode slot panels get a `var(--border)` (`#dadce0`) border and sidebar rows an inset 1px ring, like Google's light cards. Dark mode stays borderless.

**LiterallyApple dark cards:** plugins color text and controls with `--primary`, and `#0a84ff` reads at 3.6:1 on `#303134`. Inside the result slots, the glance and the sidebar, LiterallyApple uses `#409cff` (Apple's accessible dark blue) instead.

**Order in `#results-main`:** when `#slot-above-results` holds a carded plugin panel (a tool such as Time, Translate, Define, Speedtest), `#results-main` becomes a flex column and the slot takes `order: -1`, so the tool leads the At a glance box as on Google. Bare blocks (`[data-slot-bare]`, Top Stories, media strips) stay after the glance. Flex drops margin collapsing, so the moved slot loses its top margin and an empty glance is hidden.

**At a glance placeholder:** core's skeleton box gets the usual height of a glance answer per band, so results barely move when it is replaced: LiterallyGoogle `8.5rem` (≥1024px), `9.5rem` (600–1023px), `11.5rem` (<600px); LiterallyApple `8.75rem`, `9.25rem`, `11.5rem`.

**Knowledge panel in a narrow sidebar:** the panel body is a size container. Below an `18rem` content width (the 17–19rem sidebar at roughly 1024–1330px) the picture sits on top instead of floating beside about 140px of text, and the extract is clamped to eight lines.

### Native full-width slot

Degoog 0.24 renders `full-width-above-results` plugins into `#slot-full-width-above-results`. Core owns panel identity, insertion, and the search lifecycle. It inserts plugin HTML directly inside `.results-slot-panel-full-width`, without the regular panel title/body chrome. LiterallyGoogle overrides only the native container's page-rail geometry: its logical start matches the results grid and its content width spans the main column, column gap, and sidebar. On mobile it uses the same `0.75rem` inline gutter as `#results-layout`.

The theme must keep this container before `#results-layout`. It may provide vertical rhythm between multiple plugins, but must not recreate column spanning, parent-panel flattening, deduplication, or pagination cleanup. Plugin roots own their visible card chrome and use container queries for wide versus compact layouts.

### Bare regular slots (`data-slot-bare`)

Some blocks belong in the results column without a card, the way Google shows Top stories and the Images row beside the knowledge panel. A plugin opts in by putting `data-slot-bare` on its root and rendering into the regular `above-results` or `below-results` slot with an empty title. Core's markup for those slots is `.results-slot-panel > .results-slot-panel-body > {plugin root}`, so both toolkit themes match `.results-slot-panel:has(> .results-slot-panel-body > [data-slot-bare])` inside `#slot-above-results` and `#slot-below-results` only, and:

- drop the panel's background, border, radius, shadow, backdrop filter and padding, and the body's padding (the panel title is hidden too), so the plugin root sits flush in the column and draws its own frame;
- hide the panel while the bare root is still `hidden` (its runtime has not decided yet), and hide the slot container when that panel is its only child, so a waiting placeholder leaves no band and the results do not move;
- remove the slot's top margin when a bare block opens an empty column (no At a glance box), so its top lines up with the sidebar's.

Panels keep the theme's normal rhythm (gap and margins) between stacked plugins. Top Stories and Image & Video Strips use this by default; See results about stays the only full-width row. This is separate from the native full-width contract above: never flatten a regular panel for a native full-width plugin. Other themes ignore the attribute and show the normal panel around the block, which is the intended fallback.

### Result URL wrapping

Long unbroken URL paths in `.result-cite` and `.breadcrumb-trail` must wrap — they must never overflow the main grid cell into the sidebar column. The theme sets `overflow-wrap: anywhere; word-break: break-word` on these elements as defense-in-depth, regardless of layout state.

### Command pages

Bang-command pages (`.lg-command-mode` and pages whose results hold `.command-result` / `.command-help-table`) start on the results' edge and use the main column's width from 768px, like web results; the sidebar is hidden. The command's name in the meta row sits at that start instead of alone at the far end. Phones use the results' `0.75rem` gutter.

### Result header and About this result

The theme owns the `result` template (`search-templates/result.html`, a copy of core's with the same ids, flags and `{{#if}}` blocks). Line 1 is the site, line 2 the breadcrumb, and a ⋮ sits at the right.

- `scripts/result-about.js` (loaded after `search.js`; degoog wraps each theme script separately, so it repeats the few helpers it needs) turns line 1 into the hostname without `www.` and line 2 into `https://host › seg › seg`. Segments are flex items on a one-line, overflow-hidden wrapping row, so the visible crumb always ends on a whole segment at any width. Query and hash stay in the panel's full URL. A wrapped flex row spans its whole container, so a ResizeObserver on `.lg-result-site-line` caps the crumb row at its visible first line; the ⋮ stays right after the last visible segment.
- The engine chips move into the panel ("Found by"). The `.result-engines` element is kept (core's streaming compares its text with the result's sources, and the engine filter reads its tags); its `{{#each}}` is written on one line so that text matches.
- **Core's menu is the panel.** With `show_actions`, `#result-actions-toggle-N` is the ⋮ and `#result-actions-menu-N` is the panel; core still toggles `hidden`, closes on outside click and Escape, and handles its buttons, which sit under "Your instance". The theme only observes `hidden` to fill the panel, place it and manage focus. Without `show_actions` the theme adds the same structure without core ids.
- Desktop: popover under the ⋮ (opens upwards, or scrolls into view, when it does not fit). Phones: bottom sheet with `#lg-sheet-scrim`. The open result drops `content-visibility` and core's stream-in animation, which would otherwise clip the popover and contain the fixed sheet.
- Links: `site:` search (through `window.degoog.search` on a plain click), Google Translate's URL translation into the page language, and the Wayback Machine. Core's replace action rewrites the title link, and the header follows it.
- No-JS pages use the same template: line 1 shows the host as given, line 2 core's plain cite, and the engine chips stay under the snippet.

## 4play plugin chrome

See `4play.css` — scoped under `.lg-fourplay-*`, uses semantic vars with transparent borders on cards.

## What to avoid

- New one-off radii or hex colors outside the token table.
- Ad-hoc grays for list rows — use `--lg-settings-row-bg`.
- Blue text on settings buttons or chips.
- Random shadows that do not match the search bar or card system.
- Critical controls that only work when an icon font loads.
- Desktop-only UI patterns reused unchanged on mobile.
- Re-adding `lg-results-layout-single` or any intermediate desktop stack band (see **Removed: desktop stack band**).
- Overriding the native full-width slot geometry or recreating its lifecycle in theme code.
- Big explanatory comments inside theme files.

## Search bar clear button

`#results-search-clear-btn` is core's hook. Core toggles an inline display only on typing, so the theme shows the × whenever the field is not `:placeholder-shown` (programmatic values too) and adds a divider before action icons only when `#search-bar-actions-results` has children. The home bar has the same × (`#home-search-clear-btn`) as a `type="reset"` button, so it clears the field with no script.

## Images related searches

Core never fetches related searches for image searches and clears the sidebar there. The theme shows them as chips above the grid: the Web sidebar's terms when the query matches, otherwise one `/api/suggest` request shaped like core's (GET, or POST in POST mode, with search auth headers) and skipped when the visitor turned suggestions off.

The row is reserved when the image skeleton appears, before any image: an invisible placeholder chip (`.lg-image-related-chip--pending`, same 2.25rem height) holds its space until the terms arrive. Inserting the row after the first batch pushed the whole grid down 48px. Suggestion prefs are read once per page; the instance defaults decide the placeholder until then. Concurrent syncs share one request per query. The row only collapses if the request comes back empty.

## No-JS pages (`nojs/`)

`nojs/layout.html`, `logo.html`, `search-header.html`, `tabs.html` and `pagination.html` override core's monospace fallbacks; other names inherit the normal templates. `nojs/nojs.css` must not rely on script-set state (`data-lg-*`, `aria-selected`, `.loaded`); it adds `prefers-color-scheme` fallbacks for rules the main stylesheet keys off `[data-theme="light"]`. Filters open with `<details>`, and the pager is a static "degoooog" wordmark.

## Error and easter-egg pages (`pages/`)

`theme.json` `html` maps `404`, `teapot`, `gandalf` and `robots-takeover` to fragments placed into `layout.html`. They show degoog's own braille art from its default pages, scaled down with `.lg-error-ascii`, beside translated copy. `gandalf` is shown to blocked addresses for every request, stylesheets included, so it carries inline styles. `robots-takeover` must keep `__ROBOTS_RESULTS__` and must not use `#results-header`/`#results-tabs`, which core's client renders into.
