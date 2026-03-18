// netlify/functions/scheduled-process-reminders.mjs
// Netlify scheduled function — runs every 15 minutes.
// Finds queued SMS message_jobs that are due, sends via Twilio, updates status.

export const config = {
  schedule: '*/15 * * * *',
}

export async function handler() {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env

    if (!DATABASE_URL) { console.error('DATABASE_URL missing'); return { statusCode: 500 } }
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      console.error('Twilio env vars missing — SMS sending skipped')
      return { statusCode: 200 }
    }

    const sql = neon(DATABASE_URL)

    // Grab up to 50 due SMS jobs (channel = sms, status = queued, scheduled_for <= now)
    const jobs = await sql`
      SELECT
        mj.id, mj.tenant_id, mj.booking_id, mj.customer_id,
        mj.template_key, mj.channel, mj.scheduled_for,
        mt.body AS template_body,
        c.phone AS customer_phone,
        c.sms_consent,
        c.name AS customer_name,
        b.start_at, b.currency,
        s.name AS service_name,
        b.assigned_staff_name
      FROM message_jobs mj
      LEFT JOIN message_templates mt
        ON mt.template_key = mj.template_key
        AND mt.channel = 'sms'
        AND mt.tenant_id = mj.tenant_id
      LEFT JOIN customers c ON c.id = mj.customer_id
      LEFT JOIN bookings  b ON b.id = mj.booking_id
      LEFT JOIN services  s ON s.id = b.service_id
      WHERE mj.channel = 'sms'
        AND mj.status = 'queued'
        AND mj.scheduled_for <= now()
      ORDER BY mj.scheduled_for ASC
      LIMIT 50
    `

    if (!jobs.length) return { statusCode: 200 }

    // Load monthly cap settings per tenant (cache to avoid repeated queries)
    const capCache = {}
    async function isAtCap(tenantId) {
      if (!(tenantId in capCache)) {
        const capRows = await sql`
          SELECT tbs.sms_monthly_cap_amount, tbs.sms_price_per_unit,
                 COUNT(mj.id)::int AS sent_this_month
          FROM tenant_billing_settings tbs
          LEFT JOIN message_jobs mj
            ON mj.tenant_id = tbs.tenant_id
            AND mj.billable = true
            AND mj.created_at >= date_trunc('month', now())
          WHERE tbs.tenant_id = ${tenantId}
          GROUP BY tbs.sms_monthly_cap_amount, tbs.sms_price_per_unit
          LIMIT 1
        `
        if (!capRows.length) { capCache[tenantId] = false; return false }
        const { sms_monthly_cap_amount, sms_price_per_unit, sent_this_month } = capRows[0]
        const cost = sent_this_month * Number(sms_price_per_unit)
        capCache[tenantId] = cost >= Number(sms_monthly_cap_amount)
      }
      return capCache[tenantId]
    }

    let sent = 0
    let skipped = 0
    let failed = 0

    for (const job of jobs) {
      // Check monthly cap
      if (await isAtCap(job.tenant_id)) {
        await sql`UPDATE message_jobs SET status = 'canceled', error_message = 'Monthly SMS cap reached', updated_at = now() WHERE id = ${job.id}`
        skipped++
        continue
      }
      // Mark as sending immediately to prevent double-send
      await sql`
        UPDATE message_jobs SET status = 'sending', updated_at = now()
        WHERE id = ${job.id} AND status = 'queued'
      `

      // Check phone and consent
      if (!job.customer_phone) {
        await sql`UPDATE message_jobs SET status = 'failed', error_message = 'No phone number', failed_at = now(), updated_at = now() WHERE id = ${job.id}`
        skipped++
        continue
      }
      if (!job.sms_consent) {
        await sql`UPDATE message_jobs SET status = 'failed', error_message = 'SMS consent not given', failed_at = now(), updated_at = now() WHERE id = ${job.id}`
        skipped++
        continue
      }
      if (!job.template_body) {
        await sql`UPDATE message_jobs SET status = 'failed', error_message = 'No message template found', failed_at = now(), updated_at = now() WHERE id = ${job.id}`
        skipped++
        continue
      }

      // Resolve template variables
      const startAt = job.start_at ? new Date(job.start_at) : null
      const messageBody = job.template_body
        .replace(/{{customer_name}}/g, job.customer_name || '')
        .replace(/{{service_name}}/g,  job.service_name  || '')
        .replace(/{{staff_name}}/g,    job.assigned_staff_name || '')
        .replace(/{{start_date}}/g,    startAt ? startAt.toLocaleDateString() : '')
        .replace(/{{start_time}}/g,    startAt ? startAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

      try {
        // Send via Twilio REST API
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`
        const formData = new URLSearchParams({
          From: TWILIO_FROM_NUMBER,
          To:   job.customer_phone,
          Body: messageBody,
        })

        const res = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
          },
          body: formData.toString(),
        })

        const data = await res.json()

        if (res.ok && data.sid) {
          await sql`
            UPDATE message_jobs SET
              status              = 'accepted',
              provider_message_id = ${data.sid},
              provider_name       = 'twilio',
              billable            = true,
              sent_at             = now(),
              updated_at          = now()
            WHERE id = ${job.id}
          `
          sent++
        } else {
          const errMsg = data.message || data.code || 'Twilio error'
          await sql`
            UPDATE message_jobs SET
              status        = 'failed',
              error_message = ${errMsg},
              failed_at     = now(),
              updated_at    = now()
            WHERE id = ${job.id}
          `
          failed++
        }
      } catch (sendErr) {
        await sql`
          UPDATE message_jobs SET
            status        = 'failed',
            error_message = ${String(sendErr?.message || sendErr)},
            failed_at     = now(),
            updated_at    = now()
          WHERE id = ${job.id}
        `.catch(() => {})
        failed++
      }
    }

    console.log(`Reminder processor: sent=${sent} skipped=${skipped} failed=${failed}`)
    return { statusCode: 200 }
  } catch (e) {
    console.error('scheduled-process-reminders error:', e)
    return { statusCode: 500 }
  }
}
