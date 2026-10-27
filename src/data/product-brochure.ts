import rawBrochures from './product-brochure-2025.json';
import { getCurrentBrochure, getCurrentRollFormats, type CurrentBrochure } from './current-brochure';
import type { Product } from './products';

export type BrochureGroup = 'description' | 'characteristics' | 'application' | 'storage';
export type BrochureBlock = {
  id: string;
  heading: string;
  source: { document: string; page: number; section: string; additionalSection?: string };
  paragraphs?: string[];
  items?: string[];
  ordered?: boolean;
  after?: string[];
  warning?: boolean;
  table?: { headers: string[]; rows: string[][] };
  rollFormats?: { width: string; density: string; length: string }[];
};
export type ProductBrochure = {
  edition?: 'current';
  groupTitles?: Partial<Record<BrochureGroup, string>>;
  source: { document: string; page: number; section: string };
  coveredSpecLabels: string[];
  sharedSpecLabels: string[];
  groups: Record<BrochureGroup, BrochureBlock[]>;
};

// Build-time content only. Questions and withheld candidates live in docs/ and
// are deliberately not imported here. The source PDF is not a public download.
const brochures: Record<string, ProductBrochure> = rawBrochures;
export const getProductBrochure = (slug: string): ProductBrochure => {
  const current = getCurrentBrochure(slug);
  return current ? currentProductBrochure(current) : brochures[slug];
};

// Project all current content into the existing presentation model. Old
// brochure blocks are used only for products not mapped to the new document.
function currentProductBrochure(current: CurrentBrochure): ProductBrochure {
  const source = { document: current.source.document, page: current.source.page, section: current.sourceName };
  const block = (id: string, heading: string, paragraphs: string[], warning = false): BrochureBlock[] =>
    paragraphs.length ? [{ id, heading, paragraphs, warning, source }] : [];
  const storageSpecs = current.specs.filter((spec) => ['Морозостойкость', 'Срок годности', 'Упаковка'].includes(spec.label));
  // These retained structured rows match the confirmed manufacturer formats;
  // densities are table values, never inferred official grade identifiers.
  const glassFiberFormats = current.productSlug === 'glass-fiber-plus-top'
    ? brochures[current.productSlug].groups.storage.flatMap((entry) => entry.rollFormats ?? [])
    : [];
  return {
    edition: 'current',
    source,
    groupTitles: { storage: current.storage.length ? 'Хранение и упаковка' : 'Срок годности и упаковка' },
    coveredSpecLabels: ['Нанесение'],
    sharedSpecLabels: [],
    groups: {
      description: [
        ...block('purpose', 'Назначение', current.purpose),
        ...block('properties', 'Свойства', current.properties),
        ...block('composition', 'Состав', current.composition),
      ],
      characteristics: glassFiberFormats.length ? [{
        id: 'roll-formats',
        heading: 'Плотность и размеры рулонов',
        table: {
          headers: ['Плотность, г/м²', 'Ширина, м', 'Длина, м'],
          rows: glassFiberFormats.map((format) => [format.density, format.width, format.length]),
        },
        source,
      }] : [],
      application: [
        ...block('application', 'Подготовка основания и порядок работ', current.application),
        ...current.tables.map((table): BrochureBlock => ({ id: 'dilution', heading: table.heading, table, source })),
        ...block('application-method', 'Способ нанесения', current.applicationMethod),
        ...block('warnings', 'Ограничения и предупреждения', current.warnings, true),
      ],
      storage: [
        ...block('storage', current.storage.some((paragraph) => /транспортиров/i.test(paragraph)) ? 'Хранение и транспортировка' : 'Условия хранения', current.storage),
        // Unconfirmed source instructions remain in needsReview for editors;
        // they are not customer-facing product content.
        ...storageSpecs.flatMap((spec) => block(`storage-${spec.label}`, spec.label, [spec.value])),
        ...(!storageSpecs.some((spec) => spec.label === 'Упаковка') ? block('packaging', 'Упаковка', [current.packaging]) : []),
      ],
    },
  };
}
export const brochureGroups: { id: BrochureGroup; title: string }[] = [
  { id: 'description', title: 'Описание и свойства' },
  { id: 'characteristics', title: 'Характеристики' },
  { id: 'application', title: 'Подготовка и применение' },
  { id: 'storage', title: 'Состав, хранение и упаковка' },
];

// Shared technical numbers come from product.specs used in the detail hero.
// Templates add source conditions without maintaining a second short value.
export function resolveBrochureText(text: string, product: Product): string {
  return text.replace(/\{\{spec:([^}]+)\}\}/g, (_token, label: string, offset: number) => {
    const spec = product.specs.find((item) => item.label === label);
    if (!spec) throw new Error(`Missing shared spec ${product.slug}: ${label}`);
    return offset > 0 ? spec.value.replace(/^[А-ЯЁ]/, (letter) => letter.toLocaleLowerCase('ru-RU')) : spec.value;
  });
}

// Roll width, density and length have one structured source. These projections
// preserve the existing catalog values and order; the detail table uses the
// very same formats, including the density-to-length association.
export function rollCatalogSpecs(slug: string): Product['specs'] {
  const formats = getCurrentRollFormats(slug) ?? brochures[slug]?.groups.storage.flatMap((block) => block.rollFormats ?? []);
  if (!formats?.length) throw new Error(`Missing roll formats: ${slug}`);
  const format = formats[0];
  return [
    formats.length > 1
      ? { label: 'Формат', value: `рулон ${format.width} м` }
      : { label: 'Размер рулона', value: `${format.width} × ${format.length} м` },
    { label: 'Плотность', value: `${formats.map((item) => item.density).join(' / ')} г/м²` },
  ];
}

// Project confirmed packaging into the card; retain the full source text and
// density-to-length associations in the detail page. Never infer missing sizes.
export function catalogPackaging(product: Pick<Product, 'slug' | 'specs'>): string {
  const existing = product.specs.find((item) => ['Упаковка', 'Фасовка'].includes(item.label));
  if (existing) return existing.value;

  const blocks = brochures[product.slug]?.groups.storage ?? [];
  const formats = blocks.flatMap((block) => block.rollFormats ?? []);
  if (formats.length) {
    const sizes = [...new Set(formats.map((format) => `${format.width} м × ${format.length} м`))];
    return `${sizes.length === 1 ? 'Рулон' : 'Рулоны'} ${sizes.join(' / ')}`;
  }

  const packaging = blocks.find((block) => block.heading === 'Упаковка')?.paragraphs?.join(' ');
  if (!packaging) return 'Уточняйте';

  // The reviewed brochure uses one container per sentence, with kg/l sizes.
  // Keep additional containers explicit (for example, a 25 kg plastic bag).
  return packaging.split(/\.\s*/).filter(Boolean).map((sentence, index) => {
    const sizes = [...sentence.matchAll(/(\d+(?:,\d+)?)\s*(кг|л)/g)];
    if (!sizes.length || new Set(sizes.map((size) => size[2])).size !== 1) return sentence;
    const container = index === 0 ? '' : sentence.slice(0, sizes[0].index).trim() + ' ';
    return `${container}${sizes.map((size) => size[1]).join(' / ')} ${sizes[0][2]}`;
  }).join('; ');
}
