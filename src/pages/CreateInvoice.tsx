import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getAuthHeaders } from '../lib/api'
import { Trans, useTranslation } from 'react-i18next'
import { formatDate } from '../lib/time'
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

export default function CreateInvoicePage() {
  const { t } = useTranslation()
  const { t: ti } = useTranslation('info')
  const navigate = useNavigate()
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
    if (!selectedCustomerId) {
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
  }, [selectedCustomerId])

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
    const selected = orders.filter(o => selectedOrders.has(o.item_id))
    setConfirmedOrders(selected)
    setShowingConfirmed(true)
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

  const { fmtMoney } = useCurrency()


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
          <div style={{ display: 'flex', gap: 40, marginBottom: 20 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="customer-select" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                {t('invoice.selectCustomer')}
              </label>
              <select
                id="customer-select"
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontSize: 14,
                  border: '1px solid #ddd',
                  borderRadius: 4,
                }}
              >
                <option value="">{t('invoice.selectCustomerPlaceholder')}</option>
                {customers.map(customer => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomer && (
              <div style={{ flex: 1 }}>
                <div style={{ marginBottom: 8, height: 21 }}></div>
                <div style={{ fontSize: 14 }}>
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
              </div>
            )}
          </div>

          {selectedCustomerId && (
            <>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                {t('invoice.selectOrders')}
              </label>

              {ordersLoading && <p>{t('invoice.loadingOrders')}</p>}

              {!ordersLoading && orders.length === 0 && (
                <p className="helper">{t('invoice.noOrdersForCustomer')}</p>
              )}

              {!ordersLoading && orders.length > 0 && (
                <>
                  {!showingConfirmed ? (
                    <>
                      <div style={{
                        border: '1px solid #ddd',
                        borderRadius: 4,
                        maxHeight: 300,
                        overflowY: 'auto',
                        marginBottom: 12
                      }}>
                        {orders.map(order => {
                          const invoiceNo = invoicedOrders.get(order.order_id)
                          const isInvoiced = invoiceNo !== undefined
                          return (
                            <div key={order.item_id}>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: 12,
                                  padding: '12px 16px',
                                  borderBottom: isInvoiced ? 'none' : '1px solid #eee',
                                  alignItems: 'flex-start',
                                  fontSize: 14,
                                  color: 'var(--text, inherit)',
                                  background: isInvoiced ? 'var(--invoiced-row-bg, rgba(13,110,253,0.06))' : undefined,
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedOrders.has(order.item_id)}
                                  onChange={() => toggleOrder(order.item_id)}
                                  style={{ cursor: 'pointer', width: 14, height: 14, marginTop: 2, flexShrink: 0 }}
                                />
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
                                <div style={{
                                  padding: '3px 16px 6px 42px',
                                  fontSize: 11,
                                  color: 'var(--text-secondary)',
                                  background: 'var(--invoiced-row-bg, rgba(13,110,253,0.06))',
                                  borderBottom: '1px solid #eee',
                                  fontStyle: 'italic',
                                }}>
                                  {t('invoice.invoicedAs')} {invoiceNo || '—'}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      <button
                        onClick={handleChooseSelected}
                        disabled={selectedOrders.size === 0}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          borderRadius: 10,
                          background: selectedOrders.size === 0 ? '#ccc' : 'var(--accent)',
                          color: '#fff',
                          cursor: selectedOrders.size === 0 ? 'not-allowed' : 'pointer',
                          fontSize: 14,
                          fontWeight: 500
                        }}
                      >
                        {t('invoice.chooseSelected')}
                      </button>
                    </>
                  ) : (
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

                      <button
                        onClick={handleNewSelection}
                        style={{
                          padding: '10px 20px',
                          border: 'none',
                          borderRadius: 10,
                          background: 'var(--accent)',
                          color: '#fff',
                          cursor: 'pointer',
                          fontSize: 14,
                          fontWeight: 500,
                          marginBottom: 20
                        }}
                      >
                        {t('invoice.newSelection')}
                      </button>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                        <div>
                          <label htmlFor="invoice-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('invoice.invoiceDate')}
                          </label>
                          <DateInput
                            value={invoiceDate}
                            onChange={v => setInvoiceDate(v)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>

                        <div>
                          <label htmlFor="due-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('invoice.dueDate')}
                          </label>
                          <DateInput
                            value={dueDate}
                            onChange={v => setDueDate(v)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div>
                          <label htmlFor="delivery-date" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('invoice.estDeliveryDate')} (optional)
                          </label>
                          <DateInput
                            value={deliveryDate}
                            onChange={v => setDeliveryDate(v)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          />
                        </div>

                        <div>
                          <label htmlFor="payment-method" style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('invoice.paymentMethod')}
                          </label>
                          <select
                            id="payment-method"
                            value={paymentMethod}
                            onChange={(e) => setPaymentMethod(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '8px 12px',
                              fontSize: 14,
                              border: '1px solid #ddd',
                              borderRadius: 4,
                            }}
                          >
                            {(invoiceConfig.enabledPaymentMethods.length > 0
                              ? invoiceConfig.enabledPaymentMethods
                              : ['wire_transfer']
                            ).map(method => (
                              <option key={method} value={method}>
                                {method === 'wire_transfer' ? 'Wire Transfer' : method === 'ach' ? 'ACH' : method}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {(invoiceDate && dueDate) && (
                        <div style={{ marginTop: 16 }}>
                          <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
                            {t('invoice.invoiceNo')}
                          </label>
                          {invoiceConfig.autoInvoiceNumber ? (
                            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 20 }}>
                              {invoiceNo}
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={invoiceNo}
                              onChange={e => setInvoiceNo(e.target.value)}
                              placeholder={lastInvoiceNo ? `${t('invoice.lastSaved')}: ${lastInvoiceNo}` : t('invoice.invoiceNoPlaceholder')}
                              style={{ marginBottom: 20, fontSize: 16 }}
                            />
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

                          <button
                            onClick={handlePreviewInvoice}
                            style={{
                              padding: '10px 20px',
                              border: 'none',
                              borderRadius: 10,
                              background: 'var(--accent)',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: 14,
                              fontWeight: 500
                            }}
                          >
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
        </>
      )}
    </div>
  )
}
