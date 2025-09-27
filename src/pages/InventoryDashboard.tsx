export default function InventoryDashboard() {
  return (
    <div className="card" style={{ maxWidth: 960 }}>
      <h3>Inventory Dashboard</h3>
      
      <div className="grid" style={{ marginTop: 20 }}>
        <div className="card">
          <h4>Stock Overview</h4>
          <div className="big">1,247</div>
          <div className="helper">Total items in stock</div>
        </div>
        
        <div className="card">
          <h4>Low Stock Alerts</h4>
          <div className="big" style={{ color: '#ff6b6b' }}>23</div>
          <div className="helper">Items below threshold</div>
        </div>
        
        <div className="card">
          <h4>Recent Deliveries</h4>
          <div className="big">5</div>
          <div className="helper">This week</div>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>Quick Actions</h4>
        <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
          <button className="primary">Add New Product</button>
          <button className="primary">Record Delivery</button>
          <button className="primary">Update Stock</button>
          <button className="primary">Generate Report</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>Recent Activity</h4>
        <div style={{ marginTop: 12 }}>
          <div className="helper">This is a placeholder for inventory functionality that will be built later.</div>
          <ul style={{ marginTop: 8, paddingLeft: 16 }}>
            <li>Stock update: ACE Ultra (+500 units)</li>
            <li>Low stock alert: Cool Breeze (15 remaining)</li>
            <li>New delivery: Favorites (+1000 units)</li>
            <li>Stock adjustment: Boutiq (-25 units)</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
