// netlify/functions/cost.mjs

// Cost category mappings
const COST_CATEGORIES = {
  B: [
    'Business recurring cost',
    'Business non-recurring cost'
  ],
  P: [
    'Private recurring cost',
    'Private non-recurring cost'
  ]
}

// Cost type mappings by category
const COST_TYPES = {
  'Business recurring cost': [
    'Warehouse rent',
    'Warehouse and Utilities',
    'Utilities',
    'Car payments',
    'Insurance premiums',
    'Professional services',
    'Software subscriptions',
    'Other recurring'
  ],
  'Business non-recurring cost': [
    'Equipment purchases',
    'Repairs and maintenance',
    'Legal fees',
    'Marketing campaigns',
    'Training courses',
    'Professional services',
    'Travel expenses',
    'Other non-recurring'
  ],
  'Private recurring cost': [
    'Personal subscriptions',
    'Mortgage/Rent',
    'Car payments',
    'Insurance',
    'Utilities',
    'Other recurring'
  ],
  'Private non-recurring cost': [
    'Personal equipment',
    'Travel',
    'Medical expenses',
    'Home improvements',
    'Other non-recurring'
  ]
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getCosts(event)
  if (event.httpMethod === 'POST')   return createCost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCosts(event) {
  try {
    const path = event.path || ''
    const params = event.queryStringParameters || {}

    // GET /api/costs/categories?type=B or P
    if (path.includes('/categories')) {
      const type = params.type || 'B'
      
      if (type !== 'B' && type !== 'P') {
        return cors(400, { error: 'Invalid type. Must be B or P' })
      }

      return cors(200, {
        categories: COST_CATEGORIES[type]
      })
    }

    // GET /api/costs/types?category=<category>
    if (path.includes('/types')) {
      const category = params.category
      
      if (!category) {
        return cors(400, { error: 'Category parameter required' })
      }

      const types = COST_TYPES[category] || []
      
      return cors(200, {
        types
      })
    }

    return cors(404, { error: 'Not found' })
  } catch (e) {
    console.error('getCosts error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function createCost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const body = JSON.parse(event.body || '{}')
    const {
      business_private,
      cost_category,
      cost_type,
      cost,          // optional now
      amount,
      cost_date,     // for non-recurring
      start_date,    // for recurring
      end_date,      // for recurring (optional)
      recur_kind,    // for recurring
      recur_interval // for recurring
    } = body

    // Base validation
    if (!business_private || (business_private !== 'B' && business_private !== 'P')) {
      return cors(400, { error: 'business_private must be B or P' })
    }
    if (!cost_category) {
      return cors(400, { error: 'cost_category is required' })
    }
    if (!cost_type) {
      return cors(400, { error: 'cost_type is required' })
    }
    // cost is optional — no validation here
    if (amount == null || isNaN(Number(amount))) {
      return cors(400, { error: 'valid amount is required' })
    }

    const sql = neon(DATABASE_URL)

    // Correct recurring detection (exclude "non-recurring")
    const cat = String(cost_category).toLowerCase()
    const isRecurring = cat.includes('recurring') && !cat.includes('non-recurring')

    if (isRecurring) {
      // Validate recurring-specific fields
      if (!start_date) {
        return cors(400, { error: 'start_date is required for recurring costs' })
      }
      if (!recur_kind || !['monthly', 'weekly', 'yearly'].includes(recur_kind)) {
        return cors(400, { error: 'recur_kind must be monthly, weekly, or yearly' })
      }
      if (!recur_interval || recur_interval < 1) {
        return cors(400, { error: 'recur_interval must be at least 1' })
      }

      const result = await sql`
        INSERT INTO costs_recurring (
          tenant_id,
          business_private,
          cost_category,
          cost_type,
          cost,
          start_date,
          end_date,
          recur_kind,
          recur_interval,
          amount
        ) VALUES (
          ${TENANT_ID},
          ${business_private},
          ${cost_category},
          ${cost_type},
          ${cost ?? null},
          ${start_date},
          ${end_date || null},
          ${recur_kind},
          ${recur_interval},
          ${amount}
        )
        RETURNING id
      `

      return cors(201, {
        ok: true,
        id: result[0].id,
        message: 'Recurring cost created successfully'
      })

    } else {
      // Non-recurring branch
      if (!cost_date) {
        return cors(400, { error: 'cost_date is required for non-recurring costs' })
      }

      const result = await sql`
        INSERT INTO costs (
          tenant_id,
          business_private,
          cost_category,
          cost_type,
          cost,
          cost_date,
          amount
        ) VALUES (
          ${TENANT_ID},
          ${business_private},
          ${cost_category},
          ${cost_type},
          ${cost ?? null},
          ${cost_date},
          ${amount}
        )
        RETURNING id
      `

      return cors(201, {
        ok: true,
        id: result[0].id,
        message: 'Cost created successfully'
      })
    }
  } catch (e) {
    console.error('createCost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
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