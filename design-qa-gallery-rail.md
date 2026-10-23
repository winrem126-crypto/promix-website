# Design QA — Gallery Rail task selector

Date: 2026-09-04. Result: **passed** for scoped implementation and tested interactions.

## Scope and source

User selected concept 3. Only the homepage task-selector section was replaced. Header, footer, product-grid, catalog, product pages, forms, backend and analytics were not edited.

Source: `C:/Users/winre/.codex/generated_images/01a01444-10aa-7002-8058-d8cff1d51f38/exec-af4b7594-dec7-47cc-88b8-96e009164c5a.png`.

Evidence directory: `C:/Users/winre/.codex/visualizations/2026/08/18/01a01444-10aa-7002-8058-d8cff1d51f38/`.

- Final captures: `gallery-desktop-final.png`, `gallery-mobile-final.png`.
- Same-input comparisons: `gallery-desktop-comparison-final.png`, `gallery-mobile-comparison-final.png` (source left, implementation right).
- First-pass comparison: `gallery-comparison-pass1.png`.

Compared painting state at desktop 1440 CSS px and mobile 390 CSS px. Provider-resized screenshots were cropped to section bounds and normalized by width; this is not a pixel-difference score.

## Resolved findings

- P2: backdrop crowded the stage rail and supporting copy. Regenerated empty scene; aligned product feet to slab anchors 42%/68%, 72%/48%, 88%/70%.
- P2: supporting copy crossed a bright slab. Reduced second-product text offset and increased body contrast.
- P2: mobile art containers were too short. Increased art height and constrained tall primer canister width without altering aspect ratio.
- P2: switching mobile stages could leave selected row above viewport. Selected row now scrolls into view when needed.

## Final visual assessment

Desktop retains navy, editorial heading, left chapter rail, faint numeral and staggered hero/supporting products. Real PNGs sit on generated empty slabs. Rail and product copy remain separate at 1440 and 1024 widths. Mobile uses one expanded stage, with hero and two smaller products immediately below; tested at 320, 390 and 768 widths.

Intentional differences: authentic supplied PNGs replace generated mock packaging; existing site fonts retained; mobile has larger reading/tap spacing and a working all-materials CTA. Arbitrary decorative 1200/600 measurements omitted. Faint chapter is slightly smaller; stone and lighting differ (P3 cosmetic variation, not exact pixel replication).

## Checks

- Five desktop tabs: one active panel, three recommendations, one roving tab stop.
- Arrow keys/Home verified. Focus-visible tab outline verified.
- Five mobile stages checked; single expanded panel. Active trigger collapses/reopens.
- Selection synchronizes across responsive breakpoint.
- Product link opens SUPER TACK 3. All-materials opens painting-filtered catalog (9 products).
- Original PNG bytes untouched; alpha-bound framing and proportional sizing only.
- Hover CSS gated to fine/hover devices; reduced-motion supported. Live hover motion was not visually exercised with available browser API.
- No gallery overflow at 390/768. At 320, existing global min-width plus scrollbar causes document overflow, while gallery fits client width; unrelated global CSS unchanged.
- Browser console inspection returned no errors.
- Build: 0 errors, 0 warnings, 0 hints; 35 routes built.

No unresolved P0/P1/P2 findings in changed section. Previous QA preserved in `design-qa-products-mobile.md`.
