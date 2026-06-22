// src/pages/CustomerImportPage.tsx
// 4-step wizard: Upload → Map columns → Preview/validate → Commit
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getAuthHeaders } from '../lib/api'

// ── Field definitions ─────────────────────────────────────────────────────────

type KnownField =
  | 'name' | 'email' | 'phone' | 'company_name'
  | 'address1' | 'address2' | 'city' | 'state'
  | 'postal_code' | 'country' | 'customer_type' | 'shipping_cost'

const KNOWN_FIELDS: KnownField[] = [
  'name', 'email', 'phone', 'company_name',
  'address1', 'address2', 'city', 'state',
  'postal_code', 'country', 'customer_type', 'shipping_cost',
]

// Synonyms (lowercased) for header-based auto-detection, per plan §8
const SYNONYMS: Record<KnownField, string[]> = {
  name:          ['name', 'full name', 'fullname', 'customer name', 'client name', 'client',
                  'namn', 'kundnamn', 'nombre', 'nombre completo'],
  email:         ['email', 'e-mail', 'email address', 'e-post', 'epost', 'mejl', 'mail',
                  'correo', 'correo electrónico', 'correo electronico'],
  phone:         ['phone', 'phone number', 'mobile', 'mobile number', 'tel', 'telephone', 'cell',
                  'telefon', 'mobil', 'telefono', 'teléfono', 'movil', 'móvil', 'celular'],
  company_name:  ['company', 'company name', 'business', 'organisation', 'organization', 'org',
                  'företag', 'företagsnamn', 'empresa', 'compañia'],
  address1:      ['address', 'address line 1', 'address 1', 'street', 'street address',
                  'adress', 'adress 1', 'gatuadress', 'dirección', 'direccion', 'dirección 1', 'direccion 1'],
  address2:      ['address line 2', 'address 2', 'apt', 'suite',
                  'adress 2', 'lägenhet', 'dirección 2', 'direccion 2'],
  city:          ['city', 'town', 'stad', 'ort', 'ciudad'],
  state:         ['state', 'region', 'province', 'county',
                  'region', 'län', 'estado', 'provincia', 'departamento'],
  postal_code:   ['postal code', 'zip', 'zip code', 'postcode', 'post code',
                  'postnummer', 'código postal', 'codigo postal', 'cp'],
  country:       ['country', 'land', 'país', 'pais'],
  customer_type: ['customer type', 'type', 'kundtyp', 'typ', 'tipo de cliente', 'tipo'],
  shipping_cost: ['shipping cost', 'shipping', 'fraktkostnad', 'frakt', 'costo de envío', 'envío', 'costo de envio'],
}

// Template headers per language (excludes customer_type + shipping_cost per plan §7)
const TEMPLATE_HEADERS: Record<string, string[]> = {
  en: ['Name', 'Email', 'Phone', 'Company', 'Address Line 1', 'Address Line 2', 'City', 'State / Region', 'Postal Code', 'Country'],
  sv: ['Namn', 'E-post', 'Telefon', 'Företag', 'Adressrad 1', 'Adressrad 2', 'Stad', 'Region', 'Postnummer', 'Land'],
  es: ['Nombre', 'Correo electrónico', 'Teléfono', 'Empresa', 'Dirección 1', 'Dirección 2', 'Ciudad', 'Estado / Región', 'Código Postal', 'País'],
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ColMapping = {
  fileHeader: string
  sampleValues: string[]
  mappedTo: KnownField | 'ignore' | 'custom'
  customKey: string    // slug, e.g. "membership_tier"
  customLabel: string  // display label, e.g. "Membership Tier"
}

type MappedRow = Partial<Record<KnownField, string>> & {
  custom_fields?: Record<string, string>
}

type RowError = { rowIndex: number; message: string }

type ImportResult = {
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string }>
}

type ConflictGroup = {
  key: string
  keyType: 'email' | 'phone' | 'name'
  rowIndices: number[]  // indices into validRows
}

// ── Conflict detection & resolution ──────────────────────────────────────────

const LEGAL_SUFFIXES = new Set([
  'llc', 'inc', 'ltd', 'limited', 'corp', 'corporation', 'co', 'company',
  'ab', 'hb', 'kb', 'as', 'oy', 'aps',
  'gmbh', 'bv', 'nv', 'sas', 'sarl', 'sa', 'ag', 'plc',
  'lp', 'llp', 'pc', 'pllc', 'pte', 'sdn', 'bhd', 'pty',
])

function normalizeName(name: string): string {
  let n = name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  let changed = true
  while (changed) {
    changed = false
    const words = n.split(' ')
    if (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1])) {
      words.pop()
      n = words.join(' ')
      changed = true
    }
  }
  return n
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  // Compare on the last 9 digits — strips country code prefixes (+1, 001, +46 etc.)
  // without needing to know the country, while keeping enough digits to avoid false matches
  return digits.length >= 9 ? digits.slice(-9) : digits
}

function detectConflicts(rows: MappedRow[]): ConflictGroup[] {
  const emailMap = new Map<string, number[]>()
  const phoneMap = new Map<string, number[]>()
  const nameMap  = new Map<string, number[]>()
  rows.forEach((row, i) => {
    if (!row.name) return
    const email     = row.email?.toLowerCase().trim()
    const normPhone = row.phone ? normalizePhone(row.phone) : undefined
    const normName  = normalizeName(row.name)
    if (email)     { if (!emailMap.has(email))     emailMap.set(email, []);     emailMap.get(email)!.push(i)     }
    if (normPhone) { if (!phoneMap.has(normPhone)) phoneMap.set(normPhone, []); phoneMap.get(normPhone)!.push(i) }
    if (normName)  { if (!nameMap.has(normName))   nameMap.set(normName, []);   nameMap.get(normName)!.push(i)  }
  })
  const groups: ConflictGroup[] = []
  emailMap.forEach((indices, key) => { if (indices.length > 1) groups.push({ key, keyType: 'email', rowIndices: indices }) })
  phoneMap.forEach((indices, key) => {
    if (indices.length > 1) {
      const alreadyCovered = groups.some(g => g.keyType === 'email' && indices.every(i => g.rowIndices.includes(i)))
      if (!alreadyCovered) groups.push({ key, keyType: 'phone', rowIndices: indices })
    }
  })
  nameMap.forEach((indices, key) => {
    if (indices.length > 1) {
      // Skip if the exact same set of rows is already flagged by an email or phone conflict
      const alreadyCovered = groups.some(g => indices.every(i => g.rowIndices.includes(i)))
      if (!alreadyCovered) groups.push({ key, keyType: 'name', rowIndices: indices })
    }
  })
  return groups
}

function mergeRows(rows: MappedRow[]): MappedRow {
  const merged: MappedRow = {}
  const fields: (keyof MappedRow)[] = ['name', 'email', 'phone', 'company_name', 'address1', 'address2', 'city', 'state', 'postal_code', 'country', 'customer_type', 'shipping_cost']
  for (const field of fields) {
    for (const row of rows) {
      const val = (row as any)[field]
      if (val && !(merged as any)[field]) { (merged as any)[field] = val; break }
    }
  }
  const custom: Record<string, string> = {}
  for (const row of rows) {
    if (row.custom_fields) Object.entries(row.custom_fields).forEach(([k, v]) => { if (v && !custom[k]) custom[k] = v })
  }
  if (Object.keys(custom).length > 0) merged.custom_fields = custom
  return merged
}

function applyResolutions(
  rows: MappedRow[],
  conflicts: ConflictGroup[],
  resolutions: Record<string, 'merge' | 'separate'>
): (MappedRow & { _no_dedup?: boolean })[] {
  const mergedOverrides = new Map<number, MappedRow>()
  const skipIndices = new Set<number>()
  const nodedupIndices = new Set<number>()

  for (const g of conflicts) {
    const res = resolutions[g.key] ?? 'merge'
    if (res === 'merge') {
      mergedOverrides.set(g.rowIndices[0], mergeRows(g.rowIndices.map(i => rows[i])))
      g.rowIndices.slice(1).forEach(i => skipIndices.add(i))
    } else {
      g.rowIndices.forEach(i => nodedupIndices.add(i))
    }
  }

  return rows
    .map((row, i): (MappedRow & { _no_dedup?: boolean }) | null => {
      if (skipIndices.has(i)) return null
      if (mergedOverrides.has(i)) return mergedOverrides.get(i)!
      if (nodedupIndices.has(i)) return { ...row, _no_dedup: true }
      return row
    })
    .filter((r): r is MappedRow & { _no_dedup?: boolean } => r !== null)
}

// ── Auto-detection helpers ────────────────────────────────────────────────────

function detectField(header: string, samples: string[]): KnownField | 'ignore' {
  const h = header.toLowerCase().trim()
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    if (syns.includes(h)) return field as KnownField
  }
  // Value-based fallback
  const nonEmpty = samples.filter(v => v.trim())
  if (nonEmpty.length >= 2) {
    const emailHits = nonEmpty.filter(v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim())).length
    if (emailHits / nonEmpty.length >= 0.7) return 'email'
    const phoneHits = nonEmpty.filter(v => {
      const d = v.replace(/\D/g, '')
      return d.length >= 7 && d.length <= 16 && /^[\d\s+\-().]+$/.test(v.trim())
    }).length
    if (phoneHits / nonEmpty.length >= 0.7) return 'phone'
  }
  return 'ignore'
}

function labelToKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
}

// ── Build mapped rows from raw data ──────────────────────────────────────────

function buildMappedRows(rawRows: string[][], mappings: ColMapping[]): { rows: MappedRow[]; errors: RowError[] } {
  const rows: MappedRow[] = []
  const errors: RowError[] = []

  rawRows.forEach((rawRow, i) => {
    const row: MappedRow = {}
    const custom: Record<string, string> = {}

    mappings.forEach((m, colIdx) => {
      if (m.mappedTo === 'ignore') return
      const val = String(rawRow[colIdx] ?? '').trim()
      if (m.mappedTo === 'custom') {
        if (m.customKey && val) custom[m.customKey] = val
      } else {
        if (val) (row as any)[m.mappedTo] = val
      }
    })

    if (Object.keys(custom).length > 0) row.custom_fields = custom

    if (!row.name) errors.push({ rowIndex: i, message: `Row ${i + 1}: Name is required` })

    rows.push(row)
  })

  return { rows, errors }
}

// ── Component ─────────────────────────────────────────────────────────────────

const BASE = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''

export default function CustomerImportPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  // Step 1 → 2
  const [rawRows, setRawRows] = useState<string[][]>([])

  // Step 2
  const [mappings, setMappings] = useState<ColMapping[]>([])

  // Step 3
  const [validRows, setValidRows] = useState<MappedRow[]>([])
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [conflicts, setConflicts] = useState<ConflictGroup[]>([])
  const [conflictResolutions, setConflictResolutions] = useState<Record<string, 'merge' | 'separate'>>({})

  // Step 4
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  // Saved custom field defs from previous imports
  const [savedDefs, setSavedDefs] = useState<{ field_key: string; label: string }[]>([])

  useEffect(() => {
    fetch(`${BASE}/api/customers-import`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data.defs)) setSavedDefs(data.defs) })
      .catch(() => {})
  }, [])

  // ── File parsing ────────────────────────────────────────────────────────────

  async function parseFile(file: File) {
    setParseError(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]

      if (data.length < 2) {
        setParseError(t('customerImport.errorEmptyFile'))
        return
      }

      const headers = (data[0] || []).map(h => String(h ?? '').trim())
      const dataRows = data.slice(1).filter(row => row.some(cell => String(cell ?? '').trim()))

      if (dataRows.length === 0) {
        setParseError(t('customerImport.errorNoRows'))
        return
      }

      // Auto-detect column mappings
      const usedFields = new Set<string>()
      const autoMappings: ColMapping[] = headers.map((header, colIdx) => {
        const samples = dataRows
          .map(r => String(r[colIdx] ?? '').trim())
          .filter(Boolean)
          .slice(0, 5)

        let detected: KnownField | 'ignore' = detectField(header, samples)
        if (detected !== 'ignore' && usedFields.has(detected)) detected = 'ignore'
        if (detected !== 'ignore') usedFields.add(detected)

        // Match against previously saved custom field defs
        if (detected === 'ignore') {
          const h = header.toLowerCase().trim()
          const matched = savedDefs.find(d =>
            d.label.toLowerCase() === h ||
            d.field_key === labelToKey(h)
          )
          if (matched) {
            return { fileHeader: header, sampleValues: samples, mappedTo: 'custom' as const, customKey: matched.field_key, customLabel: matched.label }
          }
        }

        return { fileHeader: header, sampleValues: samples, mappedTo: detected, customKey: '', customLabel: '' }
      })

      setRawRows(dataRows)
      setMappings(autoMappings)
      setFileName(file.name)
      setStep(2)
    } catch (err: any) {
      setParseError(t('customerImport.errorParse') + ': ' + (err?.message || String(err)))
    }
  }

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setParseError(t('customerImport.errorFileType'))
      return
    }
    parseFile(file)
  }, [i18n.language])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  // ── Template download ───────────────────────────────────────────────────────

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const lang = i18n.language.startsWith('sv') ? 'sv' : i18n.language.startsWith('es') ? 'es' : 'en'
    const headers = TEMPLATE_HEADERS[lang] ?? TEMPLATE_HEADERS.en
    const ws = XLSX.utils.aoa_to_sheet([headers])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customers')
    XLSX.writeFile(wb, 'customer-import-template.xlsx')
  }

  // ── Step 2 helpers ──────────────────────────────────────────────────────────

  const usedFields = new Set(
    mappings
      .filter(m => m.mappedTo !== 'ignore' && m.mappedTo !== 'custom')
      .map(m => m.mappedTo)
  )

  function setMapping(colIdx: number, mappedTo: KnownField | 'ignore' | 'custom') {
    setMappings(prev => prev.map((m, i) => {
      if (i !== colIdx) return m
      if (mappedTo !== 'custom') return { ...m, mappedTo, customKey: '', customLabel: '' }
      // Pre-fill label from saved defs or fall back to the column header from the file
      const defaultLabel = m.customLabel || (() => {
        const h = m.fileHeader.toLowerCase().trim()
        const saved = savedDefs.find(d => d.label.toLowerCase() === h || d.field_key === labelToKey(h))
        return saved ? saved.label : m.fileHeader
      })()
      return { ...m, mappedTo, customLabel: defaultLabel, customKey: labelToKey(defaultLabel) }
    }))
  }

  function setCustomLabel(colIdx: number, label: string) {
    setMappings(prev => prev.map((m, i) =>
      i === colIdx ? { ...m, customLabel: label, customKey: labelToKey(label) } : m
    ))
  }

  function goToPreview() {
    const { rows, errors } = buildMappedRows(rawRows, mappings)
    setValidRows(rows)
    setRowErrors(errors)
    setConflicts(detectConflicts(rows))
    setConflictResolutions({})
    setStep(3)
  }

  // ── Step 4: commit ──────────────────────────────────────────────────────────

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      const customFieldDefs = mappings
        .filter(m => m.mappedTo === 'custom' && m.customKey && m.customLabel)
        .map(m => ({ field_key: m.customKey, label: m.customLabel }))

      const resolvedRows = applyResolutions(validRows, conflicts, conflictResolutions)

      const res = await fetch(`${BASE}/api/customers-import`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ rows: resolvedRows, customFieldDefs }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error || 'Import failed')
      setImportResult(data)
      setStep(4)
    } catch (err: any) {
      setImportError(err?.message || String(err))
    } finally {
      setImporting(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const FIELD_LABELS: Record<KnownField, string> = {
    name: t('customerImport.fieldName'),
    email: t('customerImport.fieldEmail'),
    phone: t('customerImport.fieldPhone'),
    company_name: t('customerImport.fieldCompany'),
    address1: t('customerImport.fieldAddress1'),
    address2: t('customerImport.fieldAddress2'),
    city: t('customerImport.fieldCity'),
    state: t('customerImport.fieldState'),
    postal_code: t('customerImport.fieldPostalCode'),
    country: t('customerImport.fieldCountry'),
    customer_type: t('customerImport.fieldCustomerType'),
    shipping_cost: t('customerImport.fieldShippingCost'),
  }

  const stepLabels = [
    t('customerImport.step1'),
    t('customerImport.step2'),
    t('customerImport.step3'),
    t('customerImport.step4'),
  ]

  const summary = (() => {
    const total = validRows.length
    const withEmail = validRows.filter(r => r.email).length
    const withPhone = validRows.filter(r => !r.email && r.phone).length
    const noContact = validRows.filter(r => !r.email && !r.phone).length
    return { total, withEmail, withPhone, noContact }
  })()

  return (
    <div className="page-normal">
      {/* Back link */}
      <button
        onClick={() => navigate('/admin', { state: { openTab: 'data-import' as any } })}
        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '0 0 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        ← {t('customerImport.backToImport')}
      </button>

      <div className="card">
        <h2 style={{ margin: '0 0 24px' }}>{t('customerImport.title')}</h2>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
          {stepLabels.map((label, i) => {
            const num = i + 1
            const active = step === num
            const done = step > num
            return (
              <div key={num} style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: done ? 'var(--color-success, #2e7d32)' : active ? 'var(--primary, #4f8ef7)' : 'var(--border)',
                    color: (done || active) ? '#fff' : 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {done ? '✓' : num}
                  </div>
                  <span style={{ fontSize: 12, color: active ? 'var(--text)' : 'var(--text-secondary)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: '100%', textOverflow: 'ellipsis' }}>
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div style={{ flex: 1, height: 1, background: 'var(--border)', margin: '0 4px', marginBottom: 24 }} />
                )}
              </div>
            )
          })}
        </div>

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <>
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--primary, #4f8ef7)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '40px 24px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'rgba(79,142,247,0.04)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 12 }}>📂</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t('customerImport.dropHere')}</div>
              <div className="helper">{t('customerImport.supportedFormats')}</div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
            />

            {parseError && (
              <p style={{ color: 'var(--color-error)', fontSize: 14, margin: '0 0 12px' }}>{parseError}</p>
            )}

            <button onClick={downloadTemplate} style={{ height: 36, padding: '0 16px', fontSize: 14 }}>
              ↓ {t('customerImport.downloadTemplate')}
            </button>
          </>
        )}

        {/* ── Step 2: Map columns ── */}
        {step === 2 && (
          <>
            <p className="helper" style={{ marginBottom: 16 }}>
              {t('customerImport.mapDesc', { file: fileName || '' })}
            </p>

            <div style={{ overflowX: 'auto', marginBottom: 20 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--line)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', width: '30%' }}>{t('customerImport.colHeader')}</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)', width: '30%' }}>{t('customerImport.colMapsTo')}</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('customerImport.colSamples')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m, colIdx) => (
                    <tr key={colIdx} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 500 }}>{m.fileHeader || `Column ${colIdx + 1}`}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <select
                            value={m.mappedTo}
                            onChange={e => setMapping(colIdx, e.target.value as any)}
                            style={{ fontSize: 13, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--input, var(--card))', color: 'var(--text)' }}
                          >
                            <option value="ignore">{t('customerImport.ignoreColumn')}</option>
                            {KNOWN_FIELDS.map(field => (
                              <option
                                key={field}
                                value={field}
                                disabled={usedFields.has(field) && m.mappedTo !== field}
                              >
                                {FIELD_LABELS[field]}
                                {usedFields.has(field) && m.mappedTo !== field ? ' ✓' : ''}
                              </option>
                            ))}
                            <option value="custom">{t('customerImport.customField')}</option>
                          </select>
                          {m.mappedTo === 'custom' && (
                            <input
                              value={m.customLabel}
                              onChange={e => setCustomLabel(colIdx, e.target.value)}
                              placeholder={t('customerImport.customFieldPlaceholder')}
                              style={{ fontSize: 13, padding: '4px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--input, var(--card))', color: 'var(--text)' }}
                            />
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-secondary)', fontSize: 13 }}>
                        {m.sampleValues.slice(0, 3).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setStep(1)} style={{ height: 36, padding: '0 16px' }}>
                ← {t('customerImport.back')}
              </button>
              <button
                className="primary"
                onClick={goToPreview}
                style={{ height: 36, padding: '0 20px' }}
              >
                {t('customerImport.next')} →
              </button>
            </div>
          </>
        )}

        {/* ── Step 3: Preview & validate ── */}
        {step === 3 && (
          <>
            {/* Summary */}
            <div style={{ background: 'var(--surface-subtle)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div><strong>{summary.total}</strong> {t('customerImport.summaryTotal')}</div>
              {summary.withEmail > 0 && <div className="helper">{t('customerImport.summaryWithEmail', { n: summary.withEmail })}</div>}
              {summary.withPhone > 0 && <div className="helper">{t('customerImport.summaryWithPhone', { n: summary.withPhone })}</div>}
              {summary.noContact > 0 && <div className="helper" style={{ color: 'var(--color-warning)' }}>{t('customerImport.summaryNoContact', { n: summary.noContact })}</div>}
            </div>

            {/* Conflict groups */}
            {conflicts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: 'var(--color-warning)' }}>
                  {t('customerImport.conflictsTitle', { n: conflicts.length })}
                </div>
                <p className="helper" style={{ marginBottom: 12 }}>{t('customerImport.conflictsDesc')}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {conflicts.map(grp => {
                    const res = conflictResolutions[grp.key] ?? 'merge'
                    const grpRows = grp.rowIndices.map(i => validRows[i])
                    const displayVal = grp.keyType === 'email'
                      ? (grpRows[0]?.email ?? grp.key)
                      : grp.keyType === 'phone'
                        ? (grpRows[0]?.phone ?? grp.key)
                        : (grpRows[0]?.name ?? grp.key)  // show original name, not normalized key
                    return (
                      <div key={grp.key} style={{ border: '1px solid var(--color-warning)', borderRadius: 8, padding: '12px 14px', background: 'var(--color-warning-bg)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                          {grp.keyType === 'email'
                            ? t('customerImport.conflictEmail', { val: displayVal })
                            : grp.keyType === 'phone'
                              ? t('customerImport.conflictPhone', { val: displayVal })
                              : t('customerImport.conflictName', { val: displayVal })}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                          {grpRows.map(r => r?.name || '—').join(' · ')}
                        </div>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', margin: 0 }}>
                            <input
                              type="radio"
                              name={`conflict-${grp.key}`}
                              value="merge"
                              checked={res === 'merge'}
                              onChange={() => setConflictResolutions(prev => ({ ...prev, [grp.key]: 'merge' }))}
                              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3 }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('customerImport.conflictMerge')}</div>
                              <div className="helper">{t('customerImport.conflictMergeDesc')}</div>
                            </div>
                          </label>
                          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', margin: 0 }}>
                            <input
                              type="radio"
                              name={`conflict-${grp.key}`}
                              value="separate"
                              checked={res === 'separate'}
                              onChange={() => setConflictResolutions(prev => ({ ...prev, [grp.key]: 'separate' }))}
                              style={{ width: 16, height: 16, flexShrink: 0, marginTop: 3 }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{t('customerImport.conflictSeparate')}</div>
                              <div className="helper">{t('customerImport.conflictSeparateDesc')}</div>
                            </div>
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Validation errors */}
            {rowErrors.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--color-error)' }}>
                  {t('customerImport.validationErrors', { n: rowErrors.length })}
                </div>
                <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13, color: 'var(--color-error)' }}>
                  {rowErrors.slice(0, 20).map((e, i) => (
                    <div key={i}>{e.message}</div>
                  ))}
                  {rowErrors.length > 20 && <div>…and {rowErrors.length - 20} more</div>}
                </div>
              </div>
            )}

            {/* Preview table */}
            {(() => {
              const mappedHeaders = mappings.filter(m => m.mappedTo !== 'ignore')
              const previewRows = validRows.slice(0, 10)
              return (
                <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--line)' }}>
                        {mappedHeaders.map((m, i) => (
                          <th key={i} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {m.mappedTo === 'custom' ? (m.customLabel || m.fileHeader) : FIELD_LABELS[m.mappedTo as KnownField]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => {
                        const hasError = rowErrors.some(e => e.rowIndex === ri)
                        return (
                          <tr key={ri} style={{ borderBottom: '1px solid var(--line)', background: hasError ? 'rgba(192,57,43,0.06)' : 'transparent' }}>
                            {mappedHeaders.map((m, ci) => {
                              const val = m.mappedTo === 'custom'
                                ? (row.custom_fields?.[m.customKey] ?? '')
                                : ((row as any)[m.mappedTo] ?? '')
                              return (
                                <td key={ci} style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {val || <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {validRows.length > 10 && (
                    <p className="helper" style={{ marginTop: 8 }}>{t('customerImport.previewMore', { n: validRows.length - 10 })}</p>
                  )}
                </div>
              )
            })()}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setStep(2)} style={{ height: 36, padding: '0 16px' }}>
                ← {t('customerImport.back')}
              </button>
              <button
                className="primary"
                onClick={handleImport}
                disabled={importing || validRows.filter(r => r.name).length === 0}
                style={{ height: 36, padding: '0 24px', opacity: importing ? 0.7 : 1 }}
              >
                {importing
                  ? t('customerImport.committing')
                  : t('customerImport.commit', { count: validRows.filter(r => r.name).length })}
              </button>
              {importError && (
                <span style={{ color: 'var(--color-error)', fontSize: 14 }}>{importError}</span>
              )}
            </div>
          </>
        )}

        {/* ── Step 4: Done ── */}
        {step === 4 && importResult && (
          <>
            <div style={{ textAlign: 'center', padding: '16px 0 32px' }}>
              <div style={{ fontSize: 44, marginBottom: 12, color: 'var(--color-success, #2e7d32)' }}>✓</div>
              <h3 style={{ margin: '0 0 20px', color: 'var(--color-success, #2e7d32)' }}>{t('customerImport.doneTitle')}</h3>

              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, textAlign: 'left', fontSize: 15 }}>
                <div>✅ <strong>{importResult.created}</strong> {t('customerImport.doneCreated')}</div>
                <div>♻️ <strong>{importResult.updated}</strong> {t('customerImport.doneUpdated')}</div>
                {importResult.skipped > 0 && (
                  <div>⚠️ <strong>{importResult.skipped}</strong> {t('customerImport.doneSkipped')}</div>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div style={{ marginTop: 20, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: 'var(--color-error)' }}>{t('customerImport.doneErrors')}</div>
                  <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13, color: 'var(--color-error)' }}>
                    {importResult.errors.map((e, i) => (
                      <div key={i}>Row {e.row}: {e.message}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => navigate('/customers')} className="primary" style={{ height: 36, padding: '0 24px' }}>
                {t('customerImport.goToCustomers')}
              </button>
              <button
                onClick={() => {
                  setStep(1)
                  setFileName(null)
                  setRawRows([])
                  setMappings([])
                  setValidRows([])
                  setRowErrors([])
                  setConflicts([])
                  setConflictResolutions({})
                  setImportResult(null)
                  setImportError(null)
                }}
                style={{ height: 36, padding: '0 16px' }}
              >
                {t('customerImport.importAnother')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
