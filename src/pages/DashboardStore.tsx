export default function DashboardStore() {
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0 }}>Store Dashboard</h2>
        <p className="helper" style={{ marginTop: 8 }}>
          Manage your physical store operations
        </p>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="helper" style={{ fontSize: 12 }}>Today's Sales</div>
          <div style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>$0.00</div>
        </div>
        <div className="card">
          <div className="helper" style={{ fontSize: 12 }}>Items in Stock</div>
          <div style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>0</div>
        </div>
        <div className="card">
          <div className="helper" style={{ fontSize: 12 }}>Low Stock Items</div>
          <div style={{ fontSize: 32, fontWeight: 600, marginTop: 8, color: 'salmon' }}>0</div>
        </div>
        <div className="card">
          <div className="helper" style={{ fontSize: 12 }}>Active Categories</div>
          <div style={{ fontSize: 32, fontWeight: 600, marginTop: 8 }}>0</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <h3>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
          <button className="primary" style={{ height: 44 }}>
            View Inventory
          </button>
          <button style={{ height: 44 }}>
            Sales Report
          </button>
          <button style={{ height: 44 }}>
            Manage Categories
          </button>
          <button style={{ height: 44 }}>
            POS Transactions
          </button>
        </div>
      </div>

      {/* Recent Activity Placeholder */}
      <div className="card" style={{ marginTop: 20 }}>
        <h3>Recent Activity</h3>
        <p className="helper">No recent activity</p>
      </div>
    </div>
  )
}