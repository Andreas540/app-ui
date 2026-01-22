import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    lng: 'en', // Default language
    debug: false, // Set to true if you want to see loading details in console
    
    // Available namespaces
    ns: ['common', 'navigation', 'validation'],
    defaultNS: 'common',
    
    interpolation: {
      escapeValue: false, // React already escapes by default
    },
    
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    react: {
      useSuspense: true,
    },
  });

export default i18n;