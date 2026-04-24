// netlify/functions/public-booking.mjs
// Public (unauthenticated) booking API.
//
// GET  ?slug=X                          → tenant + services + availability map
// GET  ?slug=X&service_id=Y&date=Z      → available time slots for that date
// POST { slug, service_id, date, start_time, name, email, phone }  → create booking

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

    const params     = event.queryStringParameters || {}
    const slug       = (params.slug || '').toLowerCase().trim()
    const service_id = params.service_id
    const date       = params.date        // YYYY-MM-DD
    const booking_id = params.booking_id  // post-payment confirmation fetch

    // ── Booking detail fetch (post-payment return) ─────────────────────────
    if (booking_id && slug) {
      const rows = await sql`
        SELECT b.id, b.booking_status, b.payment_status,
               b.start_at, b.end_at, b.total_amount, b.currency,
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
      const startLocal = new Date(bk.start_at).toISOString()
      return cors(200, {
        booking_id:       bk.id,
        booking_status:   bk.booking_status,
        payment_status:   bk.payment_status,
        service_name:     bk.service_name,
        date:             startLocal.slice(0, 10),
        start_time:       startLocal.slice(11, 16),
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

      // Get availability window for this service + day
      const availRows = await sql`
        SELECT start_time, end_time
        FROM service_availability
        WHERE tenant_id = ${tenantId} AND service_id = ${service_id} AND day_of_week = ${dow}
        LIMIT 1
      `
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

    // ── Services + availability map request ───────────────────────────────
    const services = await sql`
      SELECT id, name, duration_minutes, price_amount, currency
      FROM products
      WHERE tenant_id = ${tenantId} AND category = 'service'
      ORDER BY name
    `

    const availRows = await sql`
      SELECT service_id, day_of_week
      FROM service_availability
      WHERE tenant_id = ${tenantId}
      ORDER BY service_id, day_of_week
    `

    // Build map: service_id → [dow, ...]
    const availability = {}
    for (const row of availRows) {
      if (!availability[row.service_id]) availability[row.service_id] = []
      availability[row.service_id].push(row.day_of_week)
    }

    // Check if tenant has an active Stripe provider
    const paymentRows = await sql`
      SELECT 1 FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND provider = 'stripe' AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `.catch(() => [])

    return cors(200, {
      tenant:         { name: tenant.name, icon_url: tenant.app_icon_192 || null, language: tenant.default_language || 'en' },
      services,
      availability,
      requiresPayment: paymentRows.length > 0,
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
    if (!name?.trim()) return cors(400, { error: 'name is required' })
    if (!email?.trim()) return cors(400, { error: 'email is required' })

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

    // Find or create customer by email within this tenant
    const cleanEmail = email.trim().toLowerCase()
    const cleanPhone = phone?.trim() || null
    const cleanName  = name.trim()

    let customerId
    const existingCust = await sql`
      SELECT id FROM customers
      WHERE tenant_id = ${tenantId} AND email = ${cleanEmail}
      LIMIT 1
    `
    if (existingCust.length) {
      customerId = existingCust[0].id
      // Update phone if provided and not already set
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

    // Convert local date+time to UTC
    const localStr = `${date}T${start_time.slice(0, 5)}:00`
    const startAt  = localToUtc(localStr, tenantTz)
    if (!startAt || isNaN(startAt.getTime())) return cors(400, { error: 'Invalid date or time' })
    const endAt = new Date(startAt.getTime() + durationMin * 60 * 1000)

    // Check if Stripe is enabled for this tenant
    const stripeRows = await sql`
      SELECT secret_key FROM tenant_payment_providers
      WHERE tenant_id = ${tenantId}::uuid AND provider = 'stripe' AND enabled = true
        AND publishable_key IS NOT NULL AND secret_key IS NOT NULL
      LIMIT 1
    `.catch(() => [])
    const stripeSecretKey = stripeRows[0]?.secret_key || null

    // Determine initial booking status
    const bookingStatus = stripeSecretKey && price > 0 ? 'pending_payment' : 'confirmed'
    const paymentStatus = stripeSecretKey && price > 0 ? 'pending'          : 'unpaid'

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

    // Create order + order_item
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

    // Log external event (fire and forget)
    sql`
      INSERT INTO external_events (tenant_id, event_type, customer_name, extra)
      VALUES (${tenantId}, 'booking', ${cleanName}, ${JSON.stringify({ service_name: svc.name, date, start_time: start_time.slice(0, 5) })}::jsonb)
    `.catch(err => console.error('external_events insert failed:', err))

    // ── Stripe Checkout ───────────────────────────────────────────────────────
    if (stripeSecretKey && price > 0) {
      const Stripe = (await import('stripe')).default
      const stripe  = new Stripe(stripeSecretKey)
      const appBase = `https://${event.headers['x-forwarded-host'] || event.headers.host}`

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30-minute window
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
