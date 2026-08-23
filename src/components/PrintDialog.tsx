// src/components/PrintDialog.tsx
import { useState, useEffect, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { PrintManager } from '../lib/printManager'
import type { PrintOptions, PrintSettings } from '../lib/printManager'

interface PrintDialogProps {
  isOpen: boolean
  onClose: () => void
  options: PrintOptions | null
  onPrint?: (settings: PrintSettings, selectedIds: string[]) => void
}

type TimePeriod = 'all' | 'thisYear' | 'lastThreeMonths'

const radioLabel: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer',
}
const radioInput: CSSProperties = {
  cursor: 'pointer', width: 16, height: 16, margin: 0, flexShrink: 0,
}
const checkLabel: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer',
}
const checkInput: CSSProperties = {
  cursor: 'pointer', width: 16, height: 16, margin: 0, flexShrink: 0,
}

export default function PrintDialog({ isOpen, onClose, options, onPrint }: PrintDialogProps) {
  const { t } = useTranslation()
  const [localOptions, setLocalOptions] = useState<PrintOptions | null>(options)
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all')
  const [sortByDate, setSortByDate] = useState(false)
  const [sortByCustomer, setSortByCustomer] = useState(true)

  useEffect(() => { setLocalOptions(options) }, [options])

  if (!isOpen || !localOptions) return null

  const handleToggleSection = (id: string) => {
    setLocalOptions(prev => {
      if (!prev) return prev
      return { ...prev, sections: prev.sections.map(s => s.id === id ? { ...s, selected: !s.selected } : s) }
    })
  }

  const handleSelectAll = () => {
    setLocalOptions(prev => prev ? { ...prev, sections: prev.sections.map(s => ({ ...s, selected: true })) } : prev)
  }

  const handleDeselectAll = () => {
    setLocalOptions(prev => prev ? { ...prev, sections: prev.sections.map(s => ({ ...s, selected: false })) } : prev)
  }

  const handlePrint = () => {
    if (!localOptions) return
    const printSettings: PrintSettings = {
      ...localOptions,
      includeAll:      timePeriod === 'all',
      thisYear:        timePeriod === 'thisYear',
      lastThreeMonths: timePeriod === 'lastThreeMonths',
      sortByDate,
      sortByCustomer,
    }
    const selectedIds = localOptions.sections.filter(s => s.selected).map(s => s.id)
    if (onPrint) {
      onPrint(printSettings, selectedIds)
    } else {
      PrintManager.print(printSettings as any)
    }
    onClose()
  }

  const selectedCount = localOptions.sections.filter(s => s.selected).length

  const sectionDivider = (
    <div style={{ borderTop: '1px solid var(--separator, #eee)', margin: '16px 0' }} />
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 460, width: 'min(460px, calc(100vw - 32px))', maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden', margin: '16px auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{t('printDialog.title')}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* ── 1. Sections to print ── */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h4 style={{ margin: 0 }}>{t('printDialog.sectionsToPrint')}</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="helper" onClick={handleSelectAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{t('printDialog.selectAll')}</button>
              <span className="helper">|</span>
              <button className="helper" onClick={handleDeselectAll} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>{t('printDialog.deselectAll')}</button>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {localOptions.sections.map(section => (
              <label key={section.id} style={checkLabel}>
                <input type="checkbox" checked={section.selected} onChange={() => handleToggleSection(section.id)} style={checkInput} />
                <span style={{ flex: 1 }}>{section.title}</span>
              </label>
            ))}
          </div>
        </div>

        {sectionDivider}

        {/* ── 2. Time period ── */}
        <div>
          <h4 style={{ margin: '0 0 10px' }}>{t('printDialog.timePeriod', 'Time period')}</h4>
          <div style={{ display: 'grid', gap: 4 }}>
            {([
              ['all',            t('printDialog.allTime', 'All time')],
              ['thisYear',       t('printDialog.thisYear', 'This year')],
              ['lastThreeMonths', t('printDialog.lastThreeMonths', 'Last 3 months')],
            ] as [TimePeriod, string][]).map(([val, label]) => (
              <label key={val} style={radioLabel}>
                <input type="radio" name="timePeriod" value={val} checked={timePeriod === val} onChange={() => setTimePeriod(val)} style={radioInput} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {sectionDivider}

        {/* ── 3. More options ── */}
        <div>
          <h4 style={{ margin: '0 0 10px' }}>{t('printDialog.moreOptions')}</h4>
          <div style={{ display: 'grid', gap: 4 }}>
            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={sortByDate}
                onChange={(e) => { setSortByDate(e.target.checked); if (e.target.checked) setSortByCustomer(false) }}
                style={checkInput}
              />
              <span>{t('printDialog.sortByDate')}</span>
            </label>
            <label style={checkLabel}>
              <input
                type="checkbox"
                checked={sortByCustomer}
                onChange={(e) => { setSortByCustomer(e.target.checked); if (e.target.checked) setSortByDate(false) }}
                style={checkInput}
              />
              <span>{t('printDialog.sortByCustomer')}</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={handlePrint}
            disabled={selectedCount === 0}
            style={{
              padding: '8px 16px', border: 'none', borderRadius: 4,
              background: selectedCount === 0 ? '#ccc' : '#007bff',
              color: 'white', cursor: selectedCount === 0 ? 'not-allowed' : 'pointer', fontWeight: 500,
            }}
          >
            {t('printDialog.printToPdf')}
          </button>
        </div>
      </div>
    </div>
  )
}