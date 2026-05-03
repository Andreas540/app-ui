// netlify/functions/public-booking.mjs
// Public (unauthenticated) booking API.
//
// GET  ?slug=X                                         → tenant + services + availability map
// GET  ?slug=X&service_id=Y&date=Z                     → available time slots for that date
// GET  ?slug=X&customer_token=T                        → same, with customer-specific overrides
// POST { slug, service_id, date, start_time, ... }     → create booking

import crypto from 'crypto'

function base64urlDecodeToString(b64url) {
  const b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
  return Buffer.from(b64 + pad, 'base64').toString('utf8')
}

function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function verifyCustomerToken(token) {
  const secret = process.env.CUSTOMER_TOKEN_SECRET
  if (!secret || !token) return null
  try {
    const parts = String(token).split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sigB64] = parts
    const payloadStr = base64urlDecodeToString(payloadB64)
    const payload = JSON.parse(payloadStr)
    const expectedSig = base64urlEncode(crypto.createHmac('sha256', secret).update(payloadB64).digest())
    const aa = Buffer.from(expectedSig); const bb = Buffer.from(sigB64)
    if (aa.length !== bb.length || !crypto.timingSafeEqual(aa, bb)) return null
    if (Math.floor(Date.now() / 1000) > Number(payload.exp)) return null
    return payload
  } catch { return null }
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')  return getBookingData(event)
  if (event.httpMethod === 'POST') return createBooking(event)
  return cors(405, { error: 'Method not allowed' })
}

// ── GET ────────────────────────────────────────────────────────────────────

async function getBookingData(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const params         = event.queryStringParameters || {}
    const slug           = (params.slug || '').toLowerCase().trim()
    const service_id     = params.service_id
    const date           = params.date        // YYYY-MM-DD
    const booking_id     = params.booking_id  // post-payment confirmation fetch
    const customerToken  = params.customer_token || null
    const customerPayload = customerToken ? verifyCustomerToken(customerToken) : null
    const customerId     = customerPayload?.customer_id || null

    // ── Booking detail fetch (post-payment return) ─────────────────────────
    if (booking_id && slug) {
      const rows = await sql`
        SELECT b.id, b.booking_status, b.payment_status,
               b.total_amount, b.currency,
               to_char(b.start_at AT TIME ZONE COALESCE(t.default_timezone, 'UTC'), 'YYYY-MM-DD') AS booking_date,
               to_char(b.start_at AT TIME ZONE COALESCE(t.default_timezone, 'UTC'), 'HH24:MI')    AS booking_time,
               p.name AS service_name, p.duration_minutes,
               t.name AS tenant_name
        FROM bookings b
        JOIN products p  ON p.id = b.service_id
        JOIN tenants  t  ON t.id = b.tenant_id
        WHERE b.id           = ${booking_id}::uuid
          AND t.booking_slug = ${slug}
        LIMIT 1
      `
      if (!rows.length) return cors(404, { error: 'Booking not found' })
      const bk = rows[0]
      return cors(200, {
        booking_id:       bk.id,
        booking_status:   bk.booking_status,
        payment_status:   bk.payment_status,
        service_name:     bk.service_name,
        date:             bk.booking_date,
        start_time:       bk.booking_time,
        duration_minutes: bk.duration_minutes || 0,
        price:            Number(bk.total_amount),
        currency:         bk.currency || 'USD',
        tenant_name:      bk.tenant_name,
      })
    }

    if (!slug) return cors(400, { error: 'slug is required' })

    // Look up tenant by booking slug
    const tenantRows = await sql`
      SELECT id, name, default_timezone, default_language, app_icon_192
      FROM tenants
      WHERE booking_slug = ${slug}
      LIMIT 1
    `
    if (!tenantRows.length) return cors(404, { error: 'Booking page not found' })
    const tenant   = tenantRows[0]
    const tenantId = tenant.id
    const tenantTz = tenant.default_timezone || 'UTC'

    // ── Slots request ──────────────────────────────────────────────────────
    if (service_id && date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return cors(400, { error: 'Invalid date format' })

      // Verify service belongs to tenant
      const svcRows = await sql`
        SELECT id, duration_minutes, price_amount
        FROM products
        WHERE id = ${service_id} AND tenant_id = ${tenantId} AND category = 'service'
        LIMIT 1
      `
      if (!svcRows.length) return cors(404, { error: 'Service not found' })
      const durationMin = svcRows[0].duration_minutes || 60

      // Day of week for requested date (parse as local date)
      const [dy, dm, dd] = date.split('-').map(Number)
      const dow = new Date(dy, dm - 1, dd).getDay()

      // Get availability window — customer-specific if token present, else service default
      let availRows = []
      if (customerId) {
        availRows = await sql`
          SELECT start_time, end_time
          FROM customer_service_availability
          WHERE tenant_id   = ${tenantId}
            AND customer_id = ${customerId}::uuid
            AND service_id  = ${service_id}
            AND day_of_week = ${dow}
          LIMIT 1
        `.catch(() => [])
      }
      if (!availRows.length) {
        availRows = await sql`
          SELECT start_time, end_time
          FROM service_availability
          WHERE tenant_id = ${tenantId} AND service_id = ${service_id} AND day_of_week = ${dow}
          LIMIT 1
        `
      }
      if (!availRows.length) return cors(200, { slots: [] })  // not available that day

      const startTime = String(availRows[0].start_time).slice(0, 5)
      const endTime   = String(availRows[0].end_time).slice(0, 5)

      // Generate candidate slots
      const allSlots = generateSlots(startTime, endTime, durationMin)

      // Find already-booked slots for that date + service
      const bookedRows = await sql`
        SELECT to_char(start_at AT TIME ZONE ${tenantTz}, 'HH24:MI') AS slot_time
        FROM bookings
        WHERE tenant_id    = ${tenantId}
          AND service_id   = ${service_id}
          AND booking_status NOT IN ('canceled')
          AND (start_at AT TIME ZONE ${tenantTz})::date = ${date}::date
      `
      const booked = new Set(bookedRows.map(r => r.slot_time))

      // Only return future slots (compared to now in tenant timezone)
      const nowInTz = new Date().toLocaleString('en-CA', { timeZone: tenantTz })
      const todayStr = nowInTz.slice(0, 10)
      const nowTime  = nowInTz.slice(11, 16)

      const slots = allSlots.filter(s => {
        if (booked.has(s)) return false
        if (date === todayStr && s <= nowTime) return false
        return true
      })

      return cors(200, { slots })
    }

    // Fetch known customer info when a valid token is present
    let knownCustomer = null
    if (customerId) {
      const custRows = await sql`
        SELECT name, email FROM customers
        WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}
        LIMIT 1
      `.catch(() => [])
      if (custRows.length) knownCustomer = { name: custRows[0].name, email: custRows[0].email }
    }

    // ── Services + availability map request ───────────────────────────────
    let rawServices = await sql`
      SELECT id, name, duration_minutes, price_amount, currency
      FROM products
      WHERE tenant_id = ${tenantId} AND category = 'service'
      ORDER BY name
    `

    // Apply customer-specific service overrides when token present
    if (customerId) {
      const offerRows = await sql`
        SELECT service_id, price_amount, duration_minutes, is_available
        FROM customer_service_offers
        WHERE tenant_id   = ${tenantId}
          AND customer_id = ${customerId}::uuid
      `.catch(() => [])

      const offerMap = {}
      for (const o of offerRows) offerMap[o.service_id] = o

      rawServices = rawServices
        .filter(s => offerMap[s.id]?.is_available !== false)
        .map(s => {
          const o = offerMap[s.id]
          if (!o) return s
          return {
            ...s,
            price_amount:     o.price_amount     ?? s.price_amount,
            duration_minutes: o.duration_minutes ?? s.duration_minutes,
          }
        })
    }
    const services = rawServices

    // Availability days — prefer customer-specific, fall back to service defaults
    let availRows
    if (customerId) {
      const custAvail = await sql`
        SELECT service_id, day_of_week
        FROM customer_service_availability
        WHERE tenant_id   = ${tenantId}
          AND customer_id = ${customerId}::uuid
        ORDER BY service_id, day_of_week
      `.catch(() => [])

      if (custAvail.length > 0) {
        // Merge: customer overrides for services they have, default for the rest
        const custServiceIds = new Set(custAvail.map(r => r.service_id))
        const defaultForRest = await sql`
          SELECT service_id, day_of_week
          FROM service_availability
          WHERE tenant_id  = ${tenantId}
            AND service_id NOT IN (SELECT UNNEST(${[...custServiceIds]}::uuid[]))
          ORDER BY service_id, day_of_week
        `.catch(() => [])
        availRows = [...custAvail, ...defaultForRest]
      } else {
        availRows = await sql`
          SELECT service_id, day_of_week
          FROM service_availability
          WHERE tenant_id = ${tenantId}
          ORDER BY service_id, day_of_week
        `
      }
    } else {
      availRows = await sql`
        SELECT service_id, day_of_week
        FROM service_availability
        WHERE tenant_id = ${tenantId}
        ORDER BY service_id, day_of_week
      `
    }

    // Build map: service_id → [dow, ...]
    const availability = {}
    for (const row of availRows) {
      if (!availability[row.service_id]) availability[row.service_id] = []
      availability[row.service_id].push(row.day_of_week)
    }

    // Check if tenant has any active payment provider
    const paymentRows = await sql`
      SELECT 1 FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `.catch(() => [])

    return cors(200, {
      tenant:         { name: tenant.name, icon_url: tenant.app_icon_192 || null, language: tenant.default_language || 'en' },
      services,
      availability,
      requiresPayment:  paymentRows.length > 0,
      knownCustomer,   // { name, email } when a valid customer_token is present, else null
    })

  } catch (e) {
    console.error('public-booking GET error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── POST ───────────────────────────────────────────────────────────────────

async function createBooking(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    const sql = neon(DATABASE_URL)

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf-8')
      : (event.body || '{}')
    const body = JSON.parse(rawBody)

    const { slug, service_id, date, start_time, name, email, phone, sms_consent } = body

    // Validate required fields
    if (!slug)       return cors(400, { error: 'slug is required' })
    if (!service_id) return cors(400, { error: 'service_id is required' })
    if (!date)       return cors(400, { error: 'date is required' })
    if (!start_time) return cors(400, { error: 'start_time is required' })

    // customer_token in query params identifies an existing customer — skip name/email validation
    const postToken = (event.queryStringParameters || {}).customer_token || null
    const postTokenPayload = postToken ? verifyCustomerToken(postToken) : null
    const tokenCustomerId  = postTokenPayload?.customer_id || null

    if (!tokenCustomerId) {
      if (!name?.trim())  return cors(400, { error: 'name is required' })
      if (!email?.trim()) return cors(400, { error: 'email is required' })
    }

    // Look up tenant
    const tenantRows = await sql`
      SELECT id, name, default_timezone
      FROM tenants WHERE booking_slug = ${slug.toLowerCase()} LIMIT 1
    `
    if (!tenantRows.length) return cors(404, { error: 'Booking page not found' })
    const tenant   = tenantRows[0]
    const tenantId = tenant.id
    const tenantTz = tenant.default_timezone || 'UTC'

    // Validate service
    const svcRows = await sql`
      SELECT id, name, duration_minutes, price_amount, currency
      FROM products
      WHERE id = ${service_id} AND tenant_id = ${tenantId} AND category = 'service'
      LIMIT 1
    `
    if (!svcRows.length) return cors(404, { error: 'Service not found' })
    const svc = svcRows[0]
    const durationMin = svc.duration_minutes || 60
    const price    = Number(svc.price_amount ?? 0)
    const currency = svc.currency || 'USD'

    // Check the slot is still available (prevent race conditions)
    const [dy, dm, dd] = date.split('-').map(Number)
    const dow = new Date(dy, dm - 1, dd).getDay()

    const availRows = await sql`
      SELECT start_time, end_time FROM service_availability
      WHERE tenant_id = ${tenantId} AND service_id = ${service_id} AND day_of_week = ${dow}
      LIMIT 1
    `
    if (!availRows.length) return cors(400, { error: 'This service is not available on that day' })

    const alreadyBooked = await sql`
      SELECT id FROM bookings
      WHERE tenant_id  = ${tenantId}
        AND service_id = ${service_id}
        AND booking_status NOT IN ('canceled')
        AND (start_at AT TIME ZONE ${tenantTz})::date = ${date}::date
        AND to_char(start_at AT TIME ZONE ${tenantTz}, 'HH24:MI') = ${start_time.slice(0, 5)}
      LIMIT 1
    `
    if (alreadyBooked.length) return cors(409, { error: 'That time slot is no longer available. Please choose another.' })

    // Ensure services table row exists (FK on bookings.service_id)
    await sql`
      INSERT INTO services (id, tenant_id, name, service_type, duration_minutes, price_amount, currency)
      VALUES (${service_id}, ${tenantId}, ${svc.name}, 'manual', ${durationMin}, ${price}, ${currency})
      ON CONFLICT (id) DO NOTHING
    `

    const cleanPhone = phone?.trim() || null
    const cleanName  = name?.trim() || ''
    const cleanEmail = email?.trim().toLowerCase() || ''

    let customerId
    if (tokenCustomerId) {
      // Known customer from token — use them directly, never create a duplicate
      customerId = tokenCustomerId
      await sql`
        UPDATE customers
        SET phone       = COALESCE(phone, ${cleanPhone}),
            sms_consent = CASE WHEN ${!!sms_consent} THEN true ELSE sms_consent END
        WHERE id = ${customerId}::uuid AND tenant_id = ${tenantId}
      `
    } else {
      // Anonymous booking — find or create by email
      const existingCust = await sql`
        SELECT id FROM customers
        WHERE tenant_id = ${tenantId} AND email = ${cleanEmail}
        LIMIT 1
      `
      if (existingCust.length) {
        customerId = existingCust[0].id
        await sql`
          UPDATE customers
          SET phone       = COALESCE(phone, ${cleanPhone}),
              name        = COALESCE(NULLIF(name,''), ${cleanName}),
              sms_consent = CASE WHEN ${!!sms_consent} THEN true ELSE sms_consent END
          WHERE id = ${customerId}
        `
      } else {
        const newCust = await sql`
          INSERT INTO customers (tenant_id, name, email, phone, customer_type, sms_consent)
          VALUES (${tenantId}, ${cleanName}, ${cleanEmail}, ${cleanPhone}, 'Direct', ${!!sms_consent})
          RETURNING id
        `
        customerId = newCust[0].id
      }
    }

    // Convert local date+time to UTC
    const localStr = `${date}T${start_time.slice(0, 5)}:00`
    const startAt  = localToUtc(localStr, tenantTz)
    if (!startAt || isNaN(startAt.getTime())) return cors(400, { error: 'Invalid date or time' })
    const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000)

    // Check which payment provider is enabled for this tenant (Stripe preferred)
    const stripeRows = await sql`
      SELECT secret_key FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND provider = 'stripe' AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `.catch(() => [])
    const stripeSecretKey = stripeRows[0]?.secret_key || null

    const ampRows = !stripeSecretKey ? await sql`
      SELECT publishable_key AS account, secret_key AS apikey, webhook_secret AS callback_secret
      FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND provider = 'amp' AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `.catch(() => []) : []
    const ampConfig = ampRows[0] || null

    const hasPayment = (stripeSecretKey || ampConfig) && price > 0

    // Determine initial booking status
    const bookingStatus = hasPayment ? 'pending_payment' : 'confirmed'
    const paymentStatus = hasPayment ? 'pending'          : 'unpaid'

    // Create booking
    const bkRow = await sql`
      INSERT INTO bookings (
        tenant_id, customer_id, service_id,
        booking_status, payment_status,
        start_at, end_at, participant_count, total_amount, currency
      ) VALUES (
        ${tenantId}, ${customerId}, ${service_id},
        ${bookingStatus}, ${paymentStatus},
        ${startAt.toISOString()}, ${endAt.toISOString()},
        1, ${price}, ${currency}
      )
      RETURNING id
    `
    const bookingId = bkRow[0].id

    // For free/no-payment bookings, create the order immediately.
    // For payment-required bookings, the order is created by the payment webhook after confirmation.
    if (!hasPayment) {
      const counterRow = await sql`
        INSERT INTO tenant_order_counters (tenant_id, last_order_no)
        VALUES (
          ${tenantId},
          (SELECT COALESCE(MAX(order_no), 0) + 1 FROM orders WHERE tenant_id = ${tenantId})
        )
        ON CONFLICT (tenant_id) DO UPDATE
          SET last_order_no = GREATEST(EXCLUDED.last_order_no, tenant_order_counters.last_order_no + 1)
        RETURNING last_order_no
      `
      const orderRow = await sql`
        INSERT INTO orders (tenant_id, customer_id, order_no, order_date, delivered, booking_id)
        VALUES (${tenantId}, ${customerId}, ${counterRow[0].last_order_no}, ${date}, FALSE, ${bookingId})
        RETURNING id
      `
      const orderId = orderRow[0].id
      await sql`
        INSERT INTO order_items (order_id, service_id, product_id, qty, unit_price)
        VALUES (${orderId}, ${service_id}, ${service_id}, 1, ${price})
      `
      await sql`UPDATE bookings SET order_id = ${orderId} WHERE id = ${bookingId}`
    }

    // Log external event (fire and forget)
    sql`
      INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
      VALUES (${tenantId}, 'booking', ${cleanName}, ${JSON.stringify({ service_name: svc.name, date, start_time: start_time.slice(0, 5) })}::jsonb)
    `.catch(err => console.error('external_events insert failed:', err))

    const appBase = `https://${event.headers['x-forwarded-host'] || event.headers.host}`

    // ── Stripe Checkout ───────────────────────────────────────────────────────
    if (stripeSecretKey && price > 0) {
      const Stripe = (await import('stripe')).default
      const stripe  = new Stripe(stripeSecretKey)

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
        line_items: [{
          price_data: {
            currency:     currency.toLowerCase(),
            product_data: { name: svc.name },
            unit_amount:  Math.round(price * 100),
          },
          quantity: 1,
        }],
        customer_email: cleanEmail,
        metadata: { type: 'booking', booking_id: bookingId, tenant_id: tenantId },
        success_url: `${appBase}/book/${slug}?booking_success=${bookingId}`,
        cancel_url:  `${appBase}/book/${slug}?booking_canceled=1`,
      })

      return cors(200, { checkout_url: session.url })
    }

    // ── AMP Payments Checkout ─────────────────────────────────────────────────
    if (ampConfig && price > 0) {
      const { createHmac } = await import('crypto')
      const sig = ampConfig.callback_secret
        ? createHmac('sha256', ampConfig.callback_secret)
            .update(`${bookingId}:${tenantId}`)
            .digest('hex')
        : null

      const ptkRes = await fetch('https://postransactions.com/cnp/getptk.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ampConfig.apikey },
        body: JSON.stringify({
          account:     ampConfig.account,
          method:      'creditsale',
          amount:      price,
          ticketid:    `BK-${bookingId.slice(0, 12)}`,
          paysource:   'INTERNET',
          notes:       svc.name,
          successurl:  `${appBase}/book/${slug}?booking_success=${bookingId}`,
          failureurl:  `${appBase}/book/${slug}?booking_canceled=1`,
          responseurl: `${appBase}/api/amp-payment-webhook?tenant_id=${tenantId}`,
          ...(sig ? { extfield1: sig } : {}),
          extfield2: bookingId, // echoed back so webhook can identify booking
          extfield3: 'booking', // signals webhook this is a booking, not an order
          ...(cleanEmail ? { email: cleanEmail } : {}),
        }),
      })
      const ptkData = await ptkRes.json()
      if (!ptkData.success || !ptkData.data?.ptk) {
        console.error('AMP PTK failed for booking:', ptkData)
        return cors(502, { error: ptkData.message || 'Failed to generate payment session' })
      }
      return cors(200, { checkout_url: `https://postransactions.com/cnp/cnp?ptk=${ptkData.data.ptk}` })
    }

    // ── No payment required — return confirmation directly ────────────────────
    return cors(201, {
      ok:               true,
      booking_id:       bookingId,
      tenant_name:      tenant.name,
      service_name:     svc.name,
      date,
      start_time:       start_time.slice(0, 5),
      duration_minutes: durationMin,
      price,
      currency,
    })

  } catch (e) {
    console.error('public-booking POST error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateSlots(startTime, endTime, durationMinutes) {
  const [sh, sm] = startTime.split(':').map(Number)
  const [eh, em] = endTime.split(':').map(Number)
  const startMin = sh * 60 + sm
  const endMin   = eh * 60 + em
  const slots = []
  for (let t = startMin; t + durationMinutes <= endMin; t += durationMinutes) {
    slots.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`)
  }
  return slots
}

function localToUtc(localStr, tz) {
  const cleanStr = localStr.trim().replace(' ', 'T')
  const approxUtc = new Date(cleanStr + 'Z')
  if (isNaN(approxUtc.getTime())) return null
  if (!tz || tz === 'UTC') return approxUtc
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(approxUtc).map(p => [p.type, p.value]))
  const h = parts.hour === '24' ? '00' : parts.hour
  const localAtApprox = new Date(`${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}:${parts.second}Z`)
  const offsetMs = localAtApprox.getTime() - approxUtc.getTime()
  return new Date(approxUtc.getTime() - offsetMs)
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
    },
    body: JSON.stringify(body),
  }
}
