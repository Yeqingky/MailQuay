import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en';
import zhCN from '@/locales/zh-CN';

export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const STORAGE_KEY = 'mailquay:language';

export function normalizeLanguage(value: string | undefined): SupportedLanguage {
  if (value === 'zh-CN' || value?.toLowerCase().startsWith('zh')) return 'zh-CN';
  return 'en';
}

function initialLanguage(): SupportedLanguage {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) return normalizeLanguage(stored);
  return normalizeLanguage(window.navigator.language);
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-CN': { translation: zhCN },
  },
  lng: initialLanguage(),
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function applyLanguage(value: string): void {
  const language = normalizeLanguage(value);
  if (i18n.language !== language) void i18n.changeLanguage(language);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = language;
  }
}

document.documentElement.lang = normalizeLanguage(i18n.language);

export default i18n;
