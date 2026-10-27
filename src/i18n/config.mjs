export const LOCALES = [
  { code: 'ru', native: 'Русский', ogLocale: 'ru_RU' },
  { code: 'en', native: 'English', ogLocale: 'en_US' },
  { code: 'uz', native: 'O‘zbekcha', ogLocale: 'uz_UZ' },
  { code: 'kk', native: 'Қазақша', ogLocale: 'kk_KZ' },
  { code: 'tg', native: 'Тоҷикӣ', ogLocale: 'tg_TJ' },
  { code: 'az', native: 'Azərbaycanca', ogLocale: 'az_AZ' },
  { code: 'ky', native: 'Кыргызча', ogLocale: 'ky_KG' },
  { code: 'be', native: 'Беларуская', ogLocale: 'be_BY' },
  { code: 'hy', native: 'Հայերեն', ogLocale: 'hy_AM' },
  { code: 'ka', native: 'ქართული', ogLocale: 'ka_GE' },
  { code: 'tk', native: 'Türkmençe', ogLocale: 'tk_TM' },
];
export const TARGET_LOCALES = LOCALES.filter(locale => locale.code !== 'ru');
export const localeFromPath = pathname => LOCALES.find(locale => locale.code !== 'ru' && new RegExp(`^/${locale.code}(?:/|$)`).test(pathname))?.code ?? 'ru';
export const russianPath = pathname => pathname.replace(/^\/(?:en|uz|kk|tg|az|ky|be|hy|ka|tk)(?=\/|$)/, '') || '/';
export const localizedPath = (pathname, locale) => locale === 'ru' ? russianPath(pathname) : `/${locale}${russianPath(pathname)}`;
