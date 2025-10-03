// src/components/PrintDialog.tsx
import { useState, useEffect } from 'react'
import { PrintManager } from '../lib/printManager'
import type { PrintOptions } from '../lib/printManager'


interface PrintDialogProps {
  isOpen: boolean
  onClose: () => void
  options: PrintOptions | null
}

export default function PrintDialog({ isOpen, onClose, options }: PrintDialogProps) {
  const [localOptions, setLocalOptions] = useState<PrintOptions | null>(options)

  useEffect(() => {
    setLocalOptions(options)
  }, [options])

  if (!isOpen || !localOptions) return null

  const handleToggleSection = (id: string) => {
    setLocalOptions(prev => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map(s => 
          s.id === id ? { ...s, selected: !s.selected } : s
        )
      }
    })
  }

  const handleSelectAll = () => {
    setLocalOptions(prev => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map(s => ({ ...s, selected: true }))
      }
    })
  }

  const handleDeselectAll = () => {
    setLocalOptions(prev => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map(s => ({ ...s, selected: false }))
      }
    })
  }

  const handlePrint = () => {
    if (localOptions) {
      PrintManager.print(localOptions)
      onClose()
    }
  }

  const handlePreview = () => {
    if (localOptions) {
      PrintManager.openPreview(localOptions)
    }
  }

  const selectedCount = localOptions.sections.filter(s => s.selected).length

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div 
        className="card"
        style={{
          maxWidth: 500,
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          margin: 20
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Print to PDF</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: 24,
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Select sections to print</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="helper" onClick={handleSelectAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                Select all
              </button>
              <span className="helper">|</span>
              <button className="helper" onClick={handleDeselectAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                Deselect all
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {localOptions.sections.map(section => (
              <label
                key={section.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: 8,
                  border: '1px solid #eee',
                  borderRadius: 4,
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={section.selected}
                  onChange={() => handleToggleSection(section.id)}
                  style={{ cursor: 'pointer' }}
                />
                <span>{section.title}</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: 8, backgroundColor: 'var(--panel)', borderRadius: 4 }}>
            <span className="helper">
              {selectedCount} of {localOptions.sections.length} sections selected
            </span>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={handlePreview}
            disabled={selectedCount === 0}
            style={{
              padding: '8px 16px',
              border: '1px solid #ddd',
              borderRadius: 4,
              background: 'white',
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              opacity: selectedCount === 0 ? 0.5 : 1
            }}
          >
            Preview
          </button>
          <button
            onClick={handlePrint}
            disabled={selectedCount === 0}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: 4,
              background: selectedCount === 0 ? '#ccc' : '#007bff',
              color: 'white',
              cursor: selectedCount === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            Print to PDF
          </button>
        </div>
      </div>
    </div>
  )
}