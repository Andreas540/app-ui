// src/pages/EditOrder.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { fetchBootstrap, type Person, type Product, type CardToken, getAuthHeaders } from '../lib/api'
import { todayYMD } from '../lib/time'
import { DateInput } from '../components/DateInput'
import { useCurrency } from '../lib/useCurrency'

type PartnerRef = { id: string; name: string }
type Line = { product_id: string; qtyStr: string; priceStr: string; covers_product_id: string | null; unit_identifier: string; historicalProductCost: number | null; unit_id: number | null; unit_serial: string | null; unit_condition: string | null }

function emptyLine(): Line {
  return { product_id: '', qtyStr: '', priceStr: '', covers_product_id: null, unit_identifier: '', historicalProductCost: null, unit_id: null, unit_serial: null, unit_condition: null }
}

export default function EditOrder() {
  const { t } = useTranslation()
  const { parseAmount, fmtInput, fmtMoney, fmtPct } = useCurrency()
  const { orderId } = useParams<{ orderId: string }>()
  const [generatingLink, setGeneratingLink] = useState(false)
  const [ampHasTerminal, setAmpHasTerminal] = useState(false)
  const [customerTokens, setCustomerTokens] = useState<CardToken[]>([])
  type TerminalState = 'idle' | 'initiating' | 'waiting' | 'approved' | 'declined' | 'timeout'
  const [terminalState, setTerminalState]   = useState<TerminalState>('idle')
  const [terminalMsg, setTerminalMsg]       = useState('')
  type CofState = 'idle' | 'charging' | 'approved' | 'declined'
  const [cofState, setCofState] = useState<CofState>('idle')
  const [cofMsg, setCofMsg]     = useState('')
  const terminalReceiptId = useRef<string | null>(null)
  const terminalPollRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const terminalTimeout   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const navigate = useNavigate()

  const [people, setPeople]     = useState<Person[]>([])
  const [partners, setPartners] = useState<PartnerRef[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)

  // Order header
  const [orderNo, setOrderNo]         = useState('')
  const [customerId, setCustomerId]   = useState('')
  const [customerName, setCustomerName] = useState('')
  const [orderDate, setOrderDate]     = useState<string>(todayYMD())
  const [delivered, setDelivered]     = useState(false)
  const [deliveredAt, setDeliveredAt] = useState<string>(todayYMD())
  const [notes, setNotes]             = useState('')
  const [paidAmount, setPaidAmount]   = useState(0)

  // Line items
  const [lines, setLines] = useState<Line[]>([emptyLine()])

  // Cost overrides & partner splits
  const [partner1Id, setPartner1Id]             = useState('')
  const [partner2Id, setPartner2Id]             = useState('')
  const [partner1PerItemStr, setPartner1PerItemStr] = useState('')
  const [partner2PerItemStr, setPartner2PerItemStr] = useState('')
  const [showMoreFields, setShowMoreFields]     = useState(false)
  const [productCostStr, setProductCostStr]     = useState('')
  const [shippingCostStr, setShippingCostStr]   = useState('')
  const [historicalShippingCost, setHistoricalShippingCost] = useState<number | null>(null)

  // ── Load bootstrap + order ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr(null)
        const { customers, products: prods, partners: bootPartners, ampHasTerminal: hasTerminal } = await fetchBootstrap()
        setPeople(customers)
        setProducts(prods)
        setPartners(bootPartners ?? [])
        setAmpHasTerminal(hasTerminal ?? false)

        const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
        const res = await fetch(`${base}/api/order?id=${orderId}`, { headers: getAuthHeaders() })
        if (!res.ok) throw new Error('Failed to load order')

        const orderData = await res.json()
        const order = orderData.order

        setOrderNo(order.order_no)
        setCustomerId(order.customer_id)
        setCustomerName(order.customer_name)
        fetch(`${base}/api/customer-tokens?customer_id=${order.customer_id}`, { headers: getAuthHeaders() })
          .then(r => r.ok ? r.json() : null).then(d => { if (d?.tokens) setCustomerTokens(d.tokens) }).catch(() => {})
        setOrderDate(order.order_date)
        setDelivered(order.delivered)
        setDeliveredAt(order.delivered_at || todayYMD())
        setNotes(order.notes || '')
        setPaidAmount(Number(order.paid_amount) || 0)

        // Load all items — fall back to legacy single-item fields on order row
        const loadedItems: any[] = orderData.items?.length
          ? orderData.items
          : [{ product_id: order.product_id, qty: order.qty, unit_price: order.unit_price }]
        setLines(loadedItems.map((i: any) => ({
          product_id:           i.product_id || '',
          qtyStr:               i.qty != null ? (Number(i.qty) % 1 === 0 ? String(Math.round(Number(i.qty))) : fmtInput(i.qty)) : '',
          priceStr:             i.unit_price != null ? fmtInput(i.unit_price) : '',
          covers_product_id:    i.covers_product_id ?? null,
          unit_identifier:      i.unit_identifier ?? '',
          historicalProductCost: i.historical_product_cost != null ? Number(i.historical_product_cost) : null,
          unit_id:              i.unit_id ?? null,
          unit_serial:          i.unit_serial ?? null,
          unit_condition:       i.unit_condition ?? null,
        })))

        // Cost overrides
        if (order.product_cost != null) { setProductCostStr(fmtInput(order.product_cost)); setShowMoreFields(true) }
        if (order.shipping_cost != null) { setShippingCostStr(fmtInput(order.shipping_cost)); setShowMoreFields(true) }

        // Partner splits — stored as order totals; convert to per-unit for display
        if (orderData.partner_splits?.length > 0) {
          const totalQty = loadedItems.reduce((s: number, i: any) => s + Number(i.qty), 0) || 1
          const s1 = orderData.partner_splits[0]
          setPartner1Id(s1.partner_id)
          setPartner1PerItemStr(fmtInput(s1.amount / totalQty))
          if (orderData.partner_splits.length > 1) {
            const s2 = orderData.partner_splits[1]
            setPartner2Id(s2.partner_id)
            setPartner2PerItemStr(fmtInput(s2.amount / totalQty))
          }
        }
      } catch (e: any) {
        setErr(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [orderId])

  // ── Historical costs — per line + shipping ─────────────────────────────────
  function fetchLineCost(lineIdx: number, product_id: string, date: string, cid: string) {
    if (!product_id || !cid || !date) return
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    const dateOnly = date.split('T')[0]
    fetch(`${base}/api/historical-costs?product_id=${product_id}&customer_id=${cid}&order_date=${dateOnly}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setLines(prev => prev.map((l, i) => i === lineIdx ? { ...l, historicalProductCost: d.product_cost } : l))
        if (lineIdx === 0 && d.shipping_cost !== undefined) setHistoricalShippingCost(d.shipping_cost)
      })
      .catch(() => {})
  }

  // Re-fetch all lines when order date or customer changes
  useEffect(() => {
    if (!customerId || !orderDate) return
    lines.forEach((l, i) => { if (l.product_id) fetchLineCost(i, l.product_id, orderDate, customerId) })
  }, [customerId, orderDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ──────────────────────────────────────────────────────────
  const person = useMemo(() => people.find(p => p.id === customerId), [people, customerId])
  const isPartnerCustomer = (person as any)?.customer_type === 'Partner'
  const partner2Options   = useMemo(() => partners.filter(p => p.id !== partner1Id), [partners, partner1Id])

  function parsePriceToNumber(s: string) { return parseAmount(s) }
  function parseQty(s: string) { return s.replace(/[^0-9.,]/g, '').replace(/^0+(?=\d)/, '') }

  const totalQty = useMemo(() =>
    lines.reduce((s, l) => s + (parseAmount(l.qtyStr || '0') || 0), 0),
    [lines]
  )

  const orderValue = useMemo(() => {
    let sum = 0; let valid = 0
    for (const l of lines) {
      const q = parseAmount(l.qtyStr || '0')
      const p = parsePriceToNumber(l.priceStr)
      if (!Number.isFinite(q) || q <= 0 || !Number.isFinite(p)) continue
      sum += q * p; valid++
    }
    return valid > 0 ? sum : NaN
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  const partner1PerItem = useMemo(() => parsePriceToNumber(partner1PerItemStr), [partner1PerItemStr]) // eslint-disable-line react-hooks/exhaustive-deps
  const partner2PerItem = useMemo(() => parsePriceToNumber(partner2PerItemStr), [partner2PerItemStr]) // eslint-disable-line react-hooks/exhaustive-deps

  const partner1Total = useMemo(() =>
    (Number.isFinite(partner1PerItem) && partner1PerItem > 0 && totalQty > 0) ? partner1PerItem * totalQty : 0,
    [partner1PerItem, totalQty]
  )
  const partner2Total = useMemo(() =>
    (Number.isFinite(partner2PerItem) && partner2PerItem > 0 && totalQty > 0) ? partner2PerItem * totalQty : 0,
    [partner2PerItem, totalQty]
  )

  const effectiveShippingCost = useMemo(() => {
    const ov = shippingCostStr.trim() ? parsePriceToNumber(shippingCostStr) : null
    return (ov !== null && Number.isFinite(ov)) ? ov : (historicalShippingCost ?? 0)
  }, [shippingCostStr, historicalShippingCost]) // eslint-disable-line react-hooks/exhaustive-deps

  const profit = useMemo(() => {
    if (!Number.isFinite(orderValue) || orderValue <= 0) return 0
    const productCostOverride = productCostStr.trim() ? parsePriceToNumber(productCostStr) : null
    const totalProductCost = productCostOverride !== null && Number.isFinite(productCostOverride)
      ? productCostOverride * totalQty
      : lines.reduce((s, l) => s + (parseAmount(l.qtyStr || '0') || 0) * (l.historicalProductCost ?? 0), 0)
    return orderValue - (partner1Total + partner2Total) - totalProductCost - effectiveShippingCost * totalQty
  }, [orderValue, partner1Total, partner2Total, productCostStr, lines, effectiveShippingCost, totalQty]) // eslint-disable-line react-hooks/exhaustive-deps

  const profitPercent = useMemo(() =>
    (Number.isFinite(orderValue) && orderValue > 0) ? (profit / orderValue) * 100 : 0,
    [profit, orderValue]
  )

  const firstLineIsRefund = (products.find(p => p.id === lines[0]?.product_id)?.name || '').trim().toLowerCase() === 'refund/discount'

  const { productGroup, serviceGroup, addOnGroup } = useMemo(() => {
    const sorted = [...products].sort((a, b) => a.name.localeCompare(b.name))
    return {
      addOnGroup:   sorted.filter(p => p.product_kind === 'coverage'),
      productGroup: sorted.filter(p => (p.category ?? 'product') === 'product' && p.product_kind !== 'coverage'),
      serviceGroup: sorted.filter(p => p.category === 'service' && p.product_kind !== 'coverage'),
    }
  }, [products])

  // ── Line helpers ────────────────────────────────────────────────────────────
  function updateLine(idx: number, field: keyof Line, value: string | null) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  function addLine() { setLines(prev => [...prev, emptyLine()]) }
  function removeLine(idx: number) { setLines(prev => prev.filter((_, i) => i !== idx)) }

  function onLineProductChange(idx: number, product_id: string) {
    const prod = products.find(p => p.id === product_id)
    const pa = prod?.price_amount
    const isRefund = (prod?.name || '').trim().toLowerCase() === 'refund/discount'
    const isCoverageProduct = prod?.product_kind === 'coverage'
    let priceStr = lines[idx].priceStr
    if (pa != null && pa > 0) priceStr = isRefund ? '-' + fmtInput(Math.abs(pa)) : fmtInput(pa)
    setLines(prev => prev.map((l, i) => i === idx
      ? { ...l, product_id, priceStr, qtyStr: l.qtyStr || (isCoverageProduct ? '1' : ''), historicalProductCost: null }
      : l
    ))
    fetchLineCost(idx, product_id, orderDate, customerId)
  }

  function onLinePriceChange(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const prod = products.find(p => p.id === lines[idx]?.product_id)
    const isRefund = (prod?.name || '').trim().toLowerCase() === 'refund/discount'
    const raw = e.target.value
    if (isRefund) {
      const stripped = raw.replace(/^[+-]+/, '')
      updateLine(idx, 'priceStr', stripped === '' ? '-' : '-' + stripped)
    } else {
      updateLine(idx, 'priceStr', raw.replace(/^[+-]+/, ''))
    }
  }

  function onLinePriceKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    const prod = products.find(p => p.id === lines[idx]?.product_id)
    if ((prod?.name || '').trim().toLowerCase() !== 'refund/discount') return
    const target = e.target as HTMLInputElement
    const { selectionStart, selectionEnd, value } = target
    if (e.key === 'Backspace' && selectionStart === 1 && selectionEnd === 1 && value.startsWith('-')) { e.preventDefault(); return }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selectionStart === 0 && value.startsWith('-')) { e.preventDefault(); return }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function save() {
    if (!person) { alert(t('orders.customerMissing')); return }

    for (const l of lines) {
      if (!l.product_id) { alert(t('orders.productMissing')); return }
      const qty = parseAmount(l.qtyStr || '0')
      if (!Number.isFinite(qty) || qty <= 0) { alert(t('orders.alertEnterQuantity')); return }
      const unitPrice = parsePriceToNumber(l.priceStr)
      if (!Number.isFinite(unitPrice)) { alert(t('orders.alertEnterPrice')); return }
      const prod = products.find(p => p.id === l.product_id)
      const isRefund = (prod?.name || '').trim().toLowerCase() === 'refund/discount'
      if (isRefund && !(unitPrice < 0)) { alert(t('orders.alertRefundNegative')); return }
      if (!isRefund && !(unitPrice > 0)) { alert(t('orders.alertEnterPositivePrice')); return }
    }

    const splits: Array<{ partner_id: string; amount: number }> = []
    if (isPartnerCustomer) {
      if (partner1Id && partner1PerItemStr) {
        const per = parsePriceToNumber(partner1PerItemStr)
        if (Number.isFinite(per) && per > 0 && totalQty > 0) splits.push({ partner_id: partner1Id, amount: per * totalQty })
      }
      if (partner2Id && partner2PerItemStr) {
        const per = parsePriceToNumber(partner2PerItemStr)
        if (Number.isFinite(per) && per > 0 && totalQty > 0) splits.push({ partner_id: partner2Id, amount: per * totalQty })
      }
    }

    let productCostToSend: number | undefined
    let shippingCostToSend: number | undefined
    if (productCostStr.trim()) {
      const v = parsePriceToNumber(productCostStr)
      if (Number.isFinite(v) && v > 0) productCostToSend = v
    }
    if (shippingCostStr.trim()) {
      const v = parsePriceToNumber(shippingCostStr)
      if (Number.isFinite(v) && v >= 0) shippingCostToSend = v
    }

    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          id: orderId,
          customer_id: person.id,
          items: lines.map(l => ({
            product_id:        l.product_id,
            qty:               parseAmount(l.qtyStr),
            unit_price:        parsePriceToNumber(l.priceStr),
            covers_product_id: l.covers_product_id || null,
            unit_identifier:   l.unit_id ? null : (l.unit_identifier?.trim() || null),
            unit_id:           l.unit_id ?? null,
          })),
          date:           orderDate,
          delivered,
          delivered_at:   delivered ? deliveredAt : null,
          notes:          notes.trim() || undefined,
          product_cost:   productCostToSend,
          shipping_cost:  shippingCostToSend,
          partner_splits: splits.length ? splits : undefined,
        }),
      })
      if (!res.ok) throw new Error('Failed to update order')
      alert(t('orders.orderUpdated'))
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  async function deleteOrder() {
    if (!confirm(t('orders.confirmDelete', { number: orderNo }))) return
    try {
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res = await fetch(`${base}/api/order`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ id: orderId }),
      })
      if (!res.ok) throw new Error('Failed to delete order')
      alert(t('orders.orderDeleted'))
      navigate(-1)
    } catch (e: any) {
      alert(e?.message || t('payments.alertSaveFailed'))
    }
  }

  if (loading) return <div className="card page-narrow"><p>{t('loading')}</p></div>
  if (err)     return <div className="card page-narrow"><p style={{ color: 'var(--color-error)' }}>{t('error')} {err}</p></div>

  async function generatePaymentLink() {
    if (!orderId) return
    try {
      setGeneratingLink(true)
      const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
      const res  = await fetch(`${base}/api/create-order-payment-link`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate link')
      await navigator.clipboard.writeText(data.checkout_url)
      alert(t('orders.paymentLinkCopied'))
    } catch (e: any) {
      alert(e?.message || 'Failed to generate payment link')
    } finally {
      setGeneratingLink(false)
    }
  }

  function stopTerminalPolling() {
    if (terminalPollRef.current)  { clearInterval(terminalPollRef.current);  terminalPollRef.current = null }
    if (terminalTimeout.current)  { clearTimeout(terminalTimeout.current);   terminalTimeout.current = null }
  }

  async function chargeTerminal() {
    if (!orderId || terminalState !== 'idle') return
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    try {
      setTerminalState('initiating')
      setTerminalMsg('')
      const initRes = await fetch(`${base}/api/amp-terminal-initiate`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId }),
      })
      const initData = await initRes.json()
      if (!initRes.ok) throw new Error(initData.error || 'Failed to reach terminal')
      terminalReceiptId.current = initData.receipt_id
      setTerminalState('waiting')

      // 60-second hard timeout
      terminalTimeout.current = setTimeout(() => {
        stopTerminalPolling()
        setTerminalState('timeout')
      }, 60_000)

      // Poll every 3 seconds
      terminalPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${base}/api/amp-terminal-poll`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ receipt_id: terminalReceiptId.current, order_id: orderId }),
          })
          const pollData = await pollRes.json()
          if (pollData.status === 'pending') return
          stopTerminalPolling()
          if (pollData.status === 'approved') {
            setTerminalState('approved')
            setTerminalMsg(`${t('orders.terminalApproved')} · ${pollData.card_type || ''} ···${pollData.last_four || ''}`)
            setPaidAmount(prev => prev + (pollData.amount || 0))
          } else {
            setTerminalState('declined')
            setTerminalMsg(pollData.message || t('orders.terminalDeclined'))
          }
        } catch {
          // network hiccup — keep polling
        }
      }, 3_000)
    } catch (e: any) {
      stopTerminalPolling()
      setTerminalState('idle')
      alert(e?.message || t('orders.terminalError'))
    }
  }

  function cancelTerminal() {
    stopTerminalPolling()
    setTerminalState('idle')
    setTerminalMsg('')
  }

  async function chargeCardOnFile() {
    if (!orderId || cofState !== 'idle' || !customerTokens.length) return
    const token = customerTokens[0]
    const base = import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''
    try {
      setCofState('charging')
      setCofMsg('')
      const res = await fetch(`${base}/api/amp-card-on-file`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ order_id: orderId, token_id: token.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('orders.cofError'))
      if (data.status === 'approved') {
        setCofState('approved')
        setCofMsg(`${t('orders.terminalApproved')} · ${data.card_type || ''} ···${data.last_four || ''}`)
        setPaidAmount(prev => prev + (data.amount || 0))
      } else {
        setCofState('declined')
        setCofMsg(data.message || t('orders.terminalDeclined'))
      }
    } catch (e: any) {
      setCofState('idle')
      alert(e?.message || t('orders.cofError'))
    }
  }

  const CONTROL_H = 44

  return (
    <div className="card page-narrow">

      {/* Header: title + profit */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('orders.editOrderTitle')}</h3>
          <div className="helper" style={{ marginTop: 4 }}>{t('orders.orderNumber', { number: orderNo })}</div>
        </div>
        {Number.isFinite(orderValue) && orderValue > 0 && !firstLineIsRefund && (
          <div style={{ textAlign: 'right', fontSize: 14 }}>
            <div style={{ color: 'var(--text-secondary)' }}>{t('orders.profit')}</div>
            <div style={{ fontWeight: 600, fontSize: 16, color: profit >= 0 ? 'var(--primary)' : 'var(--color-error)' }}>
              {fmtMoney(profit)}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 2 }}>
              {fmtPct(profitPercent)}
            </div>
          </div>
        )}
      </div>

      {/* Customer (read-only) */}
      <div style={{ marginTop: 12 }}>
        <label>{t('customer')}</label>
        <input type="text" value={customerName} readOnly style={{ height: CONTROL_H, opacity: 0.9 }} />
      </div>

      {/* Order date */}
      <div style={{ marginTop: 12, maxWidth: '50%', paddingRight: 6 }}>
        <label>{t('orders.orderDate')}</label>
        <DateInput value={orderDate} onChange={v => setOrderDate(v)} style={{ height: CONTROL_H }} />
      </div>

      {/* Line items */}
      {lines.map((l, idx) => {
        const prod         = products.find(p => p.id === l.product_id)
        const isRefund     = (prod?.name || '').trim().toLowerCase() === 'refund/discount'
        const isCoverage   = prod?.product_kind === 'coverage'
        const hasUnit      = !!l.unit_id
        const coveredLines = lines.filter((ol, oi) => oi !== idx && products.find(p => p.id === ol.product_id)?.product_kind !== 'coverage')
        return (
          <div key={idx}>
            <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
              <div>
                <label>{t('product')}</label>
                <select
                  value={l.product_id}
                  onChange={e => onLineProductChange(idx, e.target.value)}
                  style={{ height: CONTROL_H }}
                >
                  {!l.product_id && <option value="">{t('orders.selectProduct')}</option>}
                  {productGroup.length > 0 && (
                    <optgroup label={t('orders.groupProducts')}>
                      {productGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {serviceGroup.length > 0 && (
                    <optgroup label={t('orders.groupServices')}>
                      {serviceGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                  {addOnGroup.length > 0 && (
                    <optgroup label={t('orders.groupAddOns')}>
                      {addOnGroup.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label>{t('quantity')}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={l.qtyStr}
                  readOnly={hasUnit}
                  onChange={e => { if (hasUnit) return; updateLine(idx, 'qtyStr', parseQty(e.target.value)) }}
                  style={{ height: CONTROL_H, opacity: hasUnit ? 0.6 : undefined }}
                />
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>{t('orders.orderPriceUSD')}</label>
                {lines.length > 1 && (
                  <button
                    onClick={() => removeLine(idx)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: 13, padding: '0 0 4px' }}
                  >
                    {t('orders.removeProduct')}
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder={isRefund ? '-' + fmtInput(0) : fmtInput(0)}
                value={l.priceStr}
                onChange={e => onLinePriceChange(idx, e)}
                onKeyDown={e => onLinePriceKeyDown(idx, e)}
                style={{ height: CONTROL_H }}
              />
            </div>
            {isCoverage && coveredLines.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <label>{t('orders.coversProduct')}</label>
                <select
                  value={l.covers_product_id ?? ''}
                  onChange={e => updateLine(idx, 'covers_product_id', e.target.value || null)}
                  style={{ height: CONTROL_H }}
                >
                  <option value="">{t('orders.coversProductNone')}</option>
                  {coveredLines.map((ol, oi) => {
                    const op = products.find(p => p.id === ol.product_id)
                    return <option key={oi} value={ol.product_id}>{op?.name ?? ol.product_id}</option>
                  })}
                </select>
              </div>
            )}
            {!isCoverage && hasUnit && (
              <div style={{ marginTop: 8 }}>
                <label>{t('orders.unitIdentifier')}</label>
                <input
                  type="text"
                  readOnly
                  value={l.unit_serial ?? ''}
                  style={{ height: CONTROL_H, opacity: 0.6 }}
                />
              </div>
            )}
            {!isCoverage && !hasUnit && (
              <div style={{ marginTop: 8 }}>
                <label>{t('orders.unitIdentifier')}</label>
                <input
                  type="text"
                  placeholder={t('orders.unitIdentifierPlaceholder')}
                  value={l.unit_identifier}
                  onChange={e => updateLine(idx, 'unit_identifier', e.target.value)}
                  style={{ height: CONTROL_H }}
                />
              </div>
            )}
          </div>
        )
      })}

      {/* Add product */}
      <div style={{ marginTop: 8 }}>
        <button
          onClick={addLine}
          style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, padding: 0 }}
        >
          + {t('orders.addProduct')}
        </button>
      </div>

      {/* Order value | Delivered */}
      <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
        <div>
          <label>{t('orders.orderValueUSD')}</label>
          <input
            type="text"
            value={Number.isFinite(orderValue) ? fmtInput(orderValue) : ''}
            placeholder="auto"
            readOnly
            style={{ height: CONTROL_H, opacity: 0.9 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'end' }}>
          <label style={{ width: '100%' }}>
            {t('fullyDelivered')}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={delivered}
                onChange={e => setDelivered(e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
              <span className="helper">{delivered ? t('yes') : t('no')}</span>
            </div>
          </label>
        </div>
        {delivered && (
          <div>
            <label>{t('customerDetail.deliveryDate')}</label>
            <DateInput value={deliveredAt} onChange={setDeliveredAt} style={{ height: CONTROL_H }} />
          </div>
        )}
      </div>

      {/* Partner splits */}
      {isPartnerCustomer && (
        <>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12 }}>
            <div>
              <label>{t('orders.partner1')}</label>
              <select value={partner1Id} onChange={e => setPartner1Id(e.target.value)} style={{ height: CONTROL_H }}>
                <option value="">—</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label>{t('orders.perItem')}</label>
              <input type="text" inputMode="decimal" placeholder={fmtInput(0)} value={partner1PerItemStr} onChange={e => setPartner1PerItemStr(e.target.value)} style={{ height: CONTROL_H }} />
            </div>
            <div>
              <label>{t('orders.toPartner1USD')}</label>
              <input type="text" value={partner1Total > 0 ? fmtInput(partner1Total) : ''} placeholder="auto" readOnly style={{ height: CONTROL_H, opacity: 0.6 }} />
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 12 }}>
            <div>
              <label>{t('orders.partner2')}</label>
              <select value={partner2Id} onChange={e => setPartner2Id(e.target.value)} style={{ height: CONTROL_H }}>
                <option value="">—</option>
                {partner2Options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label>{t('orders.perItem')}</label>
              <input type="text" inputMode="decimal" placeholder={fmtInput(0)} value={partner2PerItemStr} onChange={e => setPartner2PerItemStr(e.target.value)} style={{ height: CONTROL_H }} />
            </div>
            <div>
              <label>{t('orders.toPartner2USD')}</label>
              <input type="text" value={partner2Total > 0 ? fmtInput(partner2Total) : ''} placeholder="auto" readOnly style={{ height: CONTROL_H, opacity: 0.6 }} />
            </div>
          </div>
        </>
      )}

      {/* Notes */}
      <div style={{ marginTop: 12 }}>
        <label>{t('notesOptional')}</label>
        <input type="text" placeholder={t('optionalNotesPlaceholder')} value={notes} onChange={e => setNotes(e.target.value)} style={{ height: CONTROL_H }} />
      </div>

      {/* More fields */}
      {showMoreFields && (
        <div className="row row-2col-mobile" style={{ marginTop: 12 }}>
          <div>
            <label>{t('orders.productCostThisOrder')}</label>
            <input type="text" inputMode="decimal" placeholder={fmtInput(0)} value={productCostStr} onChange={e => setProductCostStr(e.target.value)} style={{ height: CONTROL_H }} />
          </div>
          <div>
            <label>{t('orders.shippingCostThisOrder')}</label>
            <input type="text" inputMode="decimal" placeholder={fmtInput(0)} value={shippingCostStr} onChange={e => setShippingCostStr(e.target.value)} style={{ height: CONTROL_H }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="primary" onClick={save} style={{ height: CONTROL_H }}>{t('saveChanges')}</button>
        <button onClick={() => navigate(-1)} style={{ height: CONTROL_H }}>{t('cancel')}</button>
        <button onClick={() => setShowMoreFields(v => !v)} style={{ height: CONTROL_H }}>{t('orders.more')}</button>
        {Number.isFinite(orderValue) && orderValue > paidAmount && (
          <button
            onClick={generatePaymentLink}
            disabled={generatingLink}
            style={{ height: CONTROL_H }}
            title={t('orders.paymentLinkTitle')}
          >
            {generatingLink
              ? t('orders.generatingLink')
              : paidAmount > 0
                ? `${t('orders.paymentLink')} (${fmtMoney(orderValue - paidAmount)} remaining)`
                : t('orders.paymentLink')}
          </button>
        )}
        {ampHasTerminal && Number.isFinite(orderValue) && orderValue > paidAmount && terminalState === 'idle' && (
          <button onClick={chargeTerminal} style={{ height: CONTROL_H }}>
            {paidAmount > 0
              ? `${t('orders.chargeTerminal')} (${fmtMoney(orderValue - paidAmount)} remaining)`
              : t('orders.chargeTerminal')}
          </button>
        )}
        {customerTokens.length > 0 && Number.isFinite(orderValue) && orderValue > paidAmount && cofState === 'idle' && (
          <button onClick={chargeCardOnFile} style={{ height: CONTROL_H }}>
            {`${t('orders.chargeCardOnFile')} · ${customerTokens[0].card_type || ''} ···${customerTokens[0].last_four || ''}`}
            {paidAmount > 0 ? ` (${fmtMoney(orderValue - paidAmount)} remaining)` : ''}
          </button>
        )}
        <button
          onClick={deleteOrder}
          style={{ height: CONTROL_H, marginLeft: 'auto', backgroundColor: 'var(--color-error)', color: 'white', border: 'none' }}
        >
          {t('delete')}
        </button>
      </div>

      {/* Card-on-file charge status */}
      {cofState !== 'idle' && (
        <div style={{
          marginTop: 12, padding: '12px 14px',
          border: `1px solid ${cofState === 'approved' ? 'var(--color-success, #10b981)' : cofState === 'declined' ? 'var(--color-error)' : 'var(--border)'}`,
          borderRadius: 8, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          {cofState === 'charging' && <span style={{ color: 'var(--text-secondary)' }}>{t('orders.cofCharging')}</span>}
          {cofState === 'approved' && <span style={{ color: 'var(--color-success, #10b981)', fontWeight: 600 }}>✓ {cofMsg}</span>}
          {cofState === 'declined' && <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{t('orders.terminalDeclined')}: {cofMsg}</span>}
          {(cofState === 'approved' || cofState === 'declined') && (
            <button onClick={() => { setCofState('idle'); setCofMsg('') }} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>
              {t('close')}
            </button>
          )}
        </div>
      )}

      {/* Terminal charge status */}
      {terminalState !== 'idle' && (
        <div style={{
          marginTop: 12, padding: '12px 14px',
          border: `1px solid ${terminalState === 'approved' ? 'var(--color-success, #10b981)' : terminalState === 'declined' || terminalState === 'timeout' ? 'var(--color-error)' : 'var(--border)'}`,
          borderRadius: 8, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          {(terminalState === 'initiating' || terminalState === 'waiting') && (
            <span style={{ color: 'var(--text-secondary)' }}>
              {terminalState === 'initiating' ? t('orders.terminalConnecting') : t('orders.terminalWaiting')}
            </span>
          )}
          {terminalState === 'approved' && (
            <span style={{ color: 'var(--color-success, #10b981)', fontWeight: 600 }}>✓ {terminalMsg}</span>
          )}
          {terminalState === 'declined' && (
            <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{t('orders.terminalDeclined')}: {terminalMsg}</span>
          )}
          {terminalState === 'timeout' && (
            <span style={{ color: 'var(--color-error)' }}>{t('orders.terminalTimeout')}</span>
          )}
          {(terminalState === 'waiting' || terminalState === 'initiating') && (
            <button onClick={cancelTerminal} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>
              {t('cancel')}
            </button>
          )}
          {(terminalState === 'approved' || terminalState === 'declined' || terminalState === 'timeout') && (
            <button onClick={cancelTerminal} style={{ height: 30, padding: '0 12px', fontSize: 12 }}>
              {t('close')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
