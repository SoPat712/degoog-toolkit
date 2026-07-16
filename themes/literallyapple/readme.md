# LiterallyApple

Requires degoog 0.24 or newer. The Store may warn about older runtimes without blocking installation, so upgrade degoog before installing or updating this theme.

An Apple-inspired **liquid glass** theme for degoog: refined translucent chrome, system typography, capsule search fields, Safari-like segmented tabs, and full-width above-results plugin slots.

Inspired by Spotlight, Safari, and system Settings — not a clone of Apple assets or trademarks.

## Features

- System font stack (`-apple-system`, SF Pro fallbacks)
- Balanced translucent materials (~68% chrome, ~82% popovers) with `backdrop-filter` and solid fallbacks
- Light / dark via `prefers-color-scheme` and degoog `data-theme`
- Sticky glass results header (desktop)
- Two-column results grid with degoog 0.24 native full-width plugin slots
- Merged capsule autocomplete with readable search-history rows

## Full-width plugins

Plugins using degoog's `full-width-above-results` position render through the native `#slot-full-width-above-results` container. Core owns rendering and lifecycle; LiterallyApple aligns the native container with its results grid, while plugins own their card chrome and responsive internal layout.
