import { Link } from 'react-router-dom'

export default function CreatePartner() {
  return (
    <div className="card" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Create New Partner</h3>
        <Link to="/partners" className="helper">&larr; Back to partners</Link>
      </div>
      
      <div style={{ marginTop: 20, textAlign: 'center', padding: '40px 20px' }}>
        <p className="helper" style={{ fontSize: 18 }}>
          Partner creation functionality coming soon...
        </p>
      </div>
    </div>
  )
}