import { useLanguage } from '@/hooks/useLanguage';
import { isChinese } from '@/lib/i18n/languages';

export type Lang = 'en' | 'zh';
export type Localized<T> = Record<Lang, T>;

/** Landing copy is written in English and Chinese; other languages start from English and are translated on the page. */
export function useLandingLang(): Lang {
  const { lang } = useLanguage();
  return isChinese(lang) ? 'zh' : 'en';
}
