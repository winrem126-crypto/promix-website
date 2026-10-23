import placeholders from './home-image-placeholders.json';

const previews = placeholders as Record<string, string>;

export function homeImagePlaceholder(src: string | null) {
  const preview = src && previews[src];
  return preview ? { backgroundImage: `url("${preview}")` } : undefined;
}
