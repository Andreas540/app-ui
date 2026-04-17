import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { listProducts, updateProduct, type ProductWithCost } from '../lib/api'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'

export default function EditProduct() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const type = searchParams.get('type') === 'service' ? 'service' : 'product'
  const preselectedId = searchParams.get('id') || ''
  const [products, setProducts] = useState<ProductWithCost[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState('')
  const [newName, setNewName] = useState('')
  const [costStr, setCostStr] = useState('') // decimal string
  const [costOption, setCostOption] = useState<'history' | 'next' | 'specific'>('next')
  const [specificDate, setSpecificDate] = useState<string>(todayYMD())
  const [saving, setSaving] = useState(false)

  const [durationStr, setDurationStr] = useState('')
  const [priceStr, setPriceStr] = useState('')

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { products } = await listProducts()
        setProducts(products)
        // default selection — preselected id from URL, or first item matching type
        const filtered = products.filter(p => (p.category ?? 'product') === type)
        const match = preselectedId && products.find(p => p.id === preselectedId)
        if (match) setSelectedId(match.id)
        else if (filtered.length) setSelectedId(filtered[0].id)
      } catch (e:any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const selected = useMemo(() => products.find(p => p.id === selectedId) || null, [products, selectedId])

  // When product changes, prefill fields
  useEffect(() => {
    if (!selected) return
    setNewName(selected.name)
    setCostStr(selected.cost == null ? '' : String(selected.cost))
    setCostOption('next')
    setSpecificDate(todayYMD())
    if (selected.category === 'service') {
      setDurationStr(selected.duration_minutes == null ? '' : String(selected.duration_minutes))
      setPriceStr(selected.price_amount == null ? '' : String(selected.price_amount))
    } else {
      setPriceStr(selected.price_amount == null ? '' : String(selected.price_amount))
    }
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  function parseCostInput(s: string) {
    const cleaned = s.replace(/[^\d.,-]/g, '')
    return cleaned.replace(',', '.') // normalize comma to dot
  }

  async function save() {
    if (!selected) { alert(t('products.alertPickProduct')); return }
    const name = (newName || '').trim()
    if (!name) { alert(t('products.alertEnterName')); return }
    const costNum = Number((costStr || '').replace(',', '.'))
    if (!Number.isFinite(costNum) || costNum < 0) { alert(t('products.alertEnterValidCost')); return }

    if (costOption === 'specific' && !specificDate) {
      alert(t('products.alertSelectDate'))
      return
    }

    const durationMinutes = type === 'service' && durationStr
      ? Math.max(1, parseInt(durationStr, 10) || 60)
      : undefined
    const priceAmount: number | null | undefined = priceStr.trim() === '' ? null : Number(priceStr.replace(',', '.'))

    try {
      setSaving(true)
      const res = await updateProduct({
        id: selected.id,
        name: selected.category === 'service' && !!selected.external_service_id ? undefined : name,
        cost: costNum,
        apply_to_history: costOption === 'history',
        effective_date: costOption === 'specific' ? specificDate : undefined,
        duration_minutes: durationMinutes,
        price_amount: priceAmount,
      })

      let message = t('products.updatedProduct', { product: res.product.name })
      if (res.applied_to_history) {
        message += ' ' + t('products.appliedToHistory')
      } else if (costOption === 'specific') {
        message += ' ' + t('products.effectiveFrom', { date: specificDate })
      }

      alert(message)
      navigate(`/products/new?type=${type}`)
    } catch (e:any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="card"><p>{t('loading')}</p></div>
  if (err) return <div className="card"><p style={{color:'salmon'}}>{t('error')} {err}</p></div>
  if (!products.length) return <div className="card"><p>{t('products.noProducts')}</p></div>

  const BTN_H = 'calc(var(--control-h) * 0.67)'

  return (
    <div className="card" style={{ maxWidth: 720 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center', gap:8 }}>
        <h3 style={{ margin:0 }}>{type === 'service' ? t('products.editServiceTitle') : t('products.editProductTitle')}</h3>
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>{t('product')}</label>
          <select value={selectedId} onChange={e=>setSelectedId(e.target.value)}>
            {products.filter(p => (p.category ?? 'product') === type).map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>{t('products.newName')}</label>
          <input
            type="text"
            placeholder="e.g. ACE Ultra"
            value={newName}
            onChange={e=>setNewName(e.target.value)}
            disabled={selected?.category === 'service' && !!selected?.external_service_id}
            title={selected?.category === 'service' && !!selected?.external_service_id ? 'Name is managed by SimplyBook' : undefined}
          />
          {selected?.category === 'service' && !!selected?.external_service_id && (
            <p className="helper" style={{ marginTop: 4 }}>Name is synced from SimplyBook and cannot be edited here.</p>
          )}
        </div>
      </div>

      {type === 'product' && (
        <div style={{ marginTop: 12 }}>
          <label>{t('products.servicePrice')}</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={priceStr}
            onChange={e => setPriceStr(parseCostInput(e.target.value))}
          />
        </div>
      )}

      {type === 'service' && (
        <div className="row" style={{ marginTop: 12 }}>
          <div>
            <label>{t('products.duration')}</label>
            <input
              type="number"
              min={1}
              placeholder="60"
              value={durationStr}
              onChange={e => setDurationStr(e.target.value)}
            />
          </div>
          <div>
            <label>{t('products.servicePrice')}</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={priceStr}
              onChange={e => setPriceStr(parseCostInput(e.target.value))}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label>{t('products.newProductCostUSD')}</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          value={costStr}
          onChange={e=>setCostStr(parseCostInput(e.target.value))}
        />
      </div>

      {/* Cost application options */}
      <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'history'}
            onChange={() => setCostOption('history')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('products.applyCostToHistory')}</span>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="radio"
            name="costOption"
            checked={costOption === 'next'}
            onChange={() => setCostOption('next')}
            style={{ width: 18, height: 18 }}
          />
          <span>{t('products.applyCostFromNextOrder')}</span>
        </label>

        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="radio"
              name="costOption"
              checked={costOption === 'specific'}
              onChange={() => setCostOption('specific')}
              style={{ width: 18, height: 18 }}
            />
            <span>{t('products.applyCostFromSpecificDate')}</span>
          </label>
          
          {costOption === 'specific' && (
            <div style={{ marginTop: 8, marginLeft: 28 }}>
              <DateInput
                value={specificDate}
                onChange={v => setSpecificDate(v)}
                style={{ width: '100%', maxWidth: 200 }}
              />
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 16, display:'flex', gap:8 }}>
        <button className="primary" onClick={save} disabled={saving} style={{ height: BTN_H }}>
          {saving ? t('saving') : t('saveChanges')}
        </button>
        <button
          onClick={() => {
            if (selected) {
              setNewName(selected.name)
              setCostStr(selected.cost == null ? '' : String(selected.cost))
              if (selected.category === 'service') {
                setDurationStr(selected.duration_minutes == null ? '' : String(selected.duration_minutes))
                setPriceStr(selected.price_amount == null ? '' : String(selected.price_amount))
              } else {
                setPriceStr(selected.price_amount == null ? '' : String(selected.price_amount))
              }
            }
            setCostOption('next')
            setSpecificDate(todayYMD())
          }}
          disabled={saving}
        >
          {t('reset')}
        </button>
        <button onClick={() => navigate(`/products/new?type=${type}`)} disabled={saving}>
          {t('cancel')}
        </button>
      </div>
    </div>
  )
}

