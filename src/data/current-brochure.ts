import entries from './product-brochure-current.json';

// The current Markdown is authoritative. Null slugs are deliberate: never
// attach an absent or ambiguous source entry to an existing product by guess.
export type CurrentBrochure = (typeof entries)[number];
const matched = new Map(entries.filter((entry) => entry.matchStatus === 'matched' && entry.productSlug)
  .map((entry) => [entry.productSlug, entry]));
export const getCurrentBrochure = (slug: string) => matched.get(slug);
