type RuntimeData = { locale: string; messages: Record<string, string> };
const data: RuntimeData = (() => {
  try { return JSON.parse(document.getElementById('site-i18n-json')?.textContent || '{}'); }
  catch { return { locale: 'ru', messages: {} }; }
})();
export const locale = data.locale || document.documentElement.lang || 'ru';
export function t(source: string, values: Record<string, string | number> = {}): string {
  const translated = data.messages?.[source] ?? source;
  return translated.replace(/\{([^}]+)\}/g, (token, key: string) => key in values ? String(values[key]) : token);
}
const materialForms: Record<string, Partial<Record<Intl.LDMLPluralRule, string>>> = {
  ru: { one: 'материал', few: 'материала', many: 'материалов', other: 'материала' },
  en: { one: 'material', other: 'materials' },
  uz: { other: 'material' }, kk: { other: 'материал' }, tg: { other: 'мавод' },
  az: { other: 'material' }, ky: { other: 'материал' },
  be: { one: 'матэрыял', few: 'матэрыялы', many: 'матэрыялаў', other: 'матэрыялу' },
  hy: { other: 'նյութ' }, ka: { other: 'მასალა' }, tk: { other: 'material' },
};
export function formatMaterialCount(count: number): string {
  const forms = materialForms[locale] ?? materialForms.ru;
  const category = new Intl.PluralRules(locale).select(count);
  return `${new Intl.NumberFormat(locale, { useGrouping: false }).format(count)} ${forms[category] ?? forms.other}`;
}
