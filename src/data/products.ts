import { catalogPackaging, rollCatalogSpecs } from './product-brochure';
import { getCurrentBrochure } from './current-brochure';
import productImageFrames from './product-images.json';
import catalogProductAssets from './catalog-product-assets.json';

export type Product = {
  slug: string;
  catalogVisible?: boolean;
  catalogPurpose: string;
  catalogPackaging: string;
  name: string;
  subtitle: string;
  category: 'putties' | 'primers' | 'paints' | 'adhesives' | 'waterproofing' | 'roll-materials';
  categoryLabel: string;
  tasks: string[];
  applications: string[];
  image: string;
  imageUnavailable?: boolean;
  imageSources?: { width: number; url: string }[];
  imageLayout: 'bucket' | 'canister' | 'canister-landscape' | 'roll' | 'plus-top';
  // Original canvas and visible packaging bounds (alpha >= 128), in pixels.
  // Optional: existing images keep their established family-specific sizing.
  cardImageFrame?: { source: [number, number]; bounds: [number, number, number, number]; opticalScale?: number; normalizeDetail?: boolean; builtInShadow?: boolean; reference?: { source: [number, number]; bounds: [number, number, number, number] } };
  description: string;
  benefits: string[];
  specs: { label: string; value: string }[];
  surfaces: string[];
  searchKeywords: string[];
  shortName: string;
  series: string;
  source: string;
};

type Seed = Omit<Product, 'categoryLabel' | 'applications' | 'source' | 'benefits' | 'surfaces' | 'searchKeywords' | 'shortName' | 'series' | 'imageLayout' | 'catalogPurpose' | 'catalogPackaging'> & {
  catalogPurpose?: string;
  applications?: string[];
  benefits?: string[];
  surfaces?: string[];
  searchKeywords?: string[];
  shortName?: string;
  series?: string;
  source?: string;
  imageLayout?: Product['imageLayout'];
};

const labels = {
  putties: 'Шпатлёвки', primers: 'Грунтовки', paints: 'Краски', adhesives: 'Клеи',
  waterproofing: 'Гидроизоляция', 'roll-materials': 'Стеклохолст и флизелин',
} as const;

const defaultSurfaces = ['Бетон', 'Штукатурка', 'Гипсокартон'];
const categorySearchKeywords = {
  putties: ['шпатлевка', 'шпаклевка', 'выравнивание', 'финиш'],
  primers: ['грунт', 'грунтовка', 'подготовка основания', 'укрепление'],
  paints: ['краска', 'окрашивание', 'стены', 'потолки'],
  adhesives: ['клей', 'клеевой состав', 'приклеивание'],
  waterproofing: ['гидроизоляция', 'защита от воды', 'влажные зоны'],
  'roll-materials': ['стеклохолст', 'холст', 'флизелин', 'рулон', 'полотно'],
} as const;
const keyboardAliases: Record<string, string[]> = { W: ['w', 'ц'], H: ['h', 'р'], J: ['j', 'о'], F: ['f', 'а'] };
const displayValue = (value: string) => {
  const trimmed = value.trimStart();
  if (!trimmed || /^(?:м²|мм|см|кг|г|л)(?:\b|\/)/i.test(trimmed)) return value;
  return value.replace(/^\s*([а-яё])/, (match, first: string) => match.replace(first, first.toLocaleUpperCase('ru-RU')));
};
const make = (seed: Seed): Product => {
  const current = getCurrentBrochure(seed.slug);
  const media = (catalogProductAssets as unknown as Record<string, { image: string; sources: { width: number; url: string }[]; frame: NonNullable<Product['cardImageFrame']>; geometry: { family: string } }>)[seed.slug];
  const inferredCode = seed.name.match(/^PROMIX\s+([A-Z])(?:\s|$)/i)?.[1]?.toUpperCase() ?? '';
  const shortName = seed.shortName ?? inferredCode;
  const series = seed.series ?? (shortName ? `PROMIX ${shortName}` : '');
  return {
    ...seed,
    name: current && seed.slug === 'pro-spray-finish' ? current.sourceName : seed.name,
    subtitle: current?.subtitle ?? seed.subtitle,
    description: current?.cardPurpose ?? seed.description,
    catalogPurpose: current?.cardPurpose ?? displayValue(seed.catalogPurpose ?? seed.specs.find((item) => item.label === 'Назначение')?.value ?? seed.subtitle),
    catalogPackaging: current?.packaging ?? catalogPackaging(seed),
    image: media?.image ?? seed.image,
    imageSources: media?.sources,
    cardImageFrame: media?.frame ?? (productImageFrames as unknown as Record<string, NonNullable<Product['cardImageFrame']>>)[seed.image] ?? seed.cardImageFrame,
    categoryLabel: labels[seed.category],
    applications: seed.applications ?? ['manual'],
    imageLayout: media?.geometry.family === 'oval' ? 'plus-top' : seed.imageLayout ?? (seed.category === 'roll-materials' ? 'roll' : ['deep-primer', 'primer-concentrate', 'universal-primer'].includes(seed.slug) ? 'canister' : 'bucket'),
    // Current full properties and parameters replace all older summaries and
    // aliases (e.g. Высыхание / Время высыхания, Фракция / Величина зерна).
    benefits: current ? [] : seed.benefits ?? [],
    specs: current?.specs ?? seed.specs.map((item) => ({ ...item, value: displayValue(item.value) })),
    surfaces: seed.surfaces ?? defaultSurfaces,
    shortName,
    series,
    searchKeywords: [...categorySearchKeywords[seed.category], ...(seed.searchKeywords ?? []), ...(keyboardAliases[shortName] ?? [])],
    source: current ? `${current.source.document}, стр. ${current.source.page}` : seed.source ?? 'Буклет PROMIX 2025',
  };
};
const spec = (purpose: string, application = 'ручное') => [{ label: 'Назначение', value: purpose }, { label: 'Нанесение', value: application }, { label: 'Состояние', value: 'готовый состав' }];

export const products: Product[] = [
  // H 0,3 is described on page 15 of the 2025 brochure. The newer red H 0,2
  // entry and the available H 0,2 packaging photo must not replace this SKU.
  make({ slug: 'promix-h-03', name: 'PROMIX H 0,3', subtitle: 'Толстослойная выравнивающая шпатлёвка фракции 0,3 мм', category: 'putties', tasks: ['leveling'], applications: ['manual', 'machine'], image: '/images/products/2026-10/promix-h-03-f281de343a.png', imageUnavailable: true, description: 'Состав для заделки повреждений, полостей и трещин, а также выравнивания бетонных, оштукатуренных и гипсокартонных поверхностей внутри помещений.', specs: [{ label: 'Фракция', value: '0,3 мм' }, ...spec('выравнивание', 'ручное / механизированное')], source: 'Буклет 2025г-1.pdf, стр. 15' }),
  make({ slug: 'promix-h-02', name: 'PROMIX H 0,2', subtitle: 'Выравнивающая шпатлёвка фракции 0,2 мм', category: 'putties', tasks: ['leveling'], applications: ['manual', 'machine'], image: '/images/products/2026-10/promix-h-02-ac384999d4.png', description: 'Готовая выравнивающая шпатлёвка с фракцией 0,2 мм для внутренних работ.', specs: [{ label: 'Фракция', value: '0,2 мм' }, ...spec('выравнивание', 'ручное / механизированное')] }),
  make({ slug: 'promix-j', name: 'PROMIX J', subtitle: 'Шовная шпатлёвка', category: 'putties', tasks: ['preparation'], searchKeywords: ['швы', 'заделка швов', 'трещины'], image: '/images/products/2026-10/promix-j-71ae9842fc.png', description: 'Высокопрочный состав для заполнения швов, трещин и локальных повреждений основания.', specs: spec('швы и локальные дефекты', 'шпатель') }),
  make({ slug: 'promix-3in1', name: 'PROMIX 3в1', subtitle: 'Многофункциональное финишное покрытие', category: 'putties', tasks: ['finish'], applications: ['manual', 'machine'], image: '/images/products/2026-10/promix-3in1-5ddbc3c12f.png', description: 'Многофункциональный состав: грунтование, финишное выравнивание и создание готовой белой поверхности.', specs: spec('грунт / шпатлёвка / финиш', 'ручное / механизированное') }),
  make({ slug: 'promix-f', catalogPurpose: 'Финиш', name: 'PROMIX F', subtitle: 'Суперфинишная шпатлёвка', category: 'putties', tasks: ['finish'], applications: ['manual', 'machine'], image: '/images/products/2026-10/promix-f-e71ba1c0b5.png', description: 'Тонкодисперсная полимерная шпатлёвка для чистового выравнивания стен и потолков перед окрашиванием.', benefits: ['Повышенная белизна и адгезия', 'Минимальная усадка', 'Лёгкое шлифование'], specs: [{ label: 'Толщина слоя', value: 'до 1 мм' }, { label: 'Расход', value: '1,65 кг/м² при 1 мм' }, { label: 'Высыхание', value: 'около 1 часа' }, { label: 'Нанесение', value: 'ручное / механизированное' }] }),
  make({ slug: 'pro-spray-finish', catalogPurpose: 'Финиш', name: 'PRO SPRAY', subtitle: 'Базовая финишная шпатлёвка', category: 'putties', tasks: ['finish'], applications: ['manual', 'machine'], image: '/images/products/2026-10/pro-spray-finish-c441eedcda.png', description: 'Финишная шпатлёвка для чистового выравнивания стен и потолков, оптимизированная для механизированного нанесения.', specs: [{ label: 'Зерно', value: '0,06 мм' }, { label: 'Расход', value: '1,65 кг/м² при 1 мм' }, { label: 'Высыхание', value: 'около 1 часа' }, { label: 'Фасовка', value: '18 / 25 кг' }] }),
  make({ slug: 'pro-spray-improved', catalogVisible: false, name: 'PRO SPRAY Улучшенная', subtitle: 'Полимерная шпатлёвка для механизированного нанесения', category: 'putties', tasks: ['finish'], applications: ['manual', 'machine'], image: '/images/products/current/pro-spray-improved.png', description: 'Улучшенный готовый состав для быстрого механизированного выравнивания больших площадей.', specs: spec('финишное выравнивание', 'механизированное') }),
  make({ slug: 'promix-w', name: 'PROMIX W', subtitle: 'Влагостойкая шпатлёвка', category: 'putties', tasks: ['finish', 'wet'], image: '/images/products/2026-10/promix-w-b1fc804c1a.png', description: 'Влагостойкая шпатлёвка для помещений с повышенной влажностью и подготовки оснований перед отделкой.', specs: spec('влажные помещения', 'шпатель') }),
  make({ slug: 'promix-fasad', name: 'PROMIX FASAD', subtitle: 'Фасадная шпатлёвка', category: 'putties', tasks: ['leveling', 'finish'], image: '/images/products/2026-10/promix-fasad-4fa9419c39.png', description: 'Фасадная шпатлёвка для выравнивания минеральных оснований при наружных и внутренних работах.', specs: spec('фасад и интерьер', 'шпатель / валик') }),
  make({ slug: 'textured-anti-vandal', name: 'Текстурная антивандальная', subtitle: 'Прочная текстурная шпатлёвка', category: 'putties', tasks: ['finish'], image: '/images/products/2026-10/textured-anti-vandal-06ef857cad.png', description: 'Антивандальное текстурное покрытие для поверхностей с высокой эксплуатационной нагрузкой.', specs: spec('прочная текстура', 'шпатель / валик') }),
  make({ slug: 'polymer-putty', catalogVisible: false, name: 'Шпатлёвка полимерная', subtitle: 'Универсальная шпатлёвка ручного нанесения', category: 'putties', tasks: ['leveling', 'finish'], image: '/images/products/2026-10/polymer-putty-09cd4e5959.png', description: 'Полимерный готовый состав для выравнивания и финишной подготовки стен и потолков.', specs: spec('выравнивание и финиш', 'шпатель') }),

  make({ slug: 'betokontakt', name: 'PROMIX Бетоноконтакт', searchKeywords: ['бетоконтакт'], subtitle: 'Адгезионный грунт для плотных оснований', category: 'primers', tasks: ['preparation'], image: '/images/products/2026-10/betokontakt-9357d7c5e4.png', description: 'Грунт для обработки плотных и слабовпитывающих влагу оснований перед отделочными работами.', specs: spec('плотные основания', 'кисть / валик') }),
  make({ slug: 'mittel-grund', name: 'Миттельгрунт', subtitle: 'Грунтовка-концентрат для сильновпитывающих оснований', category: 'primers', tasks: ['preparation'], applications: ['manual', 'machine'], image: '/images/products/2026-10/mittel-grund-707be14614.png', description: 'Концентрат уменьшает и выравнивает водопоглощение сильновпитывающих минеральных оснований.', specs: [{ label: 'Расход', value: 'около 0,05 кг/м²' }, { label: 'Высыхание', value: 'около 1 часа' }, { label: 'Нанесение', value: 'кисть / валик / распылитель' }, { label: 'Фасовка', value: '10 / 15 кг' }] }),
  // Verified on the manufacturer's product page and matching green label, 2026-10-22.
  // https://pro-mix.ru/products/grunt-glubokogo-proniknoveniya-promix/
  make({
    slug: 'deep-primer', name: 'Грунт глубокого проникновения',
    subtitle: 'Грунтовка для укрепления впитывающих оснований',
    catalogPurpose: 'Укрепление основания', category: 'primers', tasks: ['preparation'], applications: ['manual', 'machine'],
    image: '/images/products/2026-10/deep-primer-8c9c918005.png',
    description: 'Грунтовка PROMIX глубокого проникновения укрепляет впитывающие и ослабленные основания, снижает их водопоглощение и улучшает сцепление с отделкой. Применяется перед оштукатуриванием, шпатлеванием, окрашиванием и наклейкой обоев, а также перед наливными полами, клеевыми составами и полимерной гидроизоляцией. Для наружных и внутренних работ.',
    benefits: ['Укрепляет основание и повышает адгезию', 'Снижает впитывающую способность поверхности', 'Повышенная устойчивость к воздействию плесени и микроорганизмов'],
    specs: [
      { label: 'Расход', value: '100–150 г/м² за один слой; зависит от впитываемости основания' },
      // The manufacturer lists these as two separate packaging entries:
      // «Канистра 1,5 л» and «10 л.», not three sizes 1 / 5 / 10 л.
      { label: 'Фасовка', value: 'Канистры 1,5 / 10 л' },
      { label: 'Время высыхания', value: '2–4 часа при +20 °C и относительной влажности не более 80 %' },
      { label: 'Назначение', value: 'Укрепление впитывающих оснований' },
      { label: 'Область применения', value: 'Наружные и внутренние работы' },
      { label: 'Нанесение', value: 'Кисть, валик, краскораспылитель' },
      { label: 'Цвет', value: 'Белый' },
      { label: 'Разбавление', value: 'Водой' },
      { label: 'Условия хранения', value: 'В плотно закрытой таре при температуре не ниже +5 °C' },
      { label: 'Срок годности', value: '12 месяцев с даты производства в оригинальной закрытой упаковке' },
      { label: 'Морозостойкость', value: '5 циклов' },
    ],
    surfaces: ['Бетон', 'Цементная и цементно-известковая штукатурка', 'Кирпич', 'Природный камень', 'Гипсокартон', 'Пеноблоки', 'Газобетон', 'ДСП', 'Фанера'],
    source: 'Данные производителя и этикетка: https://pro-mix.ru/products/grunt-glubokogo-proniknoveniya-promix/',
  }),
  make({ slug: 'primer-concentrate', name: 'Грунт-концентрат PROMIX', subtitle: 'Концентрированная грунтовка глубокого проникновения', category: 'primers', tasks: ['preparation'], image: '/images/products/2026-10/primer-concentrate-0fd024c39b.png', description: 'Концентрированный грунт для подготовки и укрепления минеральных оснований.', specs: spec('укрепление основания', 'кисть / валик') }),
  make({ slug: 'primer-paint', name: 'Грунт-краска PROMIX', subtitle: 'Укрывистый грунт для наружных и внутренних работ', category: 'primers', tasks: ['preparation', 'painting'], image: '/images/products/2026-10/primer-paint-36e1e0948e.png', description: 'Пигментированный грунт для создания равномерной по цвету и впитываемости подложки перед окрашиванием.', specs: spec('подготовка под окрашивание', 'кисть / валик / распылитель') }),
  // Description, properties and parameters supplied by the owner.
  make({
    slug: 'universal-primer', name: 'Грунт универсальный',
    subtitle: 'Универсальный грунт для минеральных оснований',
    catalogPurpose: 'Грунтование оснований', category: 'primers', tasks: ['preparation'],
    image: '/images/products/2026-10/universal-primer-f832e445e9.png',
    description: 'Универсальная грунтовка PROMIX для подготовки минеральных оснований. Укрепляет поверхность, повышает адгезию и снижает впитывающую способность основания. Обладает повышенной устойчивостью к воздействию плесени и микроорганизмов. Наносится кистью, валиком или краскопультом.',
    benefits: [
      'Повышенная устойчивость к воздействию плесени и микроорганизмов',
      'Укрепляет основание, повышает адгезию',
      'Снижает впитывающую способность основания',
    ],
    specs: [
      { label: 'Расход', value: '80–200 мл/м²' },
      { label: 'Время высыхания', value: '1 час' },
      { label: 'Рабочий инструмент', value: 'Кисть, валик, краскопульт' },
      { label: 'Условия хранения', value: 'В плотно закрытой таре не ниже +5 °C' },
      { label: 'Фасовка', value: 'Канистра: 5, 10 л.' },
      { label: 'Срок годности', value: '12 месяцев' },
    ],
    source: 'Данные производителя: pro-mix.ru/products/grunt-universalnyj-promix/',
  }),
  make({ slug: 'sous-couche', name: 'PROMIX Су-Куш', searchKeywords: ['sous couche', 'sous-couche'], subtitle: 'Многофункциональный белый грунт', category: 'primers', tasks: ['preparation', 'painting'], image: '/images/products/2026-10/sous-couche-4f2e9b531f.png', description: 'Многофункциональный белый грунт для наружных и внутренних работ, выравнивающий цвет и впитываемость основания.', specs: spec('белая подложка', 'кисть / валик') }),

  make({ slug: 'super-tack-3', catalogPurpose: 'Стены и потолки', name: 'SUPER TACK 3', subtitle: 'Глубокоматовая акриловая краска', category: 'paints', tasks: ['painting'], applications: ['manual', 'machine'], image: '/images/products/2026-10/super-tack-3-a745b14619.png', description: 'Глубокоматовая акриловая краска для высококачественной окраски стен и потолков.', specs: [{ label: 'Расход', value: 'до 14 м²/л' }, { label: 'Высыхание', value: '2–4 часа' }, { label: 'Нанесение', value: 'кисть / валик / распылитель' }, { label: 'Фасовка', value: '2,2 / 9 л' }] }),
  make({ slug: 'super-tack-7', catalogPurpose: 'Стены и потолки', name: 'SUPER TACK 7', subtitle: 'Матовая износостойкая акриловая краска', category: 'paints', tasks: ['painting', 'wet'], applications: ['manual', 'machine'], image: '/images/products/2026-10/super-tack-7-0c47626be9.png', description: 'Износостойкая краска для стен и потолков в помещениях с высокой эксплуатационной нагрузкой.', benefits: ['Стойкость к интенсивному мытью', 'Водо- и грязеоотталкивающее покрытие', 'Не образует потёков'], specs: [{ label: 'Расход', value: 'до 14 м²/л' }, { label: 'Высыхание', value: '2–4 часа' }, { label: 'Нанесение', value: 'кисть / валик / распылитель' }, { label: 'Фасовка', value: '2,2 / 9 л' }] }),
  make({ slug: 'super-tack-facade', name: 'SUPER TACK ФАСАД', subtitle: 'Матовая акриловая краска для фасадов и интерьеров', category: 'paints', tasks: ['painting'], applications: ['manual', 'machine'], image: '/images/products/2026-10/super-tack-facade-6d66c49261.png', description: 'Матовая акриловая краска для долговечной защитно-декоративной отделки фасадов и интерьеров.', specs: spec('фасад и интерьер', 'кисть / валик / распылитель') }),
  make({ slug: 'super-tack-facade-silicon', name: 'SUPER TACK ФАСАД SILICON', subtitle: 'Матовая акрил-силиконовая краска', category: 'paints', tasks: ['painting', 'wet'], applications: ['manual', 'machine'], image: '/images/products/2026-10/super-tack-facade-silicon-f98f92df89.png', description: 'Акрил-силиконовая краска для фасадов и интерьеров с повышенной защитой от атмосферной влаги.', specs: spec('фасад и интерьер', 'кисть / валик / распылитель') }),
  make({ slug: 'mix-mosaic', catalogPurpose: 'Декоративное покрытие', name: 'MIX Краска', subtitle: 'Многоцветное декоративное покрытие', category: 'paints', tasks: ['painting'], applications: ['machine'], image: '/images/products/2026-10/mix-mosaic-c196ed3116.png', description: 'Многоцветное декоративное покрытие для наружных и внутренних работ.', specs: [{ label: 'Расход', value: '50–250 г/м²' }, { label: 'Высыхание', value: '2–3 часа' }, { label: 'Нанесение', value: 'краскораспылитель' }, { label: 'Фасовка', value: '10 кг' }] }),
  make({ slug: 'acrylic-enamel', catalogVisible: false, name: 'Эмаль акриловая', subtitle: 'Универсальная глянцевая эмаль', category: 'paints', tasks: ['painting'], image: '/images/products/2026-10/acrylic-enamel-67cad3d45f.png', description: 'Акриловая эмаль для прочного глянцевого покрытия подготовленных поверхностей.', specs: spec('прочное глянцевое покрытие', 'кисть / валик') }),

  make({ slug: 'tape-adhesive', name: 'Клей для лент PROMIX', subtitle: 'Высокопрочный клей для наружных и внутренних работ', category: 'adhesives', tasks: ['preparation', 'finish'], image: '/images/products/2026-10/tape-adhesive-5741790d4f.png', description: 'Высокопрочный готовый клей для приклеивания соединительных и малярных лент.', specs: spec('малярные и соединительные ленты', 'шпатель / валик / кисть') }),
  make({ slug: 'plus-top', catalogPurpose: 'Стеклохолст, флизелин и обои', name: 'PROMIX Plus Top', subtitle: 'Готовый влагостойкий клей для обоев', category: 'adhesives', tasks: ['preparation', 'finish', 'wet'], applications: ['manual', 'machine'], image: '/images/products/2026-10/plus-top-01cb1f86f5.png', description: 'Готовый влагостойкий клей для стеклообоев, малярного стеклохолста, флизелина и тяжёлых обоев.', benefits: ['Высокая адгезия', 'После высыхания бесцветный', 'Для помещений с повышенной влажностью'], specs: [{ label: 'Расход', value: '0,20 л / 0,206 кг на 1 м²' }, { label: 'Отверждение', value: 'до 24 часов' }, { label: 'Нанесение', value: 'кисть / валик / распылитель' }, { label: 'Фасовка', value: '10 кг' }] }),
  make({ slug: 'hydro', catalogPurpose: 'Гидроизоляция', name: 'Гидроизоляция PROMIX', subtitle: 'Акриловая гидроизоляция', category: 'waterproofing', tasks: ['wet'], applications: ['manual', 'machine'], image: '/images/products/2026-10/hydro-dcc0155a95.png', description: 'Акриловый состав для гидроизоляции кровли, фундаментов, цоколей, террас, балконов и санузлов.', specs: [{ label: 'Расход', value: '1,3–1,5 кг/м² при 1 мм' }, { label: 'На отлип', value: 'не менее 2 часов' }, { label: 'Полное высыхание', value: '24 часа' }, { label: 'Фасовка', value: '10 кг' }], surfaces: ['Кровля', 'Фундамент', 'Цоколь', 'Терраса', 'Санузел'] }),
  make({ slug: 'glass-fiber-plus-top', catalogPurpose: 'Подготовка стен и потолков', name: 'Малярный стеклохолст PROMIX', subtitle: 'Полотно для подготовки стен и потолков', category: 'roll-materials', tasks: ['preparation', 'finish'], image: '/images/products/2026-10/glass-fiber-plus-top-e4f31956bf.png', description: 'Малярный стеклохолст для подготовки стен и потолков при финишном шпатлевании или окрашивании.', specs: [...rollCatalogSpecs('glass-fiber-plus-top'), { label: 'Монтаж', value: 'на клей PROMIX' }], surfaces: ['Стены', 'Потолки', 'Минеральные основания', 'Гипсокартон'] }),
  make({ slug: 'nonwoven-plus-top', catalogPurpose: 'Подготовка стен и потолков', name: 'Флизелин PROMIX Plus Top', subtitle: 'Малярное полотно премиум-класса', category: 'roll-materials', tasks: ['preparation', 'finish'], image: '/images/products/2026-10/nonwoven-plus-top-a846e281ec.png', description: 'Малярный флизелин для подготовки стен и потолков перед финишным шпатлеванием или окрашиванием.', specs: [...rollCatalogSpecs('nonwoven-plus-top'), { label: 'Монтаж', value: 'на клей PROMIX' }, { label: 'Срок годности', value: 'не ограничен' }], surfaces: ['Стены', 'Потолки', 'Минеральные основания', 'Гипсокартон'] }),
];

// Direct product pages and getProduct keep using the complete inventory.
// Every public assortment, search source and count uses this one projection.
export const isCatalogVisible = (product: Product) => product.catalogVisible !== false;
export const catalogProducts = products.filter(isCatalogVisible);

export const categories = [
  { id: 'putties', title: 'Шпатлёвки', summary: 'Выравнивающие и финишные составы', image: '/images/categories/concept-1/putty.png', imageWidth: 1024, imageHeight: 1024, media: 'bucket', texture: '/images/categories/concept-1/texture-putty.png' },
  { id: 'primers', title: 'Грунтовки', summary: 'Подготовка и укрепление основания', image: '/images/categories/concept-1/primer.png', imageWidth: 1024, imageHeight: 1024, media: 'bucket', texture: '/images/categories/concept-1/texture-primer.png' },
  { id: 'paints', title: 'Краски', summary: 'Интерьерные и фасадные покрытия', image: '/images/categories/concept-1/paint.png', imageWidth: 1024, imageHeight: 1024, media: 'bucket', texture: '/images/categories/concept-1/texture-paint.png' },
  { id: 'adhesives', title: 'Клеи', summary: 'Готовые составы для полотен и лент', image: '/images/categories/concept-1/adhesive.png', imageWidth: 1024, imageHeight: 1024, media: 'bucket', texture: '/images/categories/concept-1/texture-adhesive.png' },
  { id: 'waterproofing', title: 'Гидроизоляция', summary: 'Защита поверхностей во влажных зонах', image: '/images/categories/concept-1/waterproofing.png', imageWidth: 1024, imageHeight: 1024, media: 'bucket', texture: '/images/categories/concept-1/texture-waterproofing.png' },
  { id: 'roll-materials', title: 'Стеклохолст и флизелин', summary: 'Подготовка стен и потолков под финиш', image: products.find((product) => product.slug === 'glass-fiber-plus-top')!.image, imageWidth: 1216, imageHeight: 1600, media: 'roll', texture: '/images/categories/concept-1/texture-rolls.png' },
].map((category) => ({ ...category, count: catalogProducts.filter((item) => item.category === category.id).length }));

export const taskOptions = [
  { id: 'preparation', index: '01', title: 'Подготовка основания', copy: 'Грунтовочные и сопутствующие материалы для стабильного основания.' },
  { id: 'leveling', index: '02', title: 'Выравнивание', copy: 'Составы для устранения неровностей, полостей и дефектов.' },
  { id: 'finish', index: '03', title: 'Финишное шпатлевание', copy: 'Материалы для получения ровной поверхности перед окрашиванием.' },
  { id: 'painting', index: '04', title: 'Окрашивание', copy: 'Профессиональные интерьерные, фасадные и декоративные покрытия.' },
  { id: 'wet', index: '05', title: 'Влажные зоны', copy: 'Влагостойкие шпатлёвки, краски, клеи и гидроизоляция.' },
] as const;

export const getProduct = (slug: string) => products.find((item) => item.slug === slug);
