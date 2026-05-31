import { useEffect } from 'react'

interface LightboxProps {
  src: string
  onClose: () => void
}

export function Lightbox({ src, onClose }: LightboxProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'zoom-out',
      }}
    >
      <img
        src={src}
        alt=""
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '90vw', maxHeight: '90vh',
          borderRadius: 8,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          cursor: 'default',
          objectFit: 'contain',
        }}
      />
    </div>
  )
}
