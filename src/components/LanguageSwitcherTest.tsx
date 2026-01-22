import { useTranslation } from 'react-i18next';
import { useLocale } from '../contexts/LocaleContext';

export function LanguageSwitcherTest() {
  const { t } = useTranslation(['common', 'navigation']);
  const { language, setLanguage, availableLanguages, formatCurrency, formatDate } = useLocale();

  return (
    <div style={{ 
      padding: '20px', 
      border: '2px solid #333', 
      margin: '20px',
      backgroundColor: '#f0f0f0'
    }}>
      <h2>🧪 i18n Test Component</h2>
      
      <div style={{ marginBottom: '20px' }}>
        <strong>Current Language:</strong> {language}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong>Switch Language:</strong>
        {availableLanguages.map(lang => (
          <button
            key={lang}
            onClick={() => setLanguage(lang)}
            style={{
              margin: '0 5px',
              padding: '8px 16px',
              backgroundColor: language === lang ? '#007bff' : '#ccc',
              color: language === lang ? 'white' : 'black',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            {lang.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Translations Test:</strong>
        <ul>
          <li>common:save = "{t('common:save')}"</li>
          <li>common:cancel = "{t('common:cancel')}"</li>
          <li>common:delete = "{t('common:delete')}"</li>
          <li>navigation:dashboard = "{t('navigation:dashboard')}"</li>
        </ul>
      </div>

      <div style={{ marginBottom: '10px' }}>
        <strong>Formatting Test:</strong>
        <ul>
          <li>Currency: {formatCurrency(12345.67)}</li>
          <li>Date: {formatDate(new Date())}</li>
        </ul>
      </div>
    </div>
  );
}