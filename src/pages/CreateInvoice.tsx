import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getAuthHeaders, listProducts, createProduct, type ProductWithCost } from '../lib/api'
import { Trans, useTranslation } from 'react-i18next'
import { formatDate, todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import { useAuth } from '../contexts/AuthContext'
import { getTenantConfig } from '../lib/tenantConfig'
import { useCurrency } from '../lib/useCurrency'

const INFO_PARAGRAPHS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] as const

type Customer = {
  id: string
  name: string
  company_name?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
}

type Order = {
  order_id: string
  item_id: string
  product: string
  quantity: number
  unit_price: number
  amount: number
  order_date: string
}

type UnregLine = {
  id: string
  product_id: string
  qtyStr: string
  priceStr: string
}

function emptyUnregLine(): UnregLine {
  return { id: Math.random().toString(36).slice(2), product_id: '', qtyStr: '', priceStr: '' }
}

export default function CreateInvoicePage() {
  const { t } = useTranslation()
  const { t: ti } = useTranslation('info')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const preselectedCustomerId = searchParams.get('customer_id') ?? ''
  const [showInfo, setShowInfo] = useState(false)
  const { user } = useAuth()
  const tenantUi = getTenantConfig(user?.tenantId).ui
  const fallbackConfig = getTenantConfig(user?.tenantId).invoice
  const [invoiceConfig, setInvoiceConfig] = useState(fallbackConfig)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [orders, setOrders] = useState<Order[]>([])
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [confirmedOrders, setConfirmedOrders] = useState<Order[]>([])
  const [showingConfirmed, setShowingConfirmed] = useState(false)
  const [invoiceDate, setInvoiceDate] = useState<string>('')
  const [dueDate, setDueDate] = useState<string>('')
  const [deliveryDate, setDeliveryDate] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<string>('wire_transfer')
  const [invoiceNo, setInvoiceNo] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invoicedOrders, setInvoicedOrders] = useState<Map<string, string>>(new Map()) // order_id → invoice_no
  const [lastInvoiceNo, setLastInvoiceNo] = useState<string | null>(null)
  const [invoiceRegistered, setInvoiceRegistered] = useState(true)
  const [invoiceUnregistered, setInvoiceUnregistered] = useState(false)
  const [unregDate, setUnregDate] = useState(() => todayYMD())
  const [unregNotes, setUnregNotes] = useState('')
  const [unregLines, setUnregLines] = useState<UnregLine[]>(() => [emptyUnregLine()])
  const [savingLines, setSavingLines] = useState(false)
  const [unregProducts, setUnregProducts] = useState<ProductWithCost[]>([])
  const [unregProductsLoaded, setUnregProductsLoaded] = useState(false)
  const [createdOrders, setCreatedOrders] = useState<Order[]>([])
  const [showNewProductForm, setShowNewProductForm] = useState(false)
  const [newProdCategory, setNewProdCategory] = useState<'product' | 'service'>('product')
  const [newProdName, setNewProdName] = useState('')
  const [newProdPriceStr, setNewProdPriceStr] = useState('')
  const [newProdCostStr, setNewProdCostStr] = useState('')
  const [newProdDurationStr, setNewProdDurationStr] = useState('')
  const [savingNewProd, setSavingNewProd] = useState(false)
  const [newProdTargetIdx, setNewProdTargetIdx] = useState(0)

  // Load invoice config from DB; fall back to tenantConfig.ts if absent
  useEffect(() => {
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    fetch(`${base}/api/tenant-admin?action=getInvoiceConfig`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.invoiceConfig) {
          const ic = data.invoiceConfig
          const enabled: string[] = ic.enabledPaymentMethods ?? fallbackConfig.enabledPaymentMethods
          setInvoiceConfig({
            autoInvoiceNumber: ic.autoInvoiceNumber ?? fallbackConfig.autoInvoiceNumber,
            companyName: ic.companyName || fallbackConfig.companyName,
            companyAddress1: ic.companyAddress1 || fallbackConfig.companyAddress1,
            companyAddress2: ic.companyAddress2 || fallbackConfig.companyAddress2,
            companyPhone: ic.companyPhone || fallbackConfig.companyPhone,
            contactName: ic.contactName || fallbackConfig.contactName,
            enabledPaymentMethods: enabled,
            bankName: ic.bankName || fallbackConfig.bankName,
            bankAccountName: ic.bankAccountName || fallbackConfig.bankAccountName,
            bankAccountNumber: ic.bankAccountNumber || fallbackConfig.bankAccountNumber,
            bankRoutingNumber: ic.bankRoutingNumber || fallbackConfig.bankRoutingNumber,
            achBankName: ic.achBankName || fallbackConfig.achBankName,
            achBranch: ic.achBranch || fallbackConfig.achBranch,
            achCityState: ic.achCityState || fallbackConfig.achCityState,
            achAccountNumber: ic.achAccountNumber || fallbackConfig.achAccountNumber,
            achAba: ic.achAba || fallbackConfig.achAba,
          })
          if (enabled.length > 0) setPaymentMethod(enabled[0])
        }
      })
      .catch(() => {}) // keep fallback silently
  }, [])

  useEffect(() => {
    (async () => {
      try {
        setLoading(true)
        setError(null)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
const res = await fetch(`${base}/api/create-invoice`, {
  cache: 'no-store',
  headers: getAuthHeaders(),
})

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load customers (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setCustomers(data.customers)
        if (preselectedCustomerId && data.customers.some((c: Customer) => c.id === preselectedCustomerId)) {
          setSelectedCustomerId(preselectedCustomerId)
        }

        // Load last invoice number and invoiced order mapping in background
        const base2 = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        fetch(`${base2}/api/invoices?last=true`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : null)
          .then(data => { if (data?.invoice_no) setLastInvoiceNo(data.invoice_no) })
          .catch(() => {})
        fetch(`${base2}/api/invoices?invoiced=true`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : [])
          .then((rows: { order_id: string; invoice_no: string | null }[]) => {
            const map = new Map<string, string>()
            for (const row of rows) {
              if (row.order_id) map.set(row.order_id, row.invoice_no ?? '')
            }
            setInvoicedOrders(map)
          })
          .catch(() => {})
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    setConfirmedOrders([])
    setShowingConfirmed(false)
    setCreatedOrders([])
    if (!selectedCustomerId || !invoiceRegistered) {
      setOrders([])
      setSelectedOrders(new Set())
      return
    }

    (async () => {
      try {
        setOrdersLoading(true)
        setError(null)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/create-invoice?customerId=${selectedCustomerId}`, {
          cache: 'no-store',
          headers: getAuthHeaders(),
        })

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(`Failed to load orders (status ${res.status}) ${text?.slice(0, 140)}`)
        }

        const data = await res.json()
        setOrders(data.orders)
        setSelectedOrders(new Set())
      } catch (e: any) {
        setError(e?.message || String(e))
      } finally {
        setOrdersLoading(false)
      }
    })()
  }, [selectedCustomerId, invoiceRegistered])

  useEffect(() => {
    if (!invoiceUnregistered || unregProductsLoaded) return
    listProducts()
      .then(d => { setUnregProducts(d.products); setUnregProductsLoaded(true) })
      .catch(() => {})
  }, [invoiceUnregistered, unregProductsLoaded])

  useEffect(() => {
    if (!unregProductsLoaded || unregProducts.length === 0) return
    const excludedNames = ['boutiq', 'perfect day_2', 'muha meds', 'clouds', 'mix pack', 'bodega boys', 'hex fuel']
    const sorted = unregProducts
      .filter(p => !excludedNames.includes(p.name.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
    const first = sorted.find(p => (p.category ?? 'product') === 'product') ?? sorted[0]
    if (!first) return
    setUnregLines(prev => prev.map(l =>
      l.product_id ? l : {
        ...l,
        product_id: first.id,
        priceStr: (first.price_amount && first.price_amount > 0) ? String(first.price_amount) : '',
      }
    ))
  }, [unregProductsLoaded])

  useEffect(() => {
    if (!invoiceConfig.autoInvoiceNumber) return
    if (invoiceDate && dueDate && selectedCustomerId) {
      const customer = customers.find(c => c.id === selectedCustomerId)
      if (!customer) return

      // invoiceDate is "YYYY-MM-DD" from <input type="date">
      const [year, month] = invoiceDate.split('-')
      if (!year || !month) {
        setInvoiceNo('')
        return
      }

      const customerInitials = customer.name.slice(0, 2).toUpperCase()
      const randomNum = Math.floor(Math.random() * 9000) + 1000
      const invoiceNumber = `${month}${year.slice(-2)}-${customerInitials}${randomNum}`
      setInvoiceNo(invoiceNumber)
    } else {
      setInvoiceNo('')
    }
  }, [invoiceDate, dueDate, deliveryDate, selectedCustomerId, customers, invoiceConfig.autoInvoiceNumber])

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId)

  const toggleOrder = (itemId: string) => {
    const newSelected = new Set(selectedOrders)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedOrders(newSelected)
  }

  const handleChooseSelected = () => {
    const allOrders = [...createdOrders, ...orders]
    const seen = new Set<string>()
    const deduped = allOrders.filter(o => {
      if (seen.has(o.item_id)) return false
      seen.add(o.item_id)
      return true
    })
    setConfirmedOrders(deduped.filter(o => selectedOrders.has(o.item_id)))
    setShowingConfirmed(true)
  }

  function updateUnregLine(idx: number, patch: Partial<UnregLine>) {
    setUnregLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function addUnregLine() {
    const first = unregProductGroup[0] ?? filteredUnregProducts[0]
    setUnregLines(prev => [...prev, {
      ...emptyUnregLine(),
      product_id: first?.id ?? '',
      priceStr: (first?.price_amount && first.price_amount > 0) ? String(first.price_amount) : '',
    }])
  }

  function onUnregProductChange(idx: number, product_id: string) {
    if (product_id === '__new_product__') {
      setNewProdCategory('product')
      setNewProdTargetIdx(idx)
      setShowNewProductForm(true)
      return
    }
    if (product_id === '__new_service__') {
      setNewProdCategory('service')
      setNewProdTargetIdx(idx)
      setShowNewProductForm(true)
      return
    }
    const prod = unregProducts.find(p => p.id === product_id)
    const pa = prod?.price_amount
    const priceStr = (pa != null && pa > 0) ? String(pa) : ''
    setUnregLines(prev => prev.map((l, i) => i === idx ? { ...l, product_id, priceStr } : l))
  }

  async function handleSaveNewProduct() {
    const nm = newProdName.trim()
    if (!nm) { alert(t('products.alertEnterName')); return }
    const priceAmount = newProdPriceStr ? parseAmount(newProdPriceStr) : null
    const costNum = newProdCostStr ? parseAmount(newProdCostStr) : 0
    const durationMinutes = newProdCategory === 'service' && newProdDurationStr
      ? Math.max(1, parseInt(newProdDurationStr, 10) || 60)
      : null
    setSavingNewProd(true)
    try {
      const created = await createProduct({ name: nm, cost: costNum, category: newProdCategory, duration_minutes: durationMinutes, price_amount: priceAmount })
      const { products: refreshed } = await listProducts()
      setUnregProducts(refreshed)
      const newProd = refreshed.find(p => p.id === created.product.id)
      if (newProd) {
        const pa = newProd.price_amount
        setUnregLines(prev => prev.map((l, i) => i === newProdTargetIdx ? {
          ...l,
          product_id: newProd.id,
          priceStr: (pa != null && pa > 0) ? String(pa) : '',
        } : l))
      }
      setNewProdName('')
      setNewProdPriceStr('')
      setNewProdCostStr('')
      setNewProdDurationStr('')
      setShowNewProductForm(false)
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    } finally {
      setSavingNewProd(false)
    }
  }

  const handleCreateUnregOrders = async () => {
    const validLines = unregLines.filter(l => l.product_id && parseAmount(l.qtyStr) > 0)
    if (!validLines.length || !selectedCustomerId) return
    setSavingLines(true)
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/orders`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          customer_id: selectedCustomerId,
          date: unregDate,
          delivered: false,
          delivered_at: null,
          discount: 0,
          notes: unregNotes.trim() || undefined,
          items: validLines.map(l => ({
            product_id: l.product_id,
            qty: parseAmount(l.qtyStr),
            unit_price: parseAmount(l.priceStr),
          })),
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`Failed to save order (${res.status}) ${text?.slice(0, 140)}`)
      }
      const data = await res.json()
      const fetchRes = await fetch(`${base}/api/create-invoice?customerId=${selectedCustomerId}`, {
        cache: 'no-store',
        headers: getAuthHeaders(),
      })
      if (fetchRes.ok) {
        const fetchData = await fetchRes.json()
        const allOrders: Order[] = fetchData.orders
        const newOrders = allOrders.filter(o => o.order_id === data.order_id)
        setCreatedOrders(prev => [...prev, ...newOrders])
        setSelectedOrders(prev => {
          const next = new Set(prev)
          newOrders.forEach(o => next.add(o.item_id))
          return next
        })
        if (invoiceRegistered) setOrders(allOrders)
      }
      setUnregLines([emptyUnregLine()])
      setUnregNotes('')
    } catch (e: any) {
      alert(e?.message || 'Failed to create orders')
    } finally {
      setSavingLines(false)
    }
  }

  const handleNewSelection = () => {
    setShowingConfirmed(false)
    setSelectedOrders(new Set())
  }

  const handlePreviewInvoice = async () => {
    if (!selectedCustomer) return

    // Pre-fetch the tenant icon as a data URL so html-to-image can embed it
    let logoDataUrl: string | null = null
    if (user?.tenantId) {
      try {
        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/.netlify/functions/serve-icon?tenant_id=${user.tenantId}&type=192`)
        if (res.ok) {
          const blob = await res.blob()
          logoDataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
        }
      } catch {
        // Fall back to default icon silently
      }
    }

    const invoiceData = {
      invoiceNo,
      invoiceDate,
      dueDate,
      deliveryDate,
      paymentMethod,
      customer: selectedCustomer,
      orders: confirmedOrders,
      companyInfo: invoiceConfig,
      logoDataUrl,
    }

    navigate('/invoices/preview', { state: invoiceData })
  }

  const { fmtMoney, parseAmount } = useCurrency()

  const excludedProductNames = ['boutiq', 'perfect day_2', 'muha meds', 'clouds', 'mix pack', 'bodega boys', 'hex fuel']
  const filteredUnregProducts = unregProducts
    .filter(p => !excludedProductNames.includes(p.name.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))
  const unregProductGroup = filteredUnregProducts.filter(p => (p.category ?? 'product') === 'product')
  const unregServiceGroup = filteredUnregProducts.filter(p => p.category === 'service')
  const canCreateOrders = !savingLines && unregLines.some(l => l.product_id && parseAmount(l.qtyStr) > 0)

  return (
    <div className="card page-normal">

      {showInfo && (
        <div
          style={{
            marginBottom: 16,
            background: 'var(--card, #fff)',
            border: '1px solid var(--border)', borderRadius: 8,
            padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ti('createInvoice.title')}</div>
            <button
              onClick={() => setShowInfo(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
            >✕</button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INFO_PARAGRAPHS.map(key => (
              <p key={key} style={{ margin: 0 }}>
                {key === 'p6' ? (
                  <Trans
                    i18nKey="createInvoice.p6"
                    ns="info"
                    components={{
                      adminLink: (
                        <button
                          onClick={() => { setShowInfo(false); navigate('/admin', { state: { openInvoicingTab: true } }) }}
                          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', textDecoration: 'underline', fontSize: 'inherit', fontFamily: 'inherit' }}
                        />
                      ),
                    }}
                  />
                ) : ti(`createInvoice.${key}`)}
              </p>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ margin: 0 }}>{t('invoice.createTitle')}</h2>
            {tenantUi.showInfoIconsPages && (
              <button
                onClick={() => setShowInfo(v => !v)}
                style={{
                  width: 20, height: 20, padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', cursor: 'pointer',
                  background: 'var(--border, rgba(0,0,0,0.08))',
                  border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, lineHeight: 1,
                }}
              >i</button>
            )}
          </div>
          <button
            onClick={() => navigate('/admin', { state: { openInvoicingTab: true } })}
            style={{ fontSize: 12, padding: '3px 10px', borderRadius: 6, height: 24 }}
          >{ti('manageInvoices')}</button>
        </div>
        <Link to="/" className="helper">{t('back_link')}</Link>
      </div>

      {loading && <p>{t('invoice.loadingCustomers')}</p>}
      {error && <p style={{ color: 'var(--color-error)' }}>{t('error')} {error}</p>}

      {!loading && !error && (
        <>
          <div className="row" style={{ marginBottom: 20 }}>
            <div>
              <label htmlFor="customer-select">{t('invoice.selectCustomer')}</label>
              <select
                id="customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
              >
                <option value="">{t('invoice.selectCustomerPlaceholder')}</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer ? (
              <div style={{ paddingTop: 20, fontSize: 14 }}>
                {selectedCustomer.company_name && <div>{selectedCustomer.company_name}</div>}
                {selectedCustomer.address1 && <div>{selectedCustomer.address1}</div>}
                {selectedCustomer.address2 && <div>{selectedCustomer.address2}</div>}
                {(selectedCustomer.city || selectedCustomer.state || selectedCustomer.postal_code) && (
                  <div>
                    {[selectedCustomer.city, selectedCustomer.state, selectedCustomer.postal_code]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                )}
                {selectedCustomer.country && <div>{selectedCustomer.country}</div>}
                {!selectedCustomer.company_name && !selectedCustomer.address1 && !selectedCustomer.address2 && !selectedCustomer.city && (
                  <div className="helper">{t('invoice.noAddressOnFile')}</div>
                )}
              </div>
            ) : <div />}
          </div>

          {selectedCustomerId && (
            <>
              {/* Invoice type checkboxes */}
              {!showingConfirmed && (
                <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                    <input type="checkbox" checked={invoiceRegistered} onChange={e => setInvoiceRegistered(e.target.checked)} />
                    {t('invoice.invoiceRegistered')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 500 }}>
                    <input type="checkbox" checked={invoiceUnregistered} onChange={e => setInvoiceUnregistered(e.target.checked)} />
                    {t('invoice.invoiceUnregistered')}
                  </label>
                </div>
              )}

              {/* Inline new product/service form */}
              {showNewProductForm && invoiceUnregistered && !showingConfirmed && (
                <div style={{ marginBottom: 16, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ marginBottom: 12, fontWeight: 500 }}>
                    {newProdCategory === 'service' ? t('products.newServiceTitle') : t('products.newProductTitle')}
                  </div>
                  {newProdCategory === 'product' ? (
                    <div className="row-3col">
                      <div>
                        <label>{t('products.productName')}</label>
                        <input type="text" value={newProdName} onChange={e => setNewProdName(e.target.value)} />
                      </div>
                      <div>
                        <label>{t('products.servicePrice')}</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={newProdPriceStr} onChange={e => setNewProdPriceStr(e.target.value.replace(/[^0-9.,]/g, ''))} />
                      </div>
                      <div>
                        <label>{t('products.productCostUSD')}</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={newProdCostStr} onChange={e => setNewProdCostStr(e.target.value.replace(/[^0-9.,]/g, ''))} />
                      </div>
                    </div>
                  ) : (
                    <div className="row-4col">
                      <div>
                        <label>{t('products.serviceName')}</label>
                        <input type="text" value={newProdName} onChange={e => setNewProdName(e.target.value)} />
                      </div>
                      <div>
                        <label>{t('products.duration')}</label>
                        <input type="number" min={1} placeholder="60" value={newProdDurationStr} onChange={e => setNewProdDurationStr(e.target.value)} />
                      </div>
                      <div>
                        <label>{t('products.servicePrice')}</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={newProdPriceStr} onChange={e => setNewProdPriceStr(e.target.value.replace(/[^0-9.,]/g, ''))} />
                      </div>
                      <div>
                        <label>{t('products.directServiceCost')}</label>
                        <input type="text" inputMode="decimal" placeholder="0.00" value={newProdCostStr} onChange={e => setNewProdCostStr(e.target.value.replace(/[^0-9.,]/g, ''))} />
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleSaveNewProduct}
                      disabled={savingNewProd}
                      style={{ padding: '8px 16px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff', cursor: savingNewProd ? 'not-allowed' : 'pointer', fontWeight: 500 }}
                    >
                      {savingNewProd ? t('saving') : t(newProdCategory === 'service' ? 'products.saveService' : 'products.saveProduct')}
                    </button>
                    <button onClick={() => setShowNewProductForm(false)} disabled={savingNewProd}>
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* Compact form for not-yet-registered orders */}
              {invoiceUnregistered && !showingConfirmed && (
                <div style={{ marginBottom: 20, padding: '14px 16px', border: '1px solid var(--border)', borderRadius: 10 }}>

                  {/* Row 1: Order date (order-level) */}
                  <div>
                    <label>{t('orders.orderDate')}</label>
                    <DateInput value={unregDate} onChange={setUnregDate} />
                  </div>

                  {/* Product lines — each line: product | qty | price */}
                  {unregLines.map((line, idx) => (
                    <div key={line.id} style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                      <div className="row-3col">
                        <div>
                          <label>{t('orders.productOrService')}</label>
                          <select value={line.product_id} onChange={e => onUnregProductChange(idx, e.target.value)}>
                            <optgroup label={t('orders.groupProducts')}>
                              {unregProductGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              <option value="__new_product__">{t('products.newProductTitle')}</option>
                            </optgroup>
                            <optgroup label={t('orders.groupServices')}>
                              {unregServiceGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              <option value="__new_service__">{t('products.newServiceTitle')}</option>
                            </optgroup>
                          </select>
                        </div>
                        <div>
                          <label>{t('quantity')}</label>
                          <input
                            type="text" inputMode="decimal" placeholder="0"
                            value={line.qtyStr}
                            onChange={e => updateUnregLine(idx, { qtyStr: e.target.value.replace(/[^0-9.,]/g, '') })}
                          />
                        </div>
                        <div>
                          <label>{t('price')}</label>
                          <input
                            type="text" inputMode="decimal" placeholder="0.00"
                            value={line.priceStr}
                            onChange={e => updateUnregLine(idx, { priceStr: e.target.value.replace(/[^0-9.,-]/g, '') })}
                          />
                        </div>
                      </div>
                      {unregLines.length > 1 && (
                        <div style={{ marginTop: 6 }}>
                          <button className="helper" onClick={() => setUnregLines(prev => prev.filter((_, i) => i !== idx))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                            – {t('supplierOrders.removeProduct')}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Notes — order-level */}
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    <label>{t('notes')}</label>
                    <input
                      type="text"
                      placeholder={t('optionalNotesPlaceholder')}
                      value={unregNotes}
                      onChange={e => setUnregNotes(e.target.value)}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="helper" onClick={addUnregLine}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                      + {t('orders.addProduct')}
                    </button>
                    <button
                      onClick={handleCreateUnregOrders}
                      disabled={!canCreateOrders}
                      style={{ padding: '8px 16px', border: 'none', borderRadius: 10, background: canCreateOrders ? 'var(--accent)' : '#ccc', color: '#fff', cursor: canCreateOrders ? 'pointer' : 'not-allowed', fontWeight: 500 }}
                    >
                      {savingLines ? t('invoice.saving') : t('invoice.createOrders')}
                    </button>
                  </div>
                </div>
              )}

              {/* Order selection list */}
              {(invoiceRegistered || createdOrders.length > 0) && !showingConfirmed && (
                <>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                    {t('invoice.selectOrders')}
                  </label>

                  {ordersLoading && <p>{t('invoice.loadingOrders')}</p>}

                  {!ordersLoading && orders.length === 0 && createdOrders.length === 0 && (
                    <p className="helper">{t('invoice.noOrdersForCustomer')}</p>
                  )}

                  {!ordersLoading && (orders.length > 0 || createdOrders.length > 0) && (
                    <>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 10, maxHeight: 300, overflowY: 'auto', marginBottom: 12 }}>
                        {/* Newly created orders */}
                        {createdOrders.map(order => (
                          <div key={order.item_id} style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start', fontSize: 14 }}>
                            <input type="checkbox" checked={selectedOrders.has(order.item_id)} onChange={() => toggleOrder(order.item_id)} style={{ cursor: 'pointer', width: 14, height: 14, marginTop: 2, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 12, marginBottom: 4 }}>
                                <div style={{ whiteSpace: 'nowrap' }}>{formatDate(order.order_date)}</div>
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.product}</div>
                                <div style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(order.amount)}</div>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 12 }}>
                                <div>{order.quantity}</div>
                                <div>{fmtMoney(order.unit_price)}</div>
                                <div></div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Registered orders (exclude any already shown in createdOrders) */}
                        {orders.filter(o => !createdOrders.some(c => c.item_id === o.item_id)).map(order => {
                          const invNo = invoicedOrders.get(order.order_id)
                          const isInvoiced = invNo !== undefined
                          return (
                            <div key={order.item_id}>
                              <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: isInvoiced ? 'none' : '1px solid var(--line)', alignItems: 'flex-start', fontSize: 14, color: 'var(--text, inherit)', background: isInvoiced ? 'var(--invoiced-row-bg, rgba(13,110,253,0.06))' : undefined }}>
                                <input type="checkbox" checked={selectedOrders.has(order.item_id)} onChange={() => toggleOrder(order.item_id)} style={{ cursor: 'pointer', width: 14, height: 14, marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 12, marginBottom: 4 }}>
                                    <div style={{ whiteSpace: 'nowrap' }}>{formatDate(order.order_date)}</div>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{order.product}</div>
                                    <div style={{ textAlign: 'right', fontWeight: 500 }}>{fmtMoney(order.amount)}</div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 80px', gap: 12 }}>
                                    <div>{order.quantity}</div>
                                    <div>{fmtMoney(order.unit_price)}</div>
                                    <div></div>
                                  </div>
                                </div>
                              </div>
                              {isInvoiced && (
                                <div style={{ padding: '3px 16px 6px 42px', fontSize: 11, color: 'var(--text-secondary)', background: 'var(--invoiced-row-bg, rgba(13,110,253,0.06))', borderBottom: '1px solid var(--line)', fontStyle: 'italic' }}>
                                  {t('invoice.invoicedAs')} {invNo || '—'}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button
                        onClick={handleChooseSelected}
                        disabled={selectedOrders.size === 0 && createdOrders.length === 0}
                        style={{ padding: '10px 20px', border: 'none', borderRadius: 10, background: (selectedOrders.size > 0 || createdOrders.length > 0) ? 'var(--accent)' : '#ccc', color: '#fff', cursor: (selectedOrders.size === 0 && createdOrders.length === 0) ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 500 }}
                      >
                        {t('invoice.chooseSelected')}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Confirmed view — invoice details + preview */}
              {showingConfirmed && (
                <>
                  <div style={{ fontSize: 14, marginBottom: 20 }}>
                    {confirmedOrders.map(order => (
                      <div key={order.item_id} style={{ marginBottom: 8 }}>
                        <div>{formatDate(order.order_date)} - {order.product}</div>
                        <div style={{ marginLeft: 20 }}>
                          {t('invoice.qty')}: {order.quantity} × {fmtMoney(order.unit_price)} = {fmtMoney(order.amount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button onClick={handleNewSelection} style={{ padding: '10px 20px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500, marginBottom: 20 }}>
                    {t('invoice.newSelection')}
                  </button>

                  <div className="row" style={{ marginBottom: 16 }}>
                    <div>
                      <label htmlFor="invoice-date">{t('invoice.invoiceDate')}</label>
                      <DateInput value={invoiceDate} onChange={v => setInvoiceDate(v)} />
                    </div>
                    <div>
                      <label htmlFor="due-date">{t('invoice.dueDate')}</label>
                      <DateInput value={dueDate} onChange={v => setDueDate(v)} />
                    </div>
                  </div>

                  <div className="row">
                    <div>
                      <label htmlFor="delivery-date">{t('invoice.estDeliveryDate')} (optional)</label>
                      <DateInput value={deliveryDate} onChange={v => setDeliveryDate(v)} />
                    </div>
                    <div>
                      <label htmlFor="payment-method">{t('invoice.paymentMethod')}</label>
                      <select id="payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                        {(invoiceConfig.enabledPaymentMethods.length > 0 ? invoiceConfig.enabledPaymentMethods : ['wire_transfer']).map(method => (
                          <option key={method} value={method}>
                            {method === 'wire_transfer' ? 'Wire Transfer' : method === 'ach' ? 'ACH' : method}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {(invoiceDate && dueDate) && (
                    <div style={{ marginTop: 16 }}>
                      <label>{t('invoice.invoiceNo')}</label>
                      {invoiceConfig.autoInvoiceNumber ? (
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>{invoiceNo}</div>
                      ) : (
                        <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder={lastInvoiceNo ? `${t('invoice.lastSaved')}: ${lastInvoiceNo}` : t('invoice.invoiceNoPlaceholder')} style={{ marginBottom: 20 }} />
                      )}

                      <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('invoice.companyInfo')}</div>
                          {invoiceConfig.companyName && <div>{invoiceConfig.companyName}</div>}
                          {invoiceConfig.companyAddress1 && <div>{invoiceConfig.companyAddress1}</div>}
                          {invoiceConfig.companyAddress2 && <div>{invoiceConfig.companyAddress2}</div>}
                          {invoiceConfig.companyPhone && <div>{invoiceConfig.companyPhone}</div>}
                        </div>
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('invoice.ourContact')}</div>
                          {invoiceConfig.contactName && <div>{invoiceConfig.contactName}</div>}
                        </div>
                        <div>
                          {paymentMethod === 'ach' ? (<>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('invoice.achInstructions')}</div>
                            {invoiceConfig.achBankName && <div>{t('invoice.bankName')} {invoiceConfig.achBankName}</div>}
                            {invoiceConfig.achBranch && <div>{t('tenantAdmin.achBranch')}: {invoiceConfig.achBranch}</div>}
                            {invoiceConfig.achCityState && <div>{t('tenantAdmin.achCityState')}: {invoiceConfig.achCityState}</div>}
                            {invoiceConfig.achAccountNumber && <div>{t('invoice.accountNumber')} {invoiceConfig.achAccountNumber}</div>}
                            {invoiceConfig.achAba && <div>{t('tenantAdmin.achAba')}: {invoiceConfig.achAba}</div>}
                          </>) : (<>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('invoice.wireInstructions')}</div>
                            {invoiceConfig.companyName && <div>{t('invoice.companyName')} {invoiceConfig.companyName}</div>}
                            {invoiceConfig.bankName && <div>{t('invoice.bankName')} {invoiceConfig.bankName}</div>}
                            {invoiceConfig.bankAccountName && <div>{t('invoice.accountName')} {invoiceConfig.bankAccountName}</div>}
                            {invoiceConfig.bankAccountNumber && <div>{t('invoice.accountNumber')} {invoiceConfig.bankAccountNumber}</div>}
                            {invoiceConfig.bankRoutingNumber && <div>{t('invoice.routingNumber')} {invoiceConfig.bankRoutingNumber}</div>}
                          </>)}
                        </div>
                      </div>

                      <button onClick={handlePreviewInvoice} style={{ padding: '10px 20px', border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 500 }}>
                        {t('invoice.previewInvoice')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
