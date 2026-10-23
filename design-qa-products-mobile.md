# Design QA — mobile Products alignment

- Source visual truth: current mobile implementation before the requested correction, captured as `C:\Users\winre\.codex\visualizations\2026\08\18\01a01444-10aa-7002-8058-d8cff1d51f38\promix-mobile-before-top.png` and `promix-mobile-before-bottom.png`, evaluated against the user's mobile brief.
- Implementation screenshots: `C:\Users\winre\.codex\visualizations\2026\08\18\01a01444-10aa-7002-8058-d8cff1d51f38\promix-mobile-final-top.png` and `promix-mobile-final-bottom-stable.png`.
- Combined comparison: `C:\Users\winre\.codex\visualizations\2026\08\18\01a01444-10aa-7002-8058-d8cff1d51f38\promix-mobile-before-after.png`.
- Viewport: 390 × 844 CSS px, device scale factor 1. Each capture is 390 × 844 pixels; no density normalization was required.
- State: neutral mobile state while scrolling the six category cards.

## Full-view comparison evidence

The combined before/after input shows that the previous 80% × 76% mobile product boxes caused buckets to overlap or visually crowd the copy. The revised mobile-only rules use one 193.125 × 155 px bucket box, one shared right alignment, and a common visual baseline. Product PNG aspect ratios remain intact through `object-fit: contain`.

## Focused-region comparison evidence

The top pair covers cards 01–03 and the lower pair covers cards 04–06. Together they show consistent title/description hierarchy, aligned metadata and arrows, clean separation between copy and product, and preserved roll composition.

## Required fidelity surfaces

- Fonts and typography: headings use 26 px / 1.03 / 400 with restrained letter spacing; descriptions use 11.5 px / 1.38 / 400. No accidental emphasis or overlap remains.
- Spacing and layout rhythm: title groups begin at 74 px; counts and arrows share fixed lower anchors; all five bucket boxes share one bottom line.
- Colors and visual tokens: unchanged.
- Image quality and asset fidelity: original PNGs remain unchanged and undistorted; no image was redrawn or stretched.
- Copy and content: unchanged.

## Findings and comparison history

1. P1 fixed: a more specific legacy mobile selector enlarged product images to 80% × 76%, causing copy/product collisions and uneven visual weight. A scoped mobile override now constrains all buckets to the same product box.
2. P2 fixed: mobile typography inherited inconsistent oversized values. Heading, description, count, and arrow metrics are now explicit and shared across all six cards.
3. P2 fixed: the adhesive bucket's transparent PNG padding produced a higher visible baseline. A card-specific bottom compensation aligns its visible base with the other buckets without changing its aspect ratio.
4. Desktop regression check: desktop product dimensions remain unchanged after resetting the mobile viewport override.

## Browser verification

- URL: `http://localhost:4173/#products`
- Title: `PROMIX — профессиональные материалы для отделки`
- Meaningful DOM: present.
- Framework error overlay: absent.
- Console errors/warnings: none.
- Interaction: scrolled through the mobile card column and verified the lower cards rendered with the same anchors and no stuck hover transform.
- Build: `npm run build` passed with 0 errors, 0 warnings, and 0 hints.

final result: passed
