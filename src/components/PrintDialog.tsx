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
  const [includeAll, setIncludeAll] = useState(true)
  const [lastThreeMonths, setLastThreeMonths] = useState(false)
  const [sortByDate, setSortByDate] = useState(false)
  const [sortByCustomer, setSortByCustomer] = useState(true)

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

  const handleIncludeAllChange = (checked: boolean) => {
    setIncludeAll(checked)
    if (checked) {
      setLastThreeMonths(false)
    }
  }

  const handleLastThreeMonthsChange = (checked: boolean) => {
    setLastThreeMonths(checked)
    if (checked) {
      setIncludeAll(false)
    }
  }

  const handleSortByDateChange = (checked: boolean) => {
    setSortByDate(checked)
    if (checked) {
      setSortByCustomer(false)
    }
  }

  const handleSortByCustomerChange = (checked: boolean) => {
    setSortByCustomer(checked)
    if (checked) {
      setSortByDate(false)
    }
  }

  const handlePrint = () => {
    if (localOptions) {
      // Pass filter/sort options to print manager
      const printSettings = {
        ...localOptions,
        includeAll,
        lastThreeMonths,
        sortByDate,
        sortByCustomer
      }
      PrintManager.print(printSettings as any)
      onClose()
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
            <h4 style={{ margin: 0 }}>Sections to print</h4>
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

          {/* Section checkboxes - tighter spacing */}
          <div style={{ display: 'grid', gap: 4 }}>
            {localOptions.sections.map(section => (
              <label
                key={section.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={section.selected}
                  onChange={() => handleToggleSection(section.id)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    margin: 0,
                    flexShrink: 0
                  }}
                />
                <span style={{ flex: 1 }}>
                  {section.title}
                </span>
              </label>
            ))}
          </div>

          {/* Filter and Sort Options */}
          <div style={{ marginTop: 20, borderTop: '1px solid #eee', paddingTop: 16 }}>
            <h4 style={{ margin: '0 0 12px 0' }}>More options</h4>
            
            <div style={{ display: 'grid', gap: 4 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={includeAll}
                  onChange={(e) => handleIncludeAllChange(e.target.checked)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    margin: 0,
                    flexShrink: 0
                  }}
                />
                <span style={{ flex: 1 }}>
                  Include all orders and payments
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={lastThreeMonths}
                  onChange={(e) => handleLastThreeMonthsChange(e.target.checked)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    margin: 0,
                    flexShrink: 0
                  }}
                />
                <span style={{ flex: 1 }}>
                  Include last 3 months only
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={sortByDate}
                  onChange={(e) => handleSortByDateChange(e.target.checked)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    margin: 0,
                    flexShrink: 0
                  }}
                />
                <span style={{ flex: 1 }}>
                  Sort by order date
                </span>
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 0',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="checkbox"
                  checked={sortByCustomer}
                  onChange={(e) => handleSortByCustomerChange(e.target.checked)}
                  style={{
                    cursor: 'pointer',
                    width: 16,
                    height: 16,
                    margin: 0,
                    flexShrink: 0
                  }}
                />
                <span style={{ flex: 1 }}>
                  Sort by customer
                </span>
              </label>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
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