// netlify/functions/reconcile-provider-data.mjs
// Netlify scheduled function — runs nightly at 02:00 UTC.
// For each connected tenant:
//   1. Compare upcoming bookings in our DB vs provider (flags missing/extra)
//   2. Compare billable SMS jobs vs Stripe-reported count (flags under-reporting)
// Results are stored in sync_runs (sync_type = 'reconciliation') with error_message
// containing a JSON summary of any mismatches.

export const config = {
  schedule: '0 2 * * *',
}

// ── SimplyBook JSON-RPC helper ──────────────────────────────────────────────

async function sbCall(method, params, companyLogin, token) {
  const res = await fetch('https://user-api.simplybook.me/admin/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Company-Login': companyLogin,
      'X-User-Token': token,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? [] }),
  })
  if (!res.ok) throw new Error(`SimplyBook HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`SimplyBook ${method}: ${data.error.message || JSON.stringify(data.error)}`)
  return data.result
}

async function getToken(companyLogin, userLogin, apiKey) {
  const res = await fetch('https://user-api.simplybook.me/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getUserToken', params: [companyLogin, userLogin, apiKey] }),
  })
  if (!res.ok) throw new Error(`SimplyBook auth HTTP ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`SimplyBook auth: ${data.error.message || JSON.stringify(data.error)}`)
  return data.result
}

// ── Main handler ────────────────────────────────────────────────────────────

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) { console.error('DATABASE_URL missing'); return { statusCode: 500 } }

    const sql = neon(DATABASE_URL)

    // Load all connected provider connections
    const connections = await sql`
      SELECT
        pc.id, pc.tenant_id, pc.provider,
        pc.external_account_id, pc.refresh_token_encrypted, pc.user_login
      FROM provider_connections pc
      WHERE pc.connection_status = 'connected'
    `

    if (!connections.length) {
      console.log('reconcile: no connected providers')
      return { statusCode: 200 }
    }

    let totalMismatches = 0

    for (const conn of connections) {
      const runStart = new Date()
      let syncRunId = null

      try {
        // Open reconciliation run record
        const runRows = await sql`
          INSERT INTO sync_runs (tenant_id, provider_connection_id, sync_type, status)
          VALUES (${conn.tenant_id}, ${conn.id}, 'reconciliation', 'running')
          RETURNING id
        `
        syncRunId = runRows[0].id

        const mismatches = []

        // ── Part 1: Booking reconciliation ──────────────────────────────────
        const companyLogin = conn.external_account_id
        const userLogin = conn.user_login
        const apiKey = conn.refresh_token_encrypted

        if (!companyLogin || !userLogin || !apiKey) {
          mismatches.push({ type: 'config_error', message: 'Missing credentials' })
        } else {
          try {
            const token = await getToken(companyLogin, userLogin, apiKey)

            const now = new Date()
            const dateTo = new Date(now)
            dateTo.setDate(dateTo.getDate() + 90)
            const fmt = d => d.toISOString().slice(0, 10)
            const filter = { date_from: fmt(now), date_to: fmt(dateTo) }

            // Pull upcoming booking IDs from provider (pages of 50)
            const providerBookingIds = new Set()
            for (let page = 1; page <= 20; page++) {
              const result = await sbCall('getBookings', [filter, null, page, 50], companyLogin, token)
              const bookings = Array.isArray(result)
                ? result
                : (result?.data ?? Object.values(result || {}))
              if (!bookings.length) break
              for (const bk of bookings) {
                if (bk.id) providerBookingIds.add(String(bk.id))
              }
              if (bookings.length < 50) break
            }

            // Pull upcoming booking IDs from our DB
            const dbBookings = await sql`
              SELECT external_booking_id, booking_status
              FROM bookings
              WHERE tenant_id = ${conn.tenant_id}
                AND external_provider = ${conn.provider}
                AND start_at >= now()
                AND start_at <= now() + interval '90 days'
                AND booking_status NOT IN ('canceled')
            `
            const dbBookingIds = new Set(dbBookings.map(b => b.external_booking_id))

            // Bookings in provider but not in our DB
            const missingInDb = [...providerBookingIds].filter(id => !dbBookingIds.has(id))
            // Bookings in our DB (non-canceled) but not in provider
            const missingInProvider = [...dbBookingIds].filter(id => !providerBookingIds.has(id))

            if (missingInDb.length > 0) {
              mismatches.push({
                type: 'bookings_missing_in_db',
                count: missingInDb.length,
                external_booking_ids: missingInDb.slice(0, 20),
              })
            }
            if (missingInProvider.length > 0) {
              mismatches.push({
                type: 'bookings_missing_in_provider',
                count: missingInProvider.length,
                external_booking_ids: missingInProvider.slice(0, 20),
              })
            }
          } catch (bookingErr) {
            mismatches.push({ type: 'booking_reconcile_error', message: String(bookingErr?.message || bookingErr) })
          }
        }

        // ── Part 2: SMS billing reconciliation ──────────────────────────────
        try {
          // Count billable jobs sent this month
          const billableRows = await sql`
            SELECT COUNT(*)::int AS billable_count
            FROM message_jobs
            WHERE tenant_id = ${conn.tenant_id}
              AND billable = true
              AND created_at >= date_trunc('month', now())
          `
          const billableCount = billableRows[0].billable_count

          // Count how many have been reported to Stripe
          const reportedRows = await sql`
            SELECT COUNT(*)::int AS reported_count
            FROM message_jobs
            WHERE tenant_id = ${conn.tenant_id}
              AND billable = true
              AND stripe_reported = true
              AND created_at >= date_trunc('month', now())
          `
          const reportedCount = reportedRows[0].reported_count

          const unreportedCount = billableCount - reportedCount
          if (unreportedCount > 0) {
            mismatches.push({
              type: 'sms_unreported_to_stripe',
              billable_count: billableCount,
              reported_count: reportedCount,
              unreported_count: unreportedCount,
            })
          }
        } catch (smsErr) {
          mismatches.push({ type: 'sms_reconcile_error', message: String(smsErr?.message || smsErr) })
        }

        totalMismatches += mismatches.length

        // Record result
        const summary = mismatches.length === 0
          ? null
          : JSON.stringify(mismatches)

        const durationMs = Date.now() - runStart.getTime()
        console.log(`reconcile tenant=${conn.tenant_id} mismatches=${mismatches.length} duration=${durationMs}ms`)
        if (mismatches.length > 0) {
          console.warn('Reconciliation mismatches:', JSON.stringify(mismatches, null, 2))
        }

        await sql`
          UPDATE sync_runs
          SET
            status            = 'succeeded',
            finished_at       = now(),
            records_processed = ${mismatches.length},
            error_message     = ${summary}
          WHERE id = ${syncRunId}
        `
      } catch (connErr) {
        console.error(`reconcile error for connection ${conn.id}:`, connErr)
        if (syncRunId) {
          await sql`
            UPDATE sync_runs
            SET status = 'failed', finished_at = now(),
                error_message = ${String(connErr?.message || connErr)}
            WHERE id = ${syncRunId}
          `.catch(() => {})
        }
      }
    }

    console.log(`Reconciliation complete. Total mismatch entries: ${totalMismatches}`)
    return { statusCode: 200 }
  } catch (e) {
    console.error('reconcile-provider-data fatal error:', e)
    return { statusCode: 500 }
  }
}
