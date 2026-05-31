import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { cropToSquare } from '../lib/imageUtils'

interface ImagePickerProps {
  label: string
  value: string | null
  onChange: (dataUrl: string | null) => void
}

export function ImagePicker({ label, value, onChange }: ImagePickerProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) return
    try {
      const dataUrl = await cropToSquare(file, 600)
      onChange(dataUrl)
    } catch {}
  }

  return (
    <div style={{ marginTop: 12 }}>
      <label>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <div
          onClick={() => inputRef.current?.click()}
          style={{
            width: 80, height: 80,
            border: '1.5px dashed var(--border)',
            borderRadius: 10,
            cursor: 'pointer',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--input-bg)',
            flexShrink: 0,
          }}
        >
          {value
            ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 28, color: 'var(--muted)', lineHeight: 1 }}>+</span>
          }
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textAlign: 'left', fontSize: 'inherit', color: 'inherit' }}
          >
            {value ? t('products.changeImage') : t('products.addImage')}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textAlign: 'left', fontSize: 'inherit', color: 'var(--color-error)' }}
            >
              {t('products.removeImage')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={e => {
          if (e.target.files?.[0]) { handleFile(e.target.files[0]); e.target.value = '' }
        }}
      />
    </div>
  )
}
