# Products reference preview — QA

Final result: passed

Scope: isolated preview at `/previews/products-reference/index.html`. No homepage, shared style, product catalog, backend or task-selector source was changed. Integration awaits approval.

Source: `C:/Users/winre/AppData/Local/Temp/codex-clipboard-186f9fb6-e7e3-433e-b5eb-45994cf2b4e4.png` (1224×690).
Evidence in this preview directory: `desktop-pass1.jpg`, `desktop-final.jpg`, `comparison-pass1.png`, `comparison-final.png`, `detail-comparison.png`, `mobile-top.jpg`, `mobile-bottom.jpg`.

Desktop viewport1224×690, neutral state. Same-input comparison1224×1380: source above, implementation below. Detail comparison of adhesive card is source left and implementation right. Provider screenshot scaling normalized to1224×690 for full comparison. Mobile390×1000 plus layout checks320 and tablet768×1050. No mobile reference supplied, evaluated against user requirements.

## Comparison history

First pass P2: plaster had broad round strokes rather than diagonal edges; adhesive ridges too small/shallow. Replaced only those background assets with generated full-field diagonal plaster and large smooth adhesive arcs. P2: mineral background contrast too high; reduced opacity to.4. P2 tablet: waterproofing heading too close to product; reduced this long title to6.2cqw. Final screenshots checked after fixes, no overlapping text or clipped products.

## Required fidelity surfaces

- Typography: Times New Roman serif display closely follows reference contrast/proportions; Inter body. Header60px, card titles proportional around25px, numbers30px. Left alignment, controlled two-line descriptions and separate counts/arrows retained. Minor font-rendering/spacing differences P3.
- Spacing/layout: three equal columns, two equal rows,10px horizontal/8px vertical gutters,27px outer margins,6px radius. Title centered as image; this resolves conflict with prose asking description on right. Cards transition to two then one column. Bucket visible width175.40625px and bottom offset17.59375px identical across five desktop cards. At390: width153.4375px and bottom17.078125px identical.
- Color: navy#102b4b, warm white#f8f7f6, restrained borders. Category textures remain light and fully cover card fields. No triangle clipping/masks.
- Imagery: actual current PNGs referenced directly, no rewriting, AI replacement, skew or nonuniform scaling. Original transparent margins framed with proportional CSS. All images loaded. Roll retains original slender form and its printed artwork, rotated as one image; fully visible over cloth. It is intentionally thinner than the generated reference roll to honor source geometry. Background folds/ridges are close art-direction matches, not identical pixels (P3).
- Copy: all six categories, reference header, category counts, short descriptions and catalog CTA. Adhesive description retains actual site wording about полотна/ленты instead of implying unsupported tile-adhesive suitability.

## Interaction/responsive checks

- No horizontal overflow at320/390.
- Mobile lower cards and roll visually inspected; all fit, no text overlap.
- Tablet768 visual inspection passed after long-heading adjustment.
- Keyboard focus shows2px outline; category link opens roll-materials filter with2 products.
- All six category anchors and all-catalog anchor have real existing URLs.
- Same hover logic: background opacity+0.07 over250ms ease and arrow+4px. Products do not transform on hover. Gated to fine/hover pointers; reduced-motion disables transitions. Live hover not exercised by available browser API.
- Complete/naturalWidth image checks pass. Console not separately inspected in this isolated preview; no automated full-site regression claimed.

No unresolved P0/P1/P2 findings. P3 notes: original packaging necessarily differs from reference geometry; background details, arrow glyph and few-pixel text/layout offsets are not a pixel-identical clone.

## Assets and prompts

Built-in imagegen, backgrounds only:
- `cloth.webp`:1152×768; premium white fiberglass mesh, quiet left40%, soft draped diagonal folds on right60%, diffuse light, no product/text/UI.
- `adhesive.webp`:1152×768; thick rounded white adhesive comb ridges in large overlapping arcs filling whole field, reference card04, low contrast, no product/text/UI.
- `putty.webp`:1152×768; cold-white plaster, broad diagonal trowel bands lower-left to upper-right, irregular raised edges, fine grain, no circular strokes/product/text/UI.

Other textures and original product PNGs reused read-only from existing assets.

Next: user review and approval before homepage integration.
