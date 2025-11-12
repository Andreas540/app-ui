import { useState, useEffect } from 'react';
import '../TenantAdmin.css';

interface NavItem {
  visible: boolean;
  order: number;
  label: string;
  path: string;
  section?: boolean;
  items?: Record<string, NavItem>;
}

interface NavigationConfig {
  [key: string]: NavItem;
}

interface TenantConfig {
  navigation: NavigationConfig;
  businessType: string;
  features: Record<string, boolean>;
}

interface Tenant {
  id: string;
  name: string;
}

export default function TenantAdmin() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load all tenants (excluding BLV)
  useEffect(() => {
    loadTenants();
  }, []);

  // Load config when tenant is selected
  useEffect(() => {
    if (selectedTenant) {
      loadTenantConfig(selectedTenant);
    }
  }, [selectedTenant]);

  const loadTenants = async () => {
    try {
      const response = await fetch('/.netlify/functions/tenant-admin?action=getTenants');
      const data = await response.json();
      setTenants(data.tenants || []);
    } catch (error) {
      console.error('Error loading tenants:', error);
      showMessage('error', 'Failed to load tenants');
    }
  };

  const loadTenantConfig = async (tenantId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/.netlify/functions/tenant-admin?action=getConfig&tenantId=${tenantId}`);
      const data = await response.json();
      setConfig(data.config || null);
    } catch (error) {
      console.error('Error loading config:', error);
      showMessage('error', 'Failed to load tenant configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMenuItem = (path: string[], currentValue: boolean) => {
    if (!config) return;

    const newConfig = { ...config };
    let target: any = newConfig.navigation;

    // Navigate to the correct nested object
    for (let i = 0; i < path.length - 1; i++) {
      if (path[i] === 'items') {
        target = target.items;
      } else {
        target = target[path[i]];
      }
    }

    // Toggle the visible property
    const finalKey = path[path.length - 1];
    target[finalKey].visible = !currentValue;

    setConfig(newConfig);
  };

  const handleSaveConfig = async () => {
    if (!selectedTenant || !config) return;

    setSaving(true);
    try {
      const response = await fetch('/.netlify/functions/tenant-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateConfig',
          tenantId: selectedTenant,
          config: config
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        showMessage('success', 'Configuration saved successfully!');
      } else {
        showMessage('error', data.error || 'Failed to save configuration');
      }
    } catch (error) {
      console.error('Error saving config:', error);
      showMessage('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const renderNavItem = (key: string, item: NavItem, path: string[]) => {
    if (item.section && item.items) {
      return (
        <div key={key} className="nav-section">
          <div className="section-header">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={item.visible}
                onChange={() => handleToggleMenuItem([...path, key, 'visible'], item.visible)}
              />
              <span className="section-title">{item.label}</span>
            </label>
          </div>
          <div className="section-items">
            {Object.entries(item.items).map(([subKey, subItem]) =>
              renderNavItem(subKey, subItem, [...path, key, 'items'])
            )}
          </div>
        </div>
      );
    }

    return (
      <div key={key} className="nav-item">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={item.visible}
            onChange={() => handleToggleMenuItem([...path, key, 'visible'], item.visible)}
          />
          <span className="item-label">{item.label}</span>
          <span className="item-path">{item.path}</span>
        </label>
      </div>
    );
  };

  return (
    <div className="tenant-admin">
      <div className="admin-header">
        <h1>Tenant Administration</h1>
        <p>Configure menu items and features for each tenant</p>
      </div>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="admin-content">
        <div className="tenant-selector">
          <label htmlFor="tenant-select">Select Tenant:</label>
          <select
            id="tenant-select"
            value={selectedTenant}
            onChange={(e) => setSelectedTenant(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select a tenant --</option>
            {tenants.map(tenant => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="loading">Loading configuration...</div>
        )}

        {!loading && config && (
          <div className="config-editor">
            <div className="config-section">
              <h2>Navigation Menu Items</h2>
              <div className="nav-items-list">
                {Object.entries(config.navigation).map(([key, item]) =>
                  renderNavItem(key, item, ['navigation'])
                )}
              </div>
            </div>

            <div className="config-section">
              <h2>Business Type</h2>
              <div className="business-type">
                <span className="business-type-value">{config.businessType}</span>
              </div>
            </div>

            <div className="config-section">
              <h2>Enabled Features</h2>
              <div className="features-list">
                {Object.entries(config.features).map(([key, value]) => (
                  <div key={key} className="feature-item">
                    <label className="toggle-label">
                      <input
                        type="checkbox"
                        checked={value}
                        onChange={() => {
                          setConfig({
                            ...config,
                            features: {
                              ...config.features,
                              [key]: !value
                            }
                          });
                        }}
                      />
                      <span className="feature-label">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="save-section">
              <button
                className="save-button"
                onClick={handleSaveConfig}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        )}

        {!loading && !config && selectedTenant && (
          <div className="no-config">
            No configuration found for this tenant.
          </div>
        )}
      </div>
    </div>
  );
}