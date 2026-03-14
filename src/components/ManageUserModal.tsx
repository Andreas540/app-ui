import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface User {
  id: string;
  email: string;
  name: string | null;
  active: boolean;
}

interface Membership {
  tenant_id: string;
  tenant_name: string;
  role: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface ManageUserModalProps {
  userId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ManageUserModal({ userId, onClose, onUpdate }: ManageUserModalProps) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedRole, setSelectedRole] = useState('tenant_user');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [userActive, setUserActive] = useState(true);
  const [togglingStatus, setTogglingStatus] = useState(false);

  useEffect(() => {
    loadUserDetails();
    loadTenants();
  }, [userId]);

  async function loadUserDetails() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${base}/api/super-admin?action=getUserDetails&userId=${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setMemberships(data.memberships || []);
        setUserActive(data.user.active ?? true);
      }
    } catch (e) {
      console.error('Failed to load user details:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadTenants() {
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${base}/api/super-admin?action=listTenants`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableTenants(data.tenants || []);
      }
    } catch (e) {
      console.error('Failed to load tenants:', e);
    }
  }

  async function handleToggleUserStatus() {
    try {
      setTogglingStatus(true);
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      const token = localStorage.getItem('authToken');

      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'toggleUserStatus',
          userId: userId,
          isActive: !userActive
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update status');
      }

      await loadUserDetails();
      onUpdate();
    } catch (e: any) {
      alert(e?.message || 'Failed to update status');
    } finally {
      setTogglingStatus(false);
    }
  }

  async function handleAddMembership() {
    if (!selectedTenant) return;

    setAdding(true);
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'addUserToTenant',
          userId,
          tenantId: selectedTenant,
          role: selectedRole
        })
      });

      if (res.ok) {
        await loadUserDetails();
        setSelectedTenant('');
        setSelectedRole('tenant_user');
        onUpdate();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add membership');
      }
    } catch (e) {
      console.error('Failed to add membership:', e);
      alert('Failed to add membership');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemoveMembership(tenantId: string) {
    if (!confirm('Remove this user from the tenant?')) return;

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : '';
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${base}/api/super-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: 'removeUserFromTenant',
          userId,
          tenantId
        })
      });

      if (res.ok) {
        await loadUserDetails();
        onUpdate();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to remove membership');
      }
    } catch (e) {
      console.error('Failed to remove membership:', e);
      alert('Failed to remove membership');
    }
  }

  const unassignedTenants = availableTenants.filter(
    t => !memberships.some(m => m.tenant_id === t.id)
  );

  const CONTROL_H = 44;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: 600,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          margin: 0
        }}
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <p>{t('loading')}</p>
        ) : !user ? (
          <>
            <h3>{t('manageUserModal.userNotFound')}</h3>
            <button onClick={onClose}>{t('close')}</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0 }}>{t('manageUserModal.heading')} {user.email}</h3>
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="helper" style={{ fontSize: 13 }}>{t('manageUserModal.status')}</span>
                  <button
  onClick={handleToggleUserStatus}
  disabled={togglingStatus}
  style={{
    height: 32,
    padding: '0 16px',
    fontSize: 12,
    background: userActive ? '#4CAF50' : '#ff6b6b',
    border: userActive ? '1px solid #4CAF50' : '1px solid #ff6b6b',
    color: 'white',
  }}
>
  {togglingStatus ? t('manageUserModal.updating') : (userActive ? t('active') : t('inactive'))}
</button>
                </div>
              </div>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 28,
                  cursor: 'pointer',
                  padding: 0,
                  width: 32,
                  height: 32,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Current Memberships */}
            <div style={{ marginBottom: 24 }}>
              <h4>{t('manageUserModal.currentTenants')}</h4>
              {memberships.length === 0 ? (
                <p className="helper">{t('manageUserModal.noMemberships')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {memberships.map(m => (
                    <div
                      key={m.tenant_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        background: 'var(--bg-secondary, #f5f5f5)',
                        borderRadius: 4,
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div>
                        <strong>{m.tenant_name}</strong>
                        <span className="helper" style={{ marginLeft: 12 }}>
                          ({m.role === 'tenant_admin' ? t('manageUserModal.adminRole') : t('manageUserModal.userRole')})
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemoveMembership(m.tenant_id)}
                        style={{
                          padding: '6px 12px',
                          background: 'salmon',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 13
                        }}
                      >
                        {t('remove')}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Membership */}
            <div>
              <h4>{t('manageUserModal.addToTenant')}</h4>
              {unassignedTenants.length === 0 ? (
                <p className="helper">{t('manageUserModal.allTenantsAssigned')}</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label>{t('tenant')}</label>
                    <select
                      value={selectedTenant}
                      onChange={e => setSelectedTenant(e.target.value)}
                      disabled={adding}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="">{t('manageUserModal.selectTenant')}</option>
                      {unassignedTenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>{t('role')}</label>
                    <select
                      value={selectedRole}
                      onChange={e => setSelectedRole(e.target.value)}
                      disabled={adding}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="tenant_user">{t('userRole')}</option>
                      <option value="tenant_admin">{t('adminRole')}</option>
                    </select>
                  </div>

                  <button
                    className="primary"
                    onClick={handleAddMembership}
                    disabled={!selectedTenant || adding}
                    style={{ height: CONTROL_H }}
                  >
                    {adding ? t('manageUserModal.adding') : t('manageUserModal.addMembership')}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
