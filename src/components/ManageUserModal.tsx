import { useState, useEffect } from 'react';

interface User {
  id: string;
  email: string;
  name: string | null;
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
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedRole, setSelectedRole] = useState('tenant_user');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

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

  // Filter out tenants user is already a member of
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
          <p>Loading...</p>
        ) : !user ? (
          <>
            <h3>User not found</h3>
            <button onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Manage User: {user.email}</h3>
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
              <h4>Current Tenant Memberships</h4>
              {memberships.length === 0 ? (
                <p className="helper">No tenant memberships yet</p>
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
                          ({m.role === 'tenant_admin' ? 'Admin' : 'User'})
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
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add New Membership */}
            <div>
              <h4>Add to Tenant</h4>
              {unassignedTenants.length === 0 ? (
                <p className="helper">User is already a member of all tenants</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label>Tenant</label>
                    <select
                      value={selectedTenant}
                      onChange={e => setSelectedTenant(e.target.value)}
                      disabled={adding}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="">Select tenant...</option>
                      {unassignedTenants.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label>Role</label>
                    <select
                      value={selectedRole}
                      onChange={e => setSelectedRole(e.target.value)}
                      disabled={adding}
                      style={{ height: CONTROL_H }}
                    >
                      <option value="tenant_user">User</option>
                      <option value="tenant_admin">Admin</option>
                    </select>
                  </div>

                  <button
                    className="primary"
                    onClick={handleAddMembership}
                    disabled={!selectedTenant || adding}
                    style={{ height: CONTROL_H }}
                  >
                    {adding ? 'Adding...' : 'Add Membership'}
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