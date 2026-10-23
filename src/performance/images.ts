import responsiveImages from './responsive-images.json';
import catalogImageVariants from './catalog-image-variants.json';
import shadowAliases from './shadow-aliases.json';

export type ImageSource = { width: number; url: string };
type ResponsiveImage = { src: string; width: number; height: number; sources: ImageSource[] };
const images = { ...responsiveImages, ...catalogImageVariants } as Record<string, ResponsiveImage>;
const aliases = shadowAliases as Record<string, string>;

// Build-time URL selection only. Product data, artwork, framing and all original
// asset URLs remain intact; generated filenames identify their actual bytes.
export function responsiveImage(original: string, existingSources?: ImageSource[]) {
  const generated = images[original];
  return { src: generated?.src ?? original, sources: generated?.sources ?? existingSources };
}

export function imageSrcset(sources?: ImageSource[]) {
  return sources?.map(source => `${source.url} ${source.width}w`).join(', ') || undefined;
}

// Every alias was checked byte-for-byte; sharing a URL avoids downloading the
// same approved shadow mask once for every product in a packaging family.
export function canonicalAssetUrl(url: string) {
  return aliases[url] ?? url;
}
