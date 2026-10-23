export type DocumentType = 'sgr' | 'declaration' | 'certificate' | 'technical-sheet' | 'safety-data-sheet' | 'test-report';

export type ProductDocument = {
  id: string;
  documentType: DocumentType;
  title: string;
  scope: string;
  number: string;
  date: string;
  dateISO: string;
  file: string;
  pages: number;
  category: string;
  productIds: readonly string[];
};

// Associations are explicit and checked against the appendix on page 2.
// Adding a document never changes product visibility or the public assortment.
export const documents: readonly ProductDocument[] = [
  {
    id: 'sgr-shpatlevki-2026',
    documentType: 'sgr',
    title: 'Свидетельство о государственной регистрации',
    scope: 'Шпатлёвки PROMIX',
    number: 'RU.54.HC.01.008.E.000359.04.26',
    date: '06.04.2026',
    dateISO: '2026-04-06',
    file: '/documents/promix-sgr-shpatlevki-2026.pdf',
    pages: 2,
    category: 'putties',
    productIds: [
      'pro-spray-finish', // «шпатлевка финишная PROMIX Pro Spray»
      'promix-f', // «шпатлевка супер финишная PROMIX F»
      'promix-h-02', // Both grain sizes belong to the PROMIX H series.
      'promix-h-03', // «шпатлевка выравнивающая PROMIX H»
      'promix-w', // «шпатлевка влагостойкая PROMIX W»
      'promix-j', // «шпатлевка шовная PROMIX J»
      'promix-3in1', // «PROMIX 3в1 многофункциональное финишное покрытие»
      'promix-fasad', // «шпатлевка фасадная PROMIX fasad»
      'textured-anti-vandal', // «шпатлевка фасадная текстурная антивандальная PROMIX»
      'polymer-putty', // Appendix, page 2: «шпатлевка полимерная PROMIX»; direct-page visibility is unchanged.
    ],
  },
];

export const getProductDocuments = (productId: string): readonly ProductDocument[] =>
  documents.filter((document) => document.productIds.includes(productId));

export const documentPageLabel = (pages: number) => {
  const lastTwo = pages % 100;
  const last = pages % 10;
  const word = lastTwo >= 11 && lastTwo <= 14 ? 'страниц' : last === 1 ? 'страница' : last >= 2 && last <= 4 ? 'страницы' : 'страниц';
  return `${pages} ${word}`;
};
