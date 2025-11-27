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

    // GET /api/costs/existing?type=B or P
    if (path.includes('/existing')) {
      return getExistingCosts(params)
    }

    return cors(404, { error: 'Not found' })
  } catch (e) {
    console.error('getCosts error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function getExistingCosts(params) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL, TENANT_ID } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })
    if (!TENANT_ID)    return cors(500, { error: 'TENANT_ID missing' })

    const type = params.type || 'B'
    
    if (type !== 'B' && type !== 'P') {
      return cors(400, { error: 'Invalid type. Must be B or P' })
    }

    const sql = neon(DATABASE_URL)

    // Calculate cutoff date: first day of the month 3 months ago
    // Simple date math - no timezone issues since we're working with YYYY-MM-DD
    const now = new Date()
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1)
    const year = threeMonthsAgo.getFullYear()
    const month = String(threeMonthsAgo.getMonth() + 1).padStart(2, '0')
    const cutoffDate = `${year}-${month}-01`

    console.log('Fetching costs from', cutoffDate, 'onwards for type:', type, 'tenant:', TENANT_ID)

    // Get recurring costs
    const recurringRaw = await sql`
      SELECT 
        id,
        cost_type,
        cost,
        start_date,
        amount
      FROM costs_recurring
      WHERE tenant_id = ${TENANT_ID}
        AND business_private = ${type}
        AND start_date >= ${cutoffDate}
      ORDER BY start_date DESC, cost_type
    `

    console.log('Recurring costs found:', recurringRaw.length)
    if (recurringRaw.length > 0) {
      console.log('Sample:', recurringRaw[0])
    }

    // Get non-recurring costs
    const nonRecurringRaw = await sql`
      SELECT 
        id,
        cost_type,
        cost,
        cost_date,
        amount
      FROM costs
      WHERE tenant_id = ${TENANT_ID}
        AND business_private = ${type}
        AND cost_date >= ${cutoffDate}
      ORDER BY cost_date DESC, cost_type
    `

    console.log('Non-recurring costs found:', nonRecurringRaw.length)
    if (nonRecurringRaw.length > 0) {
      console.log('Sample:', nonRecurringRaw[0])
    }

    // Process recurring costs - aggregate by cost_type and start_month
    const recurringMap = new Map()
    
    for (const row of recurringRaw) {
      const startMonth = formatMonthYear(row.start_date)
      const key = `${row.cost_type}|${startMonth}`
      
      if (!recurringMap.has(key)) {
        recurringMap.set(key, {
          cost_type: row.cost_type,
          start_month: startMonth,
          total_amount: 0,
          details: []
        })
      }
      
      const group = recurringMap.get(key)
      group.total_amount += Number(row.amount)
      group.details.push({
        id: row.id,
        cost: row.cost || '',
        amount: Number(row.amount)
      })
    }

    // Process non-recurring costs - aggregate by cost_type and month
    const nonRecurringMap = new Map()
    
    for (const row of nonRecurringRaw) {
      const month = formatMonthYear(row.cost_date)
      const key = `${row.cost_type}|${month}`
      
      if (!nonRecurringMap.has(key)) {
        nonRecurringMap.set(key, {
          cost_type: row.cost_type,
          month: month,
          total_amount: 0,
          details: []
        })
      }
      
      const group = nonRecurringMap.get(key)
      group.total_amount += Number(row.amount)
      group.details.push({
        id: row.id,
        cost: row.cost || '',
        amount: Number(row.amount)
      })
    }

    // Convert maps to arrays
    const recurring = Array.from(recurringMap.values())
    const non_recurring = Array.from(nonRecurringMap.values())

    console.log('Returning', recurring.length, 'recurring groups,', non_recurring.length, 'non-recurring groups')

    return cors(200, {
      recurring,
      non_recurring
    })

  } catch (e) {
    console.error('getExistingCosts error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

// Helper function to format date as MM/YYYY
// Input: YYYY-MM-DD (or YYYY-MM-DD from database DATE column)
// Output: MM/YYYY for display
function formatMonthYear(dateString) {
  if (!dateString) return ''
  
  // Handle if it's a Date object or string
  const dateStr = dateString.toString().split('T')[0] // Get just YYYY-MM-DD part
  const parts = dateStr.split('-')
  const year = parts[0]
  const month = parts[1]
  
  return `${month}/${year}`
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