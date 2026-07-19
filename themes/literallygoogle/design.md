# LiterallyGoogle Design System

Authoritative reference for colors, radii, layout, and component styling in this theme. Derived from `style.css`, `4play.css`, and the reference snapshots in `examples/Settings – degoog.html` and `examples/serversettings – degoog.html`.

The theme requires degoog 0.24 or newer because its search skeleton uses the native full-width slot container.

This theme should feel like modern Google Search — a little denser and cleaner for self-hosted use. New work should follow these rules before adding one-off tweaks.

## Typography

| Role | Value |
| --- | --- |
| UI font | `"Google Sans", sans-serif` |
| Monospace | `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace` |
| Section headings | Normal weight, no forced uppercase |
| Secondary labels | `var(--text-secondary)` — dark `#80868b`, light `#70757a`; typically `0.8125rem` |
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
| `--text-secondary` | `#80868b` | Descriptions, metadata |
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
- Tabs, Filter, status text, spell-check, and Web results share one **primary results rail**. The sidebar is a secondary content rail; it never owns page-level controls or status text.
- Media layouts use the tighter media gutter already defined in the theme. Image and video views should feel compact and edge-aligned.
- Desktop side content should read as a rail of stacked cards, not floating boxes with mixed spacing.
- Mobile panels should become drawers or stacked blocks. Do not keep desktop popovers on phone widths when the content is important.

### Results layout states

The Web tab has **two layout states** keyed off a single 768px breakpoint.

| State | Viewport | `#results-page` markers | Layout |
| --- | --- | --- | --- |
| **Two-column** | ≥768px | Fluid vars set inline | CSS grid: main column + sidebar column (`grid-template-columns: var(--lg-results-grid-columns)`). Sidebar sticky. |
| **Mobile single-column** | <768px | No fluid vars | Core mobile single-column: sidebar below main via `order: -1`. No sticky sidebar. |

Below the two-column minimum (768px) the layout falls straight to mobile single-column. There is no intermediate "stack band" and no runtime class gate. The body grid and primary-rail alignment engage at `@media (min-width: 768px)` and are scoped with `:not(:has(#results-layout.media-mode)):not(.lg-command-mode)` so Images/Videos and bang-command pages keep the full-width flex layout.

### Web two-column shrink order (≥768px)

On the Web tab, `scripts/search.js` sets fluid `--literallygoogle-results-sidebar-max` and `--literallygoogle-results-main-col-max` on `#results-page`. The fluid logic only runs ≥768px (where the two-column grid is active); below 768px (or any non-web/command/media case) fluid vars are cleared and mobile CSS owns the layout.

1. **Wide:** sidebar panel `calc(20rem + 5px)`, main column up to `48rem`.
2. **Tighten:** shrink the **sidebar first** from max down to `calc(16rem + 5px)` while main stays at `48rem`.
3. **Tighter:** sidebar holds at `16rem`; main column (glance, URLs, results) shrinks below `48rem`.

**Viewport fit:** fluid column **sizes** are computed from `min(layout inner width, viewport width)` so the sidebar's right edge never extends past the viewport when the window is narrowed. The sidebar shrinks fluidly (20rem → 16rem) before the main column gives way; do not lock the sidebar at 20rem.

JS sets fixed fluid column values so CSS grid cannot shrink the main column before the sidebar. `--literallygoogle-results-rail-inline-size` follows the computed main-column value and is the shared geometry contract for Web chrome. Layout sync runs on **resize**, **degoog-results-ready**, and **search-type** changes only — not on every subtree mutation.

### Results tabs row (`#results-tabs`)

- `#results-tabs` stays **full width** so its `border-bottom` spans edge to edge of the viewport (it is deliberately NOT included in the shrink-to-fit container block that constrains `#results-meta` / `#results-layout`).
- **Desktop (≥768px):** `#results-tabs` uses a one-column grid sized by `--literallygoogle-results-rail-inline-size`, with `padding-inline-start: var(--literallygoogle-results-content-inline-start)` so it aligns with the result content below. The tabs rail and Filters control share column 1; Filters is right-aligned and the rail reserves `6.5rem` when it is visible, so they cannot overlap. Neither control floats over the sidebar. Edge-aware nav arrows are hidden at desktop (there is room). The Filters button does not become extra bold (`700`) when open, remaining at a stable `500`.
- **Mobile (<768px):** the grid is removed. `syncTabsRail()` in `scripts/search.js` mounts the scroll rail (with edge-aware prev/next arrows) and appends the Filters control as the **last item in the scroll list**, so tabs (Web, Images, …) and Filters read as one joint horizontal list. The Filters button is positioned statically/non-sticky so it scrolls normally along with the tabs. Edge-aware navigation arrows appear only here, and are visible only on hover/focus (computers with mice), staying hidden on touch screens (where users swipe intuitively). The vertical divider `|` is hidden on the tabs rail itself and rendered on the Filter button inside the scroll container, showing up exactly between the last tab and the filter button.
- The rail is mounted at **all** widths (it owns the scroll container and the grid grouping); the difference is just what lives inside the scroll and whether the arrows are visible.
- Images/Videos (`media-mode`) and bang-command pages are exempt from the grid — `#results-tabs` keeps its full-width flex layout there.

### Removed: desktop stack band (`lg-results-layout-single`)

A previous version of this theme had a third layout state — a "desktop stack band" at ~768–990px that used `display: contents` on `#results-main` plus a `grid-template-areas` stack. It was removed because long unbroken result URLs overflowed the main grid cell during the 990↔1070px hysteresis transitions, the band had no sticky sidebar / full-bleed results (violating the stable-content-gutter rule), and the 80px hysteresis band could leave a two-column grid active at ~791px producing smushed columns. The `lg-results-layout-single` class no longer exists — do not re-add it. Below 768px the layout now falls straight to mobile single-column.

### Results meta row (`#results-meta`)

- The meta row is a **shared skeleton** across Web, Images, and Videos. Keep its horizontal alignment rules **simple and global**.
- **Web (desktop, two-column ≥768px):** `#results-meta` is a flex row whose right edge is `content start + --literallygoogle-results-rail-inline-size`. Spell-check and engine chrome sit at the rail start; `.results-meta-stats` uses `margin-inline-start: auto` at the rail end. This keeps simultaneous items from overlapping and prevents status text from floating over the sidebar.
- **Web (single-column <768px):** stats span the row with `text-align: end` via the baseline flex layout.
- Default padding uses `--literallygoogle-results-content-inline-*` like the tabs row; spell-check and engine chrome stay in column 1 on two-column Web.
- **Images/Videos (desktop):** `scheduleMediaMetaRightGap()` sets `--lg-media-meta-right-gap` from `#results-meta`’s **border-box right** to `getMediaContentRailRightEdge()` — never from `.results-meta-stats.getBoundingClientRect()` (that moved the text you were measuring). Updates run on layout/resize/tab change only, **not** on scroll or sticky pill frames.
- Engine pills live in `#lg-media-engine-pills` inside the meta row; stats stay pinned to the rail right edge via flex + the gap variable above.
- If you need media-specific chrome (engine pills, filters, spell-check), prefer **separate elements inside `#results-meta`** instead of redefining paddings or widths on `#results-meta` itself.
- When adjusting Images/Videos behavior, verify that the **right edge of the stats text** stays aligned with the layout rail at common widths (preview open and closed).

### Desktop engine pills rail (`#lg-media-engine-pills`)

On Images (desktop, sticky sidebar enabled), engine stat rows are mirrored as scrollable pills in `#results-meta`.

| Behaviour | Detail |
| --- | --- |
| Sticky detach | Pills use `position: fixed` once the meta row scrolls past the header/tabs stack. An in-flow **placeholder** (`lg-media-engine-rail-placeholder`) preserves meta row height so the grid does not jump (no `padding-bottom` on `#results-meta`). |
| Width animation | On stick, pills keep their in-flow width/position at progress `0`. Over the next **50px** of scroll (`STICKY_RAIL_REVEAL_DISTANCE`), width and `left` interpolate toward `getMediaResultsRightEdge()` — **expand** toward the full grid rail when the preview is closed, **shrink** toward the preview’s left edge when it is open. Same easing curve both ways; only the target width changes. |
| Placeholders | Only one in-flow `lg-media-engine-rail-placeholder` may follow `#lg-media-engine-pills`. `ensureMediaEnginePillsHost()` must not re-`insertBefore` an already-mounted host — duplicate placeholders steal flex space and leave the meta row shrunk after scroll/preview. |
| Stats | Images/Videos: `--lg-media-meta-right-gap` from meta border right to layout rail; Web: primary-rail flex end — no JS inset. |

Do not snap pills to full viewport width on stick, and do not add meta `padding-bottom` to reserve sticky height.

### Engine filter + pagination

Selecting an engine (pills or sidebar stat row) sets `data-lg-engine-filter` on `#results-page` and hides non-matching cards via `.lg-engine-filtered-out`.

When the filter **changes** and at least one engine remains selected, the theme dispatches `lg-engine-filter-change`:

- **Web client pagination:** reset to page 1 and rebuild the pager from the filtered set.
- **Server pagination (Images, etc.):** navigate to page 1 if URL or pager shows page &gt; 1; filter re-applies on `degoog-results-ready`.

Clearing all engine filters does **not** reset the page (user keeps their place).

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
- Toggle switches: inset `box-shadow` ring on track, not border (avoids knob gap).
- Filter / sidebar selection: `--lg-selection-accent` blue tint + `--lg-selection-active-ring`.
- Links: `var(--text-link)`; visited `var(--text-link-visited)`.

## Spell-check (theme behavior)

The official spell-check plugin (`examples/official-extensions/plugins/spell-check/`) uses:

- An **interceptor** that corrects queries via Yandex Speller (all search types at the server).
- An **at-a-glance slot** that renders `.spell-check-notice` when a correction was applied.

Theme JS (`scripts/search.js`) hoists the notice into `#results-meta` **only on the Web tab** (`getActiveSearchType() === "web"`). On Images, Videos, or News tabs the theme clears any hoisted notice. The “Search instead for …” link inside the notice correctly uses `var(--text-link)` (blue).

## Sticky behavior

- `#results-header`: `position: relative`, `z-index: 120`, `background: var(--bg)`.
- Image filter FAB / drawer: fixed positioning with FAB ↔ panel morph (`--lg-drawer-duration` 400ms). See **FAB (image filters)** below.
- Engine performance pills rail: fixed sticky morph with 50px scroll expansion (see **Desktop engine pills rail**).
- Media preview panel (desktop docked): `position: sticky`; outer shell `overflow: hidden` with full `border-radius`; scroll on `.mp2-body` so the scrollbar stays inside the rounded card. Panel width stays at CSS `--mp2-panel-width: min(30rem, calc(100vw - 2rem))` — do not shrink it dynamically to the grid gap.

## Scrolling

- Results layout: `scrollbar-gutter: stable` where chrome needs it.
- Drawers / preview panel: keep preview scrolling visually distinct from page scroll; do not add preview-pane scroll chaining.
- **FAB drawer close:** while morphing closed (`lg-image-drawer-animating`), dragging (`lg-drawer-dragging`), or snap-back (`lg-drawer-drag-snap`), hide **both** horizontal and vertical scrollbars on `#image-filters-bar` and its sidebar body.
- **FAB drawer close icon + layering:** during `#image-filters-bar.lg-image-drawer-animating:not(.open)` keep the pull-tab handle visible immediately (no “icon appears at end” delay). On desktop, the shrinking drawer “shrunk FAB” layer must stay below `#lg-image-tools-fab` (z-index lower than the FAB).
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

Grid fold behaviour when the preview opens lives in `scripts/search.js` (`lg-image-grid-fold`).

Desktop image-grid folding must only happen while the preview is truly **side-docked**. When the preview falls back to the bottom-sheet/modal presentation, the grid should immediately reclaim the full `#results-main` width even if `#media-preview-panel` still has `.open`. `scripts/search.js` therefore:

- gates folding on `isDockedPreviewOpen()` (desktop width + `media-mode` + computed `position: sticky`), not just `.open`
- recomputes `data-lg-grid-base-cols` from the current viewport breakpoint on resize
- resets `data-lg-visible-cols` back to the base count whenever the preview is open but no longer side-docked

**Closed docked preview:** on desktop `media-mode`, `#media-preview-panel:not(.open):not(.lg-preview-closing)` must be `display: none` — not `display: flex` with `width: 0`. A zero-width flex item still consumes `--literallygoogle-media-row-gap` (~0.5rem) and shifts the grid inward after close. Exit animation uses `.lg-preview-closing` (`position: fixed`) so the panel is out of the flex row while animating.

If you see a state like `data-lg-grid-base-cols="6"` / `data-lg-visible-cols="4"` after the preview has become a bottom modal, that is a regression.

### Image card load sequencing (`scripts/search.js` + `style.css`)

Thumbnails and metadata must appear together — not title/source before the image.

| Layer | Mechanism |
| --- | --- |
| Thumb shimmer | `.image-thumb-wrap::before` animation until `.image-thumb-wrap.loaded` |
| Metadata gate | `.image-card.lg-img-loaded` — only set when **`.image-thumb`** fires `load` / `error` (`markImageThumbLoaded()`). **Do not** watch favicon `img` inside `.image-source-row` (favicons load first and used to flash metadata early). |
| Hidden until ready | `.image-info` is `opacity: 0`, `max-height: 0` until `.lg-img-loaded` |

## Motion

| Duration | Easing | Use |
| --- | --- | --- |
| `120ms` | ease | Hover, toggle, pill state |
| `180ms` | ease | Toasts |
| `220–250ms` | ease / custom cubic | Drawer open |
| `320ms` | `--lg-drawer-ease-open` | FAB morph (drag snap-back) |
| `400ms` | `--lg-drawer-ease-open/close` | Full drawer open/close shell |
| `90ms` delay | ease | Filter content fade-in after shell reaches `.lg-image-drawer-open-ready` |

Philosophy: quick feedback on controls; slower only for spatial hierarchy (drawers, FAB morph). Motion should support hierarchy, not call attention to itself.

**FAB / drawer timing:** `prepareImageDrawerAnimation()` listens for `transitionend` on width/height (debounced) with a `--lg-drawer-duration` + 96ms fallback timeout. Read duration from CSS via `getDrawerAnimDurationMs()` — do not hard-code a divergent ms value in JS.

## Spacing

- Tight control and row spacing: `0.35rem`, `0.5rem`, `0.75rem`, or `1rem`.
- Card rows: consistent vertical padding; `14px`–`17px` for interactive rows.
- Avoid mixing many nearby values that visually collapse to the same size.

## Menus, drawers, and sidebars

- Desktop filter menus: Google-like popovers — compact, rounded, light shadow, tight row spacing.
- Mobile image filters: fixed drawer from the left.
- Drawer headers: title, close control, bottom border — no extra decoration.
- Engine performance, related searches, and knowledge cards share the same card shell language.

## Settings panels and modals

- **Page body (light):** `--lg-settings-page-bg-light` (`#f0f4f9`).
- **Section wrapper (`.settings-section`):** transparent — chrome lives on inner rows/cards.
- **Stacked cards:** 2px gap, xl outer radius — see list pattern above.
- **Server presets block:** preset `<select>` matches theme select styling (`#303134` dark); preview block uses core `var(--bg)` inset; Apply uses primary button.
- **Modals (`.ext-modal`):** inherit core degoog modal structure; theme adds pill radius on actions where `.settings-page .btn` applies.

## FAB (image filters)

- Size: `--lg-fab-size` (`3.5rem`).
- Shape: circle → morphs to drawer corner radius (`clamp(1.5rem, 5vw, 2rem)` / `clamp(1.5rem, 2.25vw, 2rem)` desktop).
- Surface: `--bg-light` when collapsed; full panel surface when open.
- Pull tab: `--lg-drawer-handle-width` × `--lg-drawer-handle-height`, pill-shaped `::before` handle on `.degoog-img-sidebar-close.lg-drawer-pull-tab`.
- No visible scrollbars during handle drag or shrink animation (desktop and mobile).

### Open / close morph (`scripts/search.js`)

| Phase | Classes / behaviour |
| --- | --- |
| **Closed (idle)** | `#image-filters-bar` hidden; only `#lg-image-tools-fab` visible. |
| **Open start** | `.open.lg-image-drawer-animating:not(.lg-image-drawer-open-ready)` — shell at FAB size/position (matches close end-state). |
| **Open end** | `.lg-image-drawer-open-ready` added on next frame → CSS transitions shell to full drawer dimensions; filter content fades in ~90ms later. |
| **Close** | Remove `.open`, keep `.lg-image-drawer-animating` → CSS morphs back to FAB size; placeholder preserves layout height. |

**Do not** jump to full size via inline JS on open (old `applyImageDrawerMotionProgress(..., 1)` hack). Drag-to-dismiss on close still uses `applyImageDrawerMotionProgress()` for finger tracking.

### Dismiss paths

- Overlay tap (mobile)
- Pull-tab / close control click
- `Escape`
- FAB toggle (second click while open)
- Pull-down gesture on the drawer handle (touch)

Desktop: drawer host may be reparented to `document.body` (`lg-image-fab-drawer`) for correct fixed stacking.

## Results page panels

Scoped to `#results-page` only — do not leak to settings:

```css
#results-page .degoog-panel,
#results-page .sidebar-panel,
#results-page .results-slot-panel { … background: var(--bg-light); border-radius: var(--theme-radius-lg); }
```

Sidebar row surfaces use `--lg-sidebar-row-surface` (alias of `--bg-light`).

### Native full-width slot

Degoog 0.24 renders `full-width-above-results` plugins into `#slot-full-width-above-results`. Core owns panel identity, insertion, and the search lifecycle. It inserts plugin HTML directly inside `.results-slot-panel-full-width`, without the regular panel title/body chrome. LiterallyGoogle overrides only the native container's page-rail geometry: its logical start matches the results grid and its content width spans the main column, column gap, and sidebar. On mobile it uses the same `0.75rem` inline gutter as `#results-layout`.

The theme must keep this container before `#results-layout`. It may provide vertical rhythm between multiple plugins, but must not recreate column spanning, parent-panel flattening, deduplication, or pagination cleanup. Plugin roots own their visible card chrome and use container queries for wide versus compact layouts.

### Result URL wrapping

Long unbroken URL paths in `.result-cite` and `.breadcrumb-trail` must wrap — they must never overflow the main grid cell into the sidebar column. The theme sets `overflow-wrap: anywhere; word-break: break-word` on these elements as defense-in-depth, regardless of layout state.

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
