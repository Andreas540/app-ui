import { useState, useEffect } from 'react'

interface InventoryItem {
  item_name: string
  variation_name: string | null
  location_id: string
  location_name: string | null
  quantity: number
  days_of_inventory_remaining: number | null
}

interface Location {
  location_id: string
  location_name: string
}

interface SalesStats {
  today: number
  yesterday: number
  thisWeek: number
  lastWeek: number
  lastUpdate: string
}

// Money format helper
function fmtIntMoney(n: number) {
  const v = Number(n) || 0
  const sign = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
}

export default function DashboardStore() {
  const [showInventory, setShowInventory] = useState(false)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<string>('')
  const [sortBy, setSortBy] = useState<'item_name' | 'quantity' | 'days'>('item_name')
  const [loading, setLoading] = useState(false)
  const [salesStats, setSalesStats] = useState<SalesStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Load sales stats on mount
  useEffect(() => {
    loadSalesStats()
  }, [])

  async function loadSalesStats() {
    try {
      setStatsLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')

      const res = await fetch(`${base}/api/pos-sales-stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
        }
      })

      if (res.ok) {
        const data = await res.json()
        setSalesStats(data.stats)
      }
    } catch (e) {
      console.error('Failed to load sales stats:', e)
    } finally {
      setStatsLoading(false)
    }
  }

  async function loadInventory() {
    try {
      setLoading(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const token = localStorage.getItem('authToken')
      const activeTenantId = localStorage.getItem('activeTenantId')

      const locationParam = selectedLocation ? `?location=${selectedLocation}` : ''
      const res = await fetch(`${base}/api/pos-inventory${locationParam}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...(activeTenantId ? { 'X-Active-Tenant': activeTenantId } : {})
        }
      })

      if (res.ok) {
        const data = await res.json()
        setInventory(data.inventory || [])
        setLocations(data.locations || [])
      }
    } catch (e) {
      console.error('Failed to load inventory:', e)
    } finally {
      setLoading(false)
    }
  }

  function handleViewInventory() {
    if (!showInventory) {
      loadInventory()
    }
    setShowInventory(!showInventory)
  }

  // Reload inventory when location filter changes
  useEffect(() => {
    if (showInventory) {
      loadInventory()
    }
  }, [selectedLocation])

  // Sort inventory
  const sortedInventory = [...inventory].sort((a, b) => {
    if (sortBy === 'item_name') {
      return (a.item_name || '').localeCompare(b.item_name || '')
    } else if (sortBy === 'quantity') {
      return (b.quantity || 0) - (a.quantity || 0)
    } else {
      // days_of_inventory_remaining
      const aDays = a.days_of_inventory_remaining ?? 999999
      const bDays = b.days_of_inventory_remaining ?? 999999
      return aDays - bDays
    }
  })

  // Format last update time
  const lastUpdateFormatted = salesStats?.lastUpdate 
    ? new Date(salesStats.lastUpdate).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : ''

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      {/* Sales Stats */}
      <div className="card" style={{ marginBottom: 20 }}>
        {statsLoading ? (
          <div className="helper">Loading sales...</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {/* Today */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Today</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(salesStats?.today || 0)}
              </div>
            </div>

            {/* Yesterday */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Yesterday</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(salesStats?.yesterday || 0)}
              </div>
            </div>

            {/* This Week */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>This Week</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(salesStats?.thisWeek || 0)}
              </div>
            </div>

            {/* Last Week */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--text)' }}>Last Week</div>
              <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 18 }}>
                {fmtIntMoney(salesStats?.lastWeek || 0)}
              </div>
            </div>

            {/* Last Update */}
            {lastUpdateFormatted && (
              <div
                style={{
                  marginTop: 8,
                  paddingTop: 8,
                  borderTop: '1px solid #eee'
                }}
              >
                <div className="helper" style={{ fontSize: 12 }}>
                  Last update: {lastUpdateFormatted}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* View Inventory Button */}
      <div className="card" style={{ marginBottom: 20 }}>
        <button
          className="primary"
          onClick={handleViewInventory}
          style={{ height: 44, width: '100%' }}
        >
          {showInventory ? 'Hide Inventory' : 'View Inventory'}
        </button>
      </div>

      {/* Inventory List */}
      {showInventory && (
        <div className="card">
          <h3 style={{ margin: 0, marginBottom: 16 }}>Inventory</h3>

          {/* Location Filter & Sort */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Filter by Location</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                style={{ height: 44, width: '100%' }}
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.location_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                style={{ height: 44, width: '100%' }}
              >
                <option value="item_name">Item Name</option>
                <option value="quantity">Quantity</option>
                <option value="days">Days Remaining</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="helper">Loading inventory...</div>
          ) : sortedInventory.length === 0 ? (
            <div className="helper">No inventory items found</div>
          ) : (
            <>
              {/* Header Row */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                  gap: 8,
                  paddingBottom: 8,
                  marginBottom: 8,
                  borderBottom: '2px solid var(--border)',
                  fontWeight: 600,
                  fontSize: 13
                }}
              >
                <div>Item</div>
                <div>Variation</div>
                <div style={{ textAlign: 'right' }}>In Stock</div>
                <div style={{ textAlign: 'right' }}>Will Last</div>
              </div>

              {/* Inventory Rows */}
              {sortedInventory.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1.5fr 1fr 1fr',
                    gap: 8,
                    paddingTop: 8,
                    paddingBottom: 8,
                    borderBottom: '1px solid #eee',
                    fontSize: 14
                  }}
                >
                  <div>{item.item_name || '-'}</div>
                  <div className="helper">{item.variation_name || '-'}</div>
                  <div style={{ textAlign: 'right' }}>{item.quantity?.toLocaleString('en-US') || 0}</div>
                  <div style={{ textAlign: 'right' }} className="helper">
                    {item.days_of_inventory_remaining != null 
                      ? `${item.days_of_inventory_remaining.toFixed(2)} days`
                      : '-'
                    }
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}