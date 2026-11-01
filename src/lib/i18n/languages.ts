export type AppLang = 'en' | 'zh-Hant' | 'zh-Hans';

export const LANGUAGES: { code: AppLang; name: string; short: string }[] = [
  { code: 'en', name: 'English', short: 'EN' },
  { code: 'zh-Hant', name: '繁體中文', short: '繁' },
  { code: 'zh-Hans', name: '简体中文', short: '简' },
];

export function isAppLang(value: unknown): value is AppLang {
  return LANGUAGES.some((l) => l.code === value);
}

export function isChinese(lang: AppLang) {
  return lang === 'zh-Hant' || lang === 'zh-Hans';
}
