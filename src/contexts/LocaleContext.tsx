import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18n from '../i18n/config';  // Import directly, don't use useTranslation
import { useAuth } from './AuthContext';

interface LocaleContextType {
  language: string;
  locale: string;
  currency: string;
  setLanguage: (lang: string) => void;
  setLocale: (locale: string) => void;
  availableLanguages: string[];
  formatCurrency: (amount: number) => string;
  formatDate: (date: Date) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  
  const [language, setLanguageState] = useState<string>('en');
  const [locale, setLocaleState] = useState<string>('en-US');
  const [currency, setCurrency] = useState<string>('USD');

  // Load tenant/user preferences on mount
  useEffect(() => {
    if (user) {
      const userLang = user.preferred_language;
      const tenantLang = user.tenant_default_language || 'en';
      const lang = userLang || tenantLang;
      
      const userLocale = user.preferred_locale;
      const tenantLocale = user.tenant_default_locale || 'en-US';
      const loc = userLocale || tenantLocale;
      
      setLanguageState(lang);
      setLocaleState(loc);
      i18n.changeLanguage(lang);
      
      const currencyMap: Record<string, string> = {
        'sv-SE': 'SEK',
        'en-US': 'USD',
        'en-GB': 'GBP',
        'es-ES': 'EUR',
        'es-MX': 'MXN',
      };
      setCurrency(currencyMap[loc] || 'USD');
    }
  }, [user]);

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);

    // Automatically update locale based on language
  const languageToLocaleMap: Record<string, { locale: string; currency: string }> = {
    'en': { locale: 'en-US', currency: 'USD' },
    'sv': { locale: 'sv-SE', currency: 'SEK' },
    'es': { locale: 'es-ES', currency: 'EUR' },
  };
  
  const localeData = languageToLocaleMap[lang] || { locale: 'en-US', currency: 'USD' };
  setLocaleState(localeData.locale);
  setCurrency(localeData.currency);
  };

  const setLocale = (loc: string) => {
    setLocaleState(loc);
    const currencyMap: Record<string, string> = {
      'sv-SE': 'SEK',
      'en-US': 'USD',
      'en-GB': 'GBP',
      'es-ES': 'EUR',
      'es-MX': 'MXN',
    };
    setCurrency(currencyMap[loc] || 'USD');
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  };

  const availableLanguages = user?.tenant_available_languages || ['en', 'sv', 'es'];

  return (
    <LocaleContext.Provider
      value={{
        language,
        locale,
        currency,
        setLanguage,
        setLocale,
        availableLanguages,
        formatCurrency,
        formatDate,
      }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return context;
};