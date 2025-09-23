import { Link, useParams } from 'react-router-dom'

export default function PartnerDetail() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="card" style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Partner Details</h3>
        <Link to="/partners" className="helper">&larr; Back to partners</Link>
      </div>
      
      <div style={{ marginTop: 20, textAlign: 'center', padding: '40px 20px' }}>
        <p className="helper" style={{ fontSize: 18 }}>
          Partner detail page for ID: {id}
        </p>
        <p className="helper">
          Partner detail functionality coming soon...
        </p>
      </div>
    </div>
  )
}