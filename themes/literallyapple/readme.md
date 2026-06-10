# LiterallyApple

An Apple-inspired **liquid glass** theme for degoog: refined translucent chrome, system typography, capsule search fields, Safari-like segmented tabs, and full-width above-results plugin slots.

Inspired by Spotlight, Safari, and system Settings — not a clone of Apple assets or trademarks.

## Features

- System font stack (`-apple-system`, SF Pro fallbacks)
- Balanced translucent materials (~68% chrome, ~82% popovers) with `backdrop-filter` and solid fallbacks
- Light / dark via `prefers-color-scheme` and degoog `data-theme`
- Sticky glass results header (desktop)
- Two-column results grid with optional full-width plugin row (`degoog-fullwidth-slot-shell`)
- Merged capsule autocomplete with readable search-history rows

## Full-width plugins

Plugins that export `slot-full-width` on their root card span the main + sidebar columns when this theme is active, same contract as LiterallyGoogle.
