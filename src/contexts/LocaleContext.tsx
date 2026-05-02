import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import i18n from '../i18n/config';
import { useAuth } from './AuthContext';

// Apply stored language before first render so i18n never starts in the wrong locale
;(() => {
  try {
    const u = JSON.parse(localStorage.getItem('userData') || 'null')
    const lang = u?.preferred_language || u?.tenant_default_language
    if (lang && lang !== 'en') i18n.changeLanguage(lang)
  } catch {}
})()

interface LocaleContextType {
  language: string;
  locale: string;
  currency: string;
  timezone: string;
  setLanguage: (lang: string) => void;
  setCurrency: (currency: string) => void;
  setTimezone: (timezone: string) => void;
  availableLanguages: string[];
  formatCurrency: (amount: number) => string;
}

const LocaleContext = createContext<LocaleContextType | undefined>(undefined);

const LANGUAGE_TO_LOCALE: Record<string, string> = {
  en: 'en-US',
  sv: 'sv-SE',
  es: 'es-419',
};

function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('userData') || 'null') } catch { return null }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [language, setLanguageState] = useState<string>(() => {
    const u = getStoredUser()
    return u?.preferred_language || u?.tenant_default_language || 'en'
  });
  const [locale, setLocaleState] = useState<string>(() => {
    const u = getStoredUser()
    const lang = u?.preferred_language || u?.tenant_default_language || 'en'
    return LANGUAGE_TO_LOCALE[lang] || 'en-US'
  });
  const [currency, setCurrencyState] = useState<string>(() => {
    const u = getStoredUser()
    return u?.preferred_currency ?? u?.tenant_default_currency ?? 'USD'
  });
  const [timezone, setTimezoneState] = useState<string>(() => {
    const u = getStoredUser()
    return u?.preferred_timezone ?? u?.tenant_default_timezone ?? 'UTC'
  });

  // Load tenant/user preferences on mount or when user changes
  useEffect(() => {
    if (user) {
      const lang = user.preferred_language || user.tenant_default_language || 'en';
      const loc = LANGUAGE_TO_LOCALE[lang] || 'en-US';
      const curr = user.preferred_currency ?? user.tenant_default_currency ?? 'USD';
      const tz = user.preferred_timezone ?? user.tenant_default_timezone ?? 'UTC';

      setLanguageState(lang);
      setLocaleState(loc);
      setCurrencyState(curr);
      setTimezoneState(tz);
      i18n.changeLanguage(lang);
      document.documentElement.lang = lang;
    }
  }, [user]);

  async function saveUserGeo(fields: { language?: string; currency?: string; timezone?: string }) {
    try {
      const token = localStorage.getItem('authToken');
      const activeTenantId = localStorage.getItem('activeTenantId');
      if (!token || !user?.id) return;
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      await fetch(`${base}/api/tenant-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {}),
        },
        body: JSON.stringify({ action: 'updateUserGeo', userId: user.id, ...fields }),
      });
    } catch (e) {
      console.error('Failed to save geo preferences:', e);
    }
  }

  const setLanguage = (lang: string) => {
    setLanguageState(lang);
    i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
    const loc = LANGUAGE_TO_LOCALE[lang] || 'en-US';
    setLocaleState(loc);
    saveUserGeo({ language: lang });
  };

  const setCurrency = (curr: string) => {
    setCurrencyState(curr);
    saveUserGeo({ currency: curr });
  };

  const setTimezone = (tz: string) => {
    setTimezoneState(tz);
    saveUserGeo({ timezone: tz });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const availableLanguages = user?.tenant_available_languages || ['en', 'sv', 'es'];

  return (
    <LocaleContext.Provider
      value={{
        language,
        locale,
        currency,
        timezone,
        setLanguage,
        setCurrency,
        setTimezone,
        availableLanguages,
        formatCurrency,
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
