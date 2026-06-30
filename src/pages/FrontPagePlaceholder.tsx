import { useAuth } from '../contexts/AuthContext'

export default function FrontPagePlaceholder({ onContinue }: { onContinue: () => void }) {
  const { user } = useAuth()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      padding: 24, background: 'var(--bg)', color: 'var(--text)',
    }}>
      <h1 style={{ margin: 0, marginBottom: 8 }}>{user?.businessType ?? 'Front page'}</h1>
      <p className="helper" style={{ marginBottom: 24, maxWidth: 360 }}>
        Placeholder front page — assign a real design to this business type in SuperAdmin once it's ready.
      </p>
      <button className="primary" onClick={onContinue} style={{ height: 40, padding: '0 24px' }}>
        Continue to app
      </button>
    </div>
  )
}
