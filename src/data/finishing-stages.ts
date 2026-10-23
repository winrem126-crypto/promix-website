export type FinishingStage = {
  id: string;
  number: string;
  title: string;
  description: string;
  category: string;
  links: { label: string; href: string }[];
  image: { src: string | null; alt: string; label: string; draft: boolean };
};

// Existing categories/task filters are supported by public/catalog.js.
// Set each image.src/alt and draft: false when the final artwork is approved.
export const finishingStages: FinishingStage[] = [
  {
    id: 'preparation', number: '01', title: 'Подготовка основания',
    description: 'Подготовка поверхности к последующим работам.',
    category: 'Грунтовки',
    links: [{ label: 'Грунтовки', href: '/products/?category=primers' }],
    image: {
      src: '/images/tasks/finishing/preparation-v1.webp',
      alt: 'Валик у светлой шероховатой минеральной стены во время подготовки основания',
      label: 'Подготовка', draft: false,
    },
  },
  {
    id: 'leveling', number: '02', title: 'Выравнивание',
    description: 'Формирование ровной плоскости под дальнейшую отделку.',
    category: 'Выравнивающие шпатлёвки',
    links: [{ label: 'Выравнивающие шпатлёвки', href: '/products/?category=putties&task=leveling' }],
    image: {
      src: '/images/tasks/finishing/leveling-v1.webp',
      alt: 'Широкий металлический шпатель выравнивает светлый состав на минеральной стене',
      label: 'Выравнивание', draft: false,
    },
  },
  {
    id: 'reinforcement', number: '03', title: 'Армирование',
    description: 'Армирующие материалы в составе выбранной системы отделки.',
    category: 'Клеи и стеклохолст',
    // There is no combined category: retain both verified destinations.
    links: [
      { label: 'Клеи', href: '/products/?category=adhesives' },
      { label: 'Стеклохолст', href: '/products/?category=roll-materials' },
    ],
    image: {
      src: '/images/tasks/finishing/reinforcement-v1.webp',
      alt: 'Край тонкого нетканого стеклохолста на подготовленной светлой поверхности',
      label: 'Армирование', draft: false,
    },
  },
  {
    id: 'finish', number: '04', title: 'Финиш',
    description: 'Тонкая подготовка поверхности под окрашивание.',
    category: 'Финишные шпатлёвки',
    links: [{ label: 'Финишные шпатлёвки', href: '/products/?category=putties&task=finish' }],
    image: {
      src: '/images/tasks/finishing/finish-v1.webp',
      alt: 'Чистое лезвие шпателя у гладкой матовой поверхности после финишного прохода',
      label: 'Финиш', draft: false,
    },
  },
  {
    id: 'painting', number: '05', title: 'Окрашивание',
    description: 'Цвет и завершённый вид готовой поверхности.',
    category: 'Краски',
    links: [{ label: 'Краски', href: '/products/?category=paints' }],
    image: {
      src: '/images/tasks/finishing/painting-v1.webp',
      alt: 'Готовая матовая серо-синяя поверхность с мягко освещённым архитектурным углом',
      label: 'Окрашивание', draft: false,
    },
  },
];
