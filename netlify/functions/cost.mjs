// netlify/functions/cost.mjs

import { resolveAuthz } from './utils/auth.mjs'

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
  console.log('=== COST FUNCTION CALLED ===')
  console.log('Path:', event.path)
  console.log('HTTP Method:', event.httpMethod)
  console.log('Query params:', event.queryStringParameters)
  
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET')    return getCosts(event)
  if (event.httpMethod === 'POST')   return createCost(event)
  if (event.httpMethod === 'PUT')    return updateCost(event)
  if (event.httpMethod === 'DELETE') return deleteCost(event)
  return cors(405, { error: 'Method not allowed' })
}

async function getCosts(event) {
  try {
    const path = event.path || ''
    const params = event.queryStringParameters || {}

    console.log('getCosts - path:', path)
    console.log('getCosts - params:', JSON.stringify(params))

    // GET /api/costs/categories?type=B or P
    if (path.includes('/categories')) {
      console.log('Route: categories')
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
      console.log('Route: types')
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
    // Check if path includes 'existing' OR if there's a 'type' param without category
    if (path.includes('/existing') || (params.type && !params.category)) {
      console.log('Route: existing costs')
      return getExistingCosts({ ...params, event })
    }

    console.log('No route matched - returning 404')
    return cors(404, { 
      error: 'Not found',
      debug: {
        path: path,
        params: params
      }
    })
  } catch (e) {
    console.error('getCosts error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function getExistingCosts(params) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event: params.event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    const type = params.type || 'B'
    
    if (type !== 'B' && type !== 'P') {
      return cors(400, { error: 'Invalid type. Must be B or P' })
    }

    // Calculate 3-month window: current month + 2 previous months
    const now = new Date()
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1)
    const windowStartDate = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`
    
    // End of current month
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const windowEndDate = `${endOfCurrentMonth.getFullYear()}-${String(endOfCurrentMonth.getMonth() + 1).padStart(2, '0')}-${String(endOfCurrentMonth.getDate()).padStart(2, '0')}`

    console.log('Fetching costs for window:', windowStartDate, 'to', windowEndDate)
    console.log('Type:', type, 'Tenant:', TENANT_ID)

    // Get recurring costs that were active during the 3-month window
    // A cost is active if it started before/during the window AND hasn't ended before the window
    const recurringRaw = await sql`
      SELECT 
        id,
        cost_type,
        cost,
        start_date,
        end_date,
        amount,
        recur_kind,
        recur_interval
      FROM costs_recurring
      WHERE tenant_id = ${TENANT_ID}
        AND business_private = ${type}
        AND start_date <= ${windowEndDate}
        AND (end_date IS NULL OR end_date >= ${windowStartDate})
      ORDER BY start_date DESC, cost_type
    `

    console.log('Recurring costs found:', recurringRaw.length)
    if (recurringRaw.length > 0) {
      console.log('Sample:', JSON.stringify(recurringRaw[0]))
    }

    // Get non-recurring costs from last 3 months
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
        AND cost_date >= ${windowStartDate}
      ORDER BY cost_date DESC, cost_type
    `

    console.log('Non-recurring costs found:', nonRecurringRaw.length)
    if (nonRecurringRaw.length > 0) {
      console.log('Sample non-recurring:', JSON.stringify(nonRecurringRaw[0]))
    }

    // Process recurring costs - expand to each active month in the window
    const recurringMap = new Map()
    
    for (const row of recurringRaw) {
      console.log('Processing recurring row:', JSON.stringify(row))
      
      // Get all months this cost was active in the window
      const activeMonths = getActiveMonths(
        row.start_date,
        row.end_date,
        windowStartDate,
        windowEndDate,
        row.recur_kind,
        row.recur_interval
      )
      
      console.log('Active months for cost', row.id, ':', activeMonths)
      
      // Create an entry for each active month
      for (const month of activeMonths) {
        const key = `${row.cost_type}|${month}`
        
        if (!recurringMap.has(key)) {
          recurringMap.set(key, {
            cost_type: row.cost_type,
            start_month: month,
            total_amount: 0,
            details: []
          })
        }
        
        const group = recurringMap.get(key)
        group.total_amount += Number(row.amount)
        group.details.push({
          id: row.id,
          cost: row.cost || '',
          amount: Number(row.amount),
          start_date: formatDate(row.start_date),
          end_date: formatDate(row.end_date),
          recur_kind: row.recur_kind,
          recur_interval: row.recur_interval
        })
      }
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
        amount: Number(row.amount),
        cost_date: formatDate(row.cost_date)
      })
    }

    // Convert maps to arrays
    const recurring = Array.from(recurringMap.values())
    const non_recurring = Array.from(nonRecurringMap.values())

    // Sort recurring costs: 1. Date (latest first), 2. Amount (highest first)
    recurring.sort((a, b) => {
      const dateA = parseMonthYear(a.start_month)
      const dateB = parseMonthYear(b.start_month)
      
      if (dateB.getTime() !== dateA.getTime()) {
        return dateB.getTime() - dateA.getTime() // Latest date first
      }
      
      return b.total_amount - a.total_amount // Highest amount first
    })

    // Sort details within each recurring group by amount (highest first)
    recurring.forEach(group => {
      group.details.sort((a, b) => b.amount - a.amount)
    })

    // Sort non-recurring costs: 1. Date (latest first), 2. Amount (highest first)
    non_recurring.sort((a, b) => {
      const dateA = parseMonthYear(a.month)
      const dateB = parseMonthYear(b.month)
      
      if (dateB.getTime() !== dateA.getTime()) {
        return dateB.getTime() - dateA.getTime() // Latest date first
      }
      
      return b.total_amount - a.total_amount // Highest amount first
    })

    // Sort details within each non-recurring group by amount (highest first)
    non_recurring.forEach(group => {
      group.details.sort((a, b) => b.amount - a.amount)
    })

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

// Helper function to get all months a recurring cost was active in the window
// Returns array of MM/YYYY strings for each month the cost occurred
function getActiveMonths(startDate, endDate, windowStart, windowEnd, recurKind, recurInterval) {
  const months = []
  
  try {
    // Parse dates
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : null
    const winStart = new Date(windowStart)
    const winEnd = new Date(windowEnd)
    
    // Get the first day of each month in the window
    const currentMonth = new Date(winStart.getFullYear(), winStart.getMonth(), 1)
    
    while (currentMonth <= winEnd) {
      const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)
      
      // Check if this month overlaps with the recurring cost's active period
      const isActiveInMonth = 
        start <= monthEnd && // Cost started before or during this month
        (!end || end >= currentMonth) // Cost hasn't ended, or ended during or after this month
      
      if (isActiveInMonth) {
        // Check if this month matches the recurrence pattern
        const shouldOccur = shouldOccurInMonth(start, currentMonth, recurKind, recurInterval)
        
        if (shouldOccur) {
          months.push(formatMonthYear(currentMonth))
        }
      }
      
      // Move to next month
      currentMonth.setMonth(currentMonth.getMonth() + 1)
    }
  } catch (e) {
    console.error('getActiveMonths error:', e)
  }
  
  return months
}

// Helper function to determine if a recurring cost should occur in a given month
// based on start date, recurrence kind, and interval
function shouldOccurInMonth(startDate, targetMonth, recurKind, recurInterval) {
  try {
    if (recurKind === 'monthly') {
      // Calculate months difference
      const monthsDiff = 
        (targetMonth.getFullYear() - startDate.getFullYear()) * 12 + 
        (targetMonth.getMonth() - startDate.getMonth())
      
      // Should occur if the month difference is divisible by the interval
      return monthsDiff >= 0 && monthsDiff % recurInterval === 0
      
    } else if (recurKind === 'yearly') {
      // Should occur if it's the same month and year difference is divisible by interval
      const yearsDiff = targetMonth.getFullYear() - startDate.getFullYear()
      const sameMonth = targetMonth.getMonth() === startDate.getMonth()
      
      return sameMonth && yearsDiff >= 0 && yearsDiff % recurInterval === 0
      
    } else if (recurKind === 'weekly') {
      // For weekly recurring costs, they occur in every month they're active
      // (More precise week calculation would be complex and may not be needed)
      return true
    }
    
    // Default to true if we can't determine
    return true
  } catch (e) {
    console.error('shouldOccurInMonth error:', e)
    return true
  }
}

// Helper function to parse MM/YYYY into a Date for sorting
// Input: MM/YYYY string
// Output: Date object (first day of that month)
function parseMonthYear(monthYear) {
  try {
    const [month, year] = monthYear.split('/')
    return new Date(parseInt(year), parseInt(month) - 1, 1)
  } catch (e) {
    console.error('parseMonthYear error:', e, 'input:', monthYear)
    return new Date(0) // Return epoch if parsing fails
  }
}

// Helper function to format date as YYYY-MM-DD
// Input: Date object or YYYY-MM-DD string from database
// Output: YYYY-MM-DD string
function formatDate(dateInput) {
  if (!dateInput) return null
  
  try {
    // If it's already a string in YYYY-MM-DD format, extract date part
    if (typeof dateInput === 'string') {
      return dateInput.split('T')[0]
    }
    
    // If it's a Date object, format it
    if (dateInput instanceof Date) {
      const year = dateInput.getFullYear()
      const month = String(dateInput.getMonth() + 1).padStart(2, '0')
      const day = String(dateInput.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    
    return null
  } catch (e) {
    console.error('formatDate error:', e, 'input:', dateInput)
    return null
  }
}

// Helper function to format date as MM/YYYY
// Input: YYYY-MM-DD string or Date object from database
// Output: MM/YYYY for display
function formatMonthYear(dateInput) {
  if (!dateInput) {
    console.log('formatMonthYear: empty input')
    return ''
  }
  
  try {
    // Handle if it's already a Date object
    let dateStr
    if (dateInput instanceof Date) {
      const year = dateInput.getFullYear()
      const month = String(dateInput.getMonth() + 1).padStart(2, '0')
      return `${month}/${year}`
    }
    
    // Convert to string and get just the date part (YYYY-MM-DD)
    dateStr = String(dateInput).split('T')[0]
    
    // Split by dash to get year, month, day
    const parts = dateStr.split('-')
    
    if (parts.length < 2) {
      console.error('Invalid date format:', dateInput, 'parts:', parts)
      return ''
    }
    
    const year = parts[0]
    const month = parts[1]
    
    const result = `${month}/${year}`
    console.log('formatMonthYear:', dateInput, '->', result)
    return result
  } catch (e) {
    console.error('formatMonthYear error:', e, 'input:', dateInput)
    return ''
  }
}

async function createCost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

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

async function updateCost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Get cost ID and type from query parameters
    const params = event.queryStringParameters || {}
    const costId = params.id
    const costType = params.type // 'recurring' or 'non-recurring'

    console.log('=== UPDATE COST DEBUG ===')
    console.log('Full event.path:', event.path)
    console.log('Full event.queryStringParameters:', JSON.stringify(params))
    console.log('Extracted costId:', costId, 'Type:', typeof costId)
    console.log('Extracted costType:', costType)
    console.log('isNaN(Number(costId)):', isNaN(Number(costId)))

    if (!costId || isNaN(Number(costId))) {
      console.error('Invalid costId - costId:', costId, 'typeof:', typeof costId)
      return cors(400, { 
        error: 'Valid cost ID required',
        debug: {
          received_id: costId,
          received_type: costType,
          params: params
        }
      })
    }

    if (!costType || !['recurring', 'non-recurring'].includes(costType)) {
      return cors(400, { error: 'type parameter must be "recurring" or "non-recurring"' })
    }

    const body = JSON.parse(event.body || '{}')
    const {
      business_private,
      cost_category,
      cost_type,
      cost,
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
    if (amount == null || isNaN(Number(amount))) {
      return cors(400, { error: 'valid amount is required' })
    }

    if (costType === 'recurring') {
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
        UPDATE costs_recurring
        SET 
          business_private = ${business_private},
          cost_category = ${cost_category},
          cost_type = ${cost_type},
          cost = ${cost ?? null},
          start_date = ${start_date},
          end_date = ${end_date || null},
          recur_kind = ${recur_kind},
          recur_interval = ${recur_interval},
          amount = ${amount}
        WHERE id = ${costId}
          AND tenant_id = ${TENANT_ID}
        RETURNING id
      `

      if (result.length === 0) {
        return cors(404, { error: 'Cost not found or unauthorized' })
      }

      return cors(200, {
        ok: true,
        id: result[0].id,
        message: 'Recurring cost updated successfully'
      })

    } else {
      // Non-recurring branch
      if (!cost_date) {
        return cors(400, { error: 'cost_date is required for non-recurring costs' })
      }

      const result = await sql`
        UPDATE costs
        SET 
          business_private = ${business_private},
          cost_category = ${cost_category},
          cost_type = ${cost_type},
          cost = ${cost ?? null},
          cost_date = ${cost_date},
          amount = ${amount}
        WHERE id = ${costId}
          AND tenant_id = ${TENANT_ID}
        RETURNING id
      `

      if (result.length === 0) {
        return cors(404, { error: 'Cost not found or unauthorized' })
      }

      return cors(200, {
        ok: true,
        id: result[0].id,
        message: 'Cost updated successfully'
      })
    }
  } catch (e) {
    console.error('updateCost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteCost(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // Resolve tenant from JWT
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    // Get cost ID and type from query parameters
    const params = event.queryStringParameters || {}
    const costId = params.id
    const costType = params.type // 'recurring' or 'non-recurring'

    console.log('Delete cost - ID:', costId, 'Type:', costType)

    if (!costId || isNaN(Number(costId))) {
      return cors(400, { error: 'Valid cost ID required' })
    }

    if (!costType || !['recurring', 'non-recurring'].includes(costType)) {
      return cors(400, { error: 'type parameter must be "recurring" or "non-recurring"' })
    }

    if (costType === 'recurring') {
      const result = await sql`
        DELETE FROM costs_recurring
        WHERE id = ${costId}
          AND tenant_id = ${TENANT_ID}
        RETURNING id
      `

      if (result.length === 0) {
        return cors(404, { error: 'Cost not found or unauthorized' })
      }

      return cors(200, {
        ok: true,
        id: result[0].id,
        message: 'Recurring cost deleted successfully'
      })

    } else {
      const result = await sql`
        DELETE FROM costs
        WHERE id = ${costId}
          AND tenant_id = ${TENANT_ID}
        RETURNING id
      `

      if (result.length === 0) {
        return cors(404, { error: 'Cost not found or unauthorized' })
      }

      return cors(200, {
        ok: true,
        id: result[0].id,
        message: 'Cost deleted successfully'
      })
    }
  } catch (e) {
    console.error('deleteCost error:', e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}