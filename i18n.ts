import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import enTranslations from './locales/en.json';

const resources = {
  en: {
    translation: enTranslations
  },
  // Add more languages here as they are created
  // es: { translation: esTranslations },
  // fr: { translation: frTranslations },
  // de: { translation: deTranslations },
  // zh: { translation: zhTranslations },
  // ja: { translation: jaTranslations }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en', // Default language
    fallbackLng: 'en',
    
    interpolation: {
      escapeValue: false // React already escapes
    },
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage']
    },
    
    debug: process.env.NODE_ENV === 'development'
  });

export default i18n;
