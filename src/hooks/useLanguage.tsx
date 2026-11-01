import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { isAppLang, type AppLang } from '@/lib/i18n/languages';
import { createPageTranslator } from '@/lib/i18n/pageTranslator';

const STORAGE_KEY = 'app-lang';
const LEGACY_KEY = 'landing-lang';

function initialLang(): AppLang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (isAppLang(saved)) return saved;
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy === 'zh') return 'zh-Hant';
  if (legacy === 'en') return 'en';
  const nav = navigator.language.toLowerCase();
  if (nav.startsWith('zh')) return /cn|sg|hans/.test(nav) ? 'zh-Hans' : 'zh-Hant';
  return 'en';
}

type LanguageContextValue = { lang: AppLang; setLang: (lang: AppLang) => void };

const LanguageContext = createContext<LanguageContextValue>({ lang: 'en', setLang: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<AppLang>(initialLang);
  const translator = useRef<ReturnType<typeof createPageTranslator> | null>(null);

  useEffect(() => {
    const t = createPageTranslator(document.body);
    translator.current = t;
    return () => {
      t.stop();
      translator.current = null;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
    translator.current?.setLang(lang);
  }, [lang]);

  return <LanguageContext.Provider value={{ lang, setLang }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
