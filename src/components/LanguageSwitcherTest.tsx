import { useTranslation } from 'react-i18next';
import { useLocale } from '../contexts/LocaleContext';

export function LanguageSwitcherTest() {
  const { t } = useTranslation(['common', 'navigation']);
  const { language, locale, currency, setLanguage, setCurrency, availableLanguages, formatCurrency, formatDate } = useLocale();

  const availableCurrencies = ['USD', 'EUR', 'SEK', 'GBP', 'MXN'];

  return (
    <div style={{ 
      padding: '20px', 
      border: '3px solid #007bff', 
      margin: '20px',
      backgroundColor: '#ffffff',
      color: '#000000'
    }}>
      <h2 style={{ color: '#000000' }}>🧪 i18n Test - Independent Controls</h2>
      
      <div style={{ marginBottom: '20px', color: '#000000' }}>
        <strong>Current State:</strong>
        <ul>
          <li>Language: <strong>{language}</strong></li>
          <li>Locale: <strong>{locale}</strong></li>
          <li>Currency: <strong>{currency}</strong></li>
        </ul>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong style={{ color: '#000000' }}>Switch Language (affects text + date format):</strong>
        <br />
        <div style={{ marginTop: '8px' }}>
          {availableLanguages.map(lang => (
            <button
              key={lang}
              onClick={() => setLanguage(lang)}
              style={{
                margin: '5px',
                padding: '12px 24px',
                backgroundColor: language === lang ? '#007bff' : '#6c757d',
                color: 'white',
                border: '2px solid #000',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong style={{ color: '#000000' }}>Switch Currency (independent of language):</strong>
        <br />
        <div style={{ marginTop: '8px' }}>
          {availableCurrencies.map(curr => (
            <button
              key={curr}
              onClick={() => setCurrency(curr)}
              style={{
                margin: '5px',
                padding: '12px 24px',
                backgroundColor: currency === curr ? '#28a745' : '#6c757d',
                color: 'white',
                border: '2px solid #000',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '16px',
                fontWeight: 'bold'
              }}
            >
              {curr}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '10px', color: '#000000' }}>
        <strong>Translations (changes with language):</strong>
        <ul style={{ color: '#000000' }}>
          <li>common:save = "{t('common:save')}"</li>
          <li>common:cancel = "{t('common:cancel')}"</li>
          <li>common:delete = "{t('common:delete')}"</li>
          <li>navigation:dashboard = "{t('navigation:dashboard')}"</li>
        </ul>
      </div>

      <div style={{ marginBottom: '10px', color: '#000000' }}>
        <strong>Formatting (currency independent, date follows language):</strong>
        <ul style={{ color: '#000000' }}>
          <li>Currency: {formatCurrency(12345.67)}</li>
          <li>Date: {formatDate(new Date())}</li>
        </ul>
      </div>

      <div style={{ 
        marginTop: '20px', 
        padding: '15px', 
        backgroundColor: '#fff3cd', 
        border: '2px solid #ffc107',
        borderRadius: '4px'
      }}>
        <strong>Test Scenario Example:</strong>
        <ol style={{ marginTop: '10px' }}>
          <li>Click <strong>ES</strong> (Spanish language)</li>
          <li>Click <strong>USD</strong> (US Dollar currency)</li>
          <li>Result: Spanish text, USD currency, Spanish date format ✓</li>
        </ol>
      </div>
    </div>
  );
}