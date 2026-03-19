// DateInput.tsx
// Displays dates in the tenant's locale format while keeping YYYY-MM-DD as the
// internal value. The visible text input shows the formatted date; clicking it
// opens the native date picker via showPicker() / focus().
import { useRef } from 'react'
import { useLocale } from '../contexts/LocaleContext'

interface DateInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'value'> {
  value: string           // YYYY-MM-DD or ''
  onChange: (value: string) => void
}

export function DateInput({ value, onChange, style, className, disabled, ...rest }: DateInputProps) {
  const { locale } = useLocale()
  const nativeRef = useRef<HTMLInputElement>(null)

  // Format for display — strip any time component first, then parse at noon to avoid DST edge cases
  const dateOnly = value ? value.split('T')[0] : ''
  const displayValue = (() => {
    if (!dateOnly) return ''
    const d = new Date(dateOnly + 'T12:00:00')
    if (isNaN(d.getTime())) return dateOnly // fallback: show raw if unparseable
    return new Intl.DateTimeFormat(locale).format(d)
  })()

  function openPicker() {
    if (disabled) return
    const el = nativeRef.current
    if (!el) return
    if (typeof (el as any).showPicker === 'function') {
      try { (el as any).showPicker() } catch { el.focus() }
    } else {
      el.focus()
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {/* Visible: locale-formatted text */}
      <input
        type="text"
        readOnly
        value={displayValue}
        placeholder="—"
        onClick={openPicker}
        disabled={disabled}
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
        className={className}
      />
      {/* Hidden: native date picker — handles actual value & calendar */}
      <input
        ref={nativeRef}
        type="date"
        value={dateOnly}
        onChange={e => onChange(e.target.value)}
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        style={{
          position: 'absolute', top: 0, left: 0,
          width: '100%', height: '100%',
          opacity: 0, pointerEvents: disabled ? 'none' : 'all',
          cursor: 'pointer',
        }}
        {...rest}
      />
    </div>
  )
}
