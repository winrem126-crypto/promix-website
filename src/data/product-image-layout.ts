import type { Product } from './products';

// One optical coordinate system for the catalog and product detail.
// Bounds describe the package; the transparent canvas and native shadow stay intact.
export function productImageStyle(frame: NonNullable<Product['cardImageFrame']>) {
  const [sourceWidth] = frame.source;
  const [x, y, width, height] = frame.bounds;
  const scale = Math.min(810 / width, 708 / height) * (frame.opticalScale ?? 0.94);
  return [
    `--image-width: ${sourceWidth * scale / 1024 * 100}%`,
    `--image-left: ${(514 - (x + width / 2) * scale) / 1024 * 100}%`,
    `--image-top: ${(872 - (y + height) * scale) / 1024 * 100}%`,
  ].join('; ');
}

// Map a new canvas onto the old painted canvas, preserving the package height,
// optical center and base independently of the transparent fields and shadow.
export function productReferenceStyle(frame: NonNullable<Product['cardImageFrame']>) {
  const reference = frame.reference!;
  const [rw, rh] = reference.source;
  const [rx, ry, rwidth, rheight] = reference.bounds;
  const [x, y, width, height] = frame.bounds;
  const scale = Math.min(rwidth / width, rheight / height) * (frame.opticalScale ?? 1);
  return [
    `--reference-ratio: ${rw / rh}`,
    `--image-width: ${frame.source[0] * scale / rw * 100}%`,
    `--image-left: ${(rx + rwidth / 2 - (x + width / 2) * scale) / rw * 100}%`,
    `--image-top: ${(ry + rheight - (y + height) * scale) / rh * 100}%`,
  ].join('; ');
}
