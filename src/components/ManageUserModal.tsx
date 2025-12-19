import { useState, useEffect } from 'react';
import '../styles/Modal.css';

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
      const res = await fetch(`${base}/.netlify/functions/super-admin?action=getUserDetails&userId=${userId}`, {
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
      const res = await fetch(`${base}/.netlify/functions/super-admin?action=listTenants`, {
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
      const res = await fetch(`${base}/.netlify/functions/super-admin`, {
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
      const res = await fetch(`${base}/.netlify/functions/super-admin`, {
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

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Loading...</h2>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>User not found</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
        </div>
      </div>
    );
  }

  // Filter out tenants user is already a member of
  const unassignedTenants = availableTenants.filter(
    t => !memberships.some(m => m.tenant_id === t.id)
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>Manage User: {user.email}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Current Memberships */}
          <div style={{ marginBottom: 24 }}>
            <h3>Current Tenant Memberships</h3>
            {memberships.length === 0 ? (
              <p style={{ color: '#666' }}>No tenant memberships yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {memberships.map(m => (
                  <div
                    key={m.tenant_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#f5f5f5',
                      borderRadius: 4
                    }}
                  >
                    <div>
                      <strong>{m.tenant_name}</strong>
                      <span style={{ marginLeft: 12, color: '#666' }}>
                        ({m.role === 'tenant_admin' ? 'Admin' : 'User'})
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveMembership(m.tenant_id)}
                      style={{
                        padding: '4px 12px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
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
            <h3>Add to Tenant</h3>
            {unassignedTenants.length === 0 ? (
              <p style={{ color: '#666' }}>User is already a member of all tenants</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>Tenant</label>
                  <select
                    value={selectedTenant}
                    onChange={e => setSelectedTenant(e.target.value)}
                    disabled={adding}
                    style={{ width: '100%', padding: 8 }}
                  >
                    <option value="">Select tenant...</option>
                    {unassignedTenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: 4 }}>Role</label>
                  <select
                    value={selectedRole}
                    onChange={e => setSelectedRole(e.target.value)}
                    disabled={adding}
                    style={{ width: '100%', padding: 8 }}
                  >
                    <option value="tenant_user">User</option>
                    <option value="tenant_admin">Admin</option>
                  </select>
                </div>

                <button
                  onClick={handleAddMembership}
                  disabled={!selectedTenant || adding}
                  style={{
                    padding: '8px 16px',
                    background: selectedTenant ? '#28a745' : '#ccc',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: selectedTenant ? 'pointer' : 'not-allowed'
                  }}
                >
                  {adding ? 'Adding...' : 'Add Membership'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}