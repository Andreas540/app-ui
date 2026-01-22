import { useTranslation } from 'react-i18next';
import { useLocale } from '../contexts/LocaleContext';

export function LanguageSwitcherTest() {
  const { t } = useTranslation(['common', 'navigation']);
  const { language, setLanguage, availableLanguages, formatCurrency, formatDate } = useLocale();

  return (
    <div style={{ 
      padding: '20px', 
      border: '3px solid #ff0000', 
      margin: '20px',
      backgroundColor: '#ffffff',
      color: '#000000'
    }}>
      <h2 style={{ color: '#000000' }}>🧪 i18n Test Component</h2>
      
      <div style={{ marginBottom: '20px', color: '#000000' }}>
        <strong>Current Language:</strong> {language}
      </div>

      <div style={{ marginBottom: '20px' }}>
        <strong style={{ color: '#000000' }}>Switch Language:</strong>
        <br />
        {availableLanguages.map(lang => (
          <button
            key={lang}
            onClick={() => {
              console.log('Switching to:', lang);
              setLanguage(lang);
            }}
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

      <div style={{ marginBottom: '10px', color: '#000000' }}>
        <strong>Translations Test:</strong>
        <ul style={{ color: '#000000' }}>
          <li>common:save = "{t('common:save')}"</li>
          <li>common:cancel = "{t('common:cancel')}"</li>
          <li>common:delete = "{t('common:delete')}"</li>
          <li>navigation:dashboard = "{t('navigation:dashboard')}"</li>
        </ul>
      </div>

      <div style={{ marginBottom: '10px', color: '#000000' }}>
        <strong>Formatting Test:</strong>
        <ul style={{ color: '#000000' }}>
          <li>Currency: {formatCurrency(12345.67)}</li>
          <li>Date: {formatDate(new Date())}</li>
        </ul>
      </div>
    </div>
  );
}