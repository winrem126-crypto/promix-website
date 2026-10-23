# PROMIX — soft frame product detail

final result: passed

## Scope and visual truth

The user requested one original soft frame treatment, using the supplied image for mood and presentation only. Preserve the current page structure, text, controls, catalog scene, and product artwork. This is a local preview; nothing was published.

- Source reference: `C:/Users/winre/AppData/Local/Temp/codex-clipboard-5b2232e0-7d5c-45fe-a298-eb92648f98d8.png` (1098 × 737).
- Implementation: `http://127.0.0.1:4321/products/promix-h-03/`.
- Source component changed: `src/components/ProductStudioImage.astro` only.
- Evidence: `E:/bulat/design/qa/soft-frame-preview/`.
- State: product hero, initial scroll position, necessary-only cookie preference in an isolated test browser.
- Captures: 1440 × 1000, 1098 × 737, 390 × 844 CSS and image pixels, deviceScaleFactor 1. No density normalization required.
- Browser: no Browser plugin skill is available. CUA initialization timed out twice. Captures used bundled Playwright with headless Edge against the local app.

## Visual comparison

`reference-comparison.png` places the supplied reference and implementation side by side at the same 1098 × 737 size. Existing page typography, navigation breakpoint and column proportions intentionally remain those of the project, as required by the user. The source is not a pixel matching target.

Full desktop and mobile captures were inspected. The frame uses a warm light surround, a one pixel pale contour, gentle rounding and a restrained shadow. No caption, tag, decorative object or overlay was added. The original mineral wall and floor are shared with the catalog. The exact existing product image URL and artwork are unchanged. Only uniform display scale and positioning changed.

The visible package bounds include the lid and handle mounts. Their center is measured independently of transparent image margins. Center offsets are less than 0.03 CSS pixels on both axes across all three captures. Existing source-coordinate shadow masks follow the measured image position.

## Required surfaces

- Fonts/typography: unchanged. Right-hand text and geometry exactly match baseline at 1440 pixels.
- Spacing/layout: hero dimensions and right-hand position unchanged; new inset and centered package are intentional. No clipping or horizontal overflow at tested widths.
- Colors/tokens: existing navy text and controls unchanged; frame is a quiet warm neutral. Catalog scene assets remain unchanged.
- Image quality: existing product asset retained, no generated substitute, relabeling or color adjustment. Natural floor contact remains visible. Full product is visible at all tested widths.
- Copy/content: all existing headings, description, specifications and controls retained. No text added inside the image.

## Verification

- `astro check`: 77 files, zero errors, warnings or hints.
- `before-evidence.json` and `after-evidence.json`: unchanged product image URL and identical right-hand content/rectangles at 1440 pixels.
- All three viewports: correct product identity, meaningful page content, no framework overlay, no console or page errors, no horizontal overflow.
- Characteristics link: opens `#characteristics` and target remains visible.
- Evidence images: `after-1440.png`, `after-1098.png`, `after-390.png`.

## Findings and history

No actionable P0/P1/P2 findings in the first visual comparison. Original off-center placement was corrected before the final captures. No further visual fixes were required after comparison.

Only the requested image component was changed. Other product routes and catalog artwork were not edited. Untested: other browsers and exhaustive widths outside the three captured sizes.

## Revision: diffuse shadow boundary

The user identified a P2 issue in the first version: a straight right edge inside the ambient shadow. The earlier full-view check missed that edge. Pixel inspection found alpha near 87/255 at source x1564, then an abrupt drop at the embedded raster boundary x1565. Increasing overflow alone would not resolve it.

The detail component now intersects only the diffuse ambient mask with source-relative right and bottom fades. Horizontal opacity reaches zero at 97% of the canvas, before the raster boundary at 97.8%; vertical opacity reaches zero at 98%, before its bottom edge. Existing floor exclusion and contact masks remain intact. No change to product scale, position, source image, scene assets, frame or catalog CSS.

Post-fix evidence: `shadow-fixed-1440.png`, `shadow-fixed-1098.png`, `shadow-fixed-390.png`, `shadow-fixed-evidence.json`, and `shadow-comparison.png` in the evidence directory. The comparison places the previous and corrected floor regions together at the same scale; the straight edge is replaced by a soft tail. All measured geometry and text exactly match the previous version. Maximum screenshot pixel change outside the floor region is zero. No errors or overflow across all three widths. Characteristics link works. `astro check`: 78 files, zero errors, warnings or hints.

final result: passed

## Approved rollout to every product

All 30 product detail pages now use the approved soft frame and shared studio scene. This includes 26 catalogue items and four existing archived URLs. Original image assets, text, specifications, controls and page structure are preserved. Existing baked shadows remain intact; two archived cutouts received measured framing and the existing procedural floor/contact shadow.

The initial all-product comparison found inherited canister aspect ratio enlarging the reference grid item. Resetting only the studio wrapper's aspect ratio and automatic minimum size resolved it; the inner proportional canvas remains unchanged.

Final QA checked every page at 1440 × 1000 and 390 × 844, density 1: 60/60 states passed, no errors or overflow, all images loaded, maximum center offset 0.02551 pixels. All right-hand text/geometry, information text and source URLs exactly match baseline. Approved H 0,2 screenshot is pixel-identical. The consultation dialog opens with correct deep-primer context. Final build passed for all 49 routes; type check has zero errors/warnings/hints.

Detailed report and visual comparison: `E:/bulat/design/qa/soft-frame-rollout/design-qa.md` and `all-products-desktop.png`. Final individual screenshots and `final-evidence.json` are in the same evidence directory. No remaining actionable P0/P1/P2 issues; other browser engines and exhaustive intermediate widths are untested. Nothing was deployed.

final result: passed
