// src/pages/EditPartner.tsx
import { Link, useParams } from 'react-router-dom'

export default function EditPartner() {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3>Edit Partner</h3>
        <Link to={id ? `/partners/${id}` : '/partners'} className="helper">Cancel</Link>
      </div>

      <div style={{ marginTop: 20 }}>
        <p className="helper">
          Partner editing functionality coming soon.
        </p>
        <p className="helper" style={{ marginTop: 12 }}>
          Will include fields for: name, contact info, address, payment details, etc.
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <Link to={id ? `/partners/${id}` : '/partners'}>
          <button className="primary">Back to Partner</button>
        </Link>
      </div>
    </div>
  )
}