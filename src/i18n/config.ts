import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import HttpBackend from 'i18next-http-backend';

console.log('🌍 i18n config loading...');

i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    lng: 'en',
    debug: false,
    
    ns: ['common', 'navigation', 'validation'],
    defaultNS: 'common',
    
    interpolation: {
      escapeValue: false,
    },
    
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    react: {
      useSuspense: false,
    },
  }).then(() => {
    console.log('✅ i18n initialized successfully');
    console.log('Language:', i18n.language);
  }).catch((err) => {
    console.error('❌ i18n initialization failed:', err);
  });

export default i18n;