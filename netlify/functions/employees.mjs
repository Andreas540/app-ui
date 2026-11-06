// netlify/functions/employees.mjs
import { resolveAuthz } from './utils/auth.mjs'
import crypto from 'crypto'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {})
  if (event.httpMethod === 'GET') return getEmployees(event)
  if (event.httpMethod === 'POST') return saveEmployee(event)
  if (event.httpMethod === 'DELETE') return deleteEmployee(event)
  return cors(405, { error: 'Method not allowed' })
}

// token signing helpers (same format as time-entries.mjs)
function base64urlEncode(bufOrStr) {
  const b = Buffer.isBuffer(bufOrStr) ? bufOrStr : Buffer.from(String(bufOrStr), 'utf8')
  return b.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function signEmployeeToken({ tenantId, employeeId, ttlDays = 365 }) {
  const secret = process.env.EMPLOYEE_TOKEN_SECRET
  if (!secret) throw new Error('EMPLOYEE_TOKEN_SECRET missing')

  const now = Math.floor(Date.now() / 1000)
  const exp = now + ttlDays * 24 * 60 * 60

  const payload = { tenant_id: tenantId, employee_id: employeeId, exp }
  const payloadB64 = base64urlEncode(JSON.stringify(payload))
  const sigB64 = base64urlEncode(
    crypto.createHmac('sha256', secret).update(payloadB64).digest()
  )
  return `${payloadB64}.${sigB64}`
}

/**
 * Remember a job title for this tenant so it shows in the dropdown next time.
 * Kept in its own table rather than product_categories — job titles are not product data.
 */
async function ensureJobTitle({ sql, tenantId, name }) {
  await sql`
    INSERT INTO employee_job_titles (tenant_id, name)
    VALUES (${tenantId}::uuid, ${name})
    ON CONFLICT (tenant_id, name) DO NOTHING
  `
}

/**
 * GET employees
 * Query params:
 *   - active=true/false
 *   - next_code=true : return { next_code: "EMP###" }
 *   - job_titles=true : return { job_titles: ["Driver", "Packer"] }
 *   - share_token=true&employee_id=<uuid> : return { url, token }
 */
async function getEmployees(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const active = params.get('active')
    const nextCode = params.get('next_code')

    // return next available employee code
    if (nextCode === 'true') {
      const code = await computeNextEmployeeCode({ sql, tenantId: TENANT_ID })
      return cors(200, { next_code: code })
    }

    // return the tenant's selectable job titles
    if (params.get('job_titles') === 'true') {
      // in_use drives the delete warning, so the user is told how many people
      // would lose their title before confirming.
      const rows = await sql`
        SELECT t.name,
               (SELECT COUNT(*)::int FROM employees e
                 WHERE e.tenant_id = t.tenant_id AND e.job_title = t.name) AS in_use
          FROM employee_job_titles t
         WHERE t.tenant_id = ${TENANT_ID}::uuid
         ORDER BY t.name ASC
      `
      return cors(200, { job_titles: rows.map(r => ({ name: r.name, in_use: r.in_use })) })
    }

    // share token/link for one employee
    if (params.get('share_token') === 'true') {
      const employeeId = params.get('employee_id')
      if (!employeeId) return cors(400, { error: 'employee_id is required' })

      const emp = await sql`
        SELECT id, active
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND id = ${employeeId}::uuid
        LIMIT 1
      `
      if (emp.length === 0) return cors(404, { error: 'Employee not found' })
      if (!emp[0].active) return cors(400, { error: 'Employee is inactive' })

      const token = signEmployeeToken({ tenantId: TENANT_ID, employeeId })
      const url = `https://data-entry-beta.netlify.app/time-entry?employee_token=${encodeURIComponent(token)}`
      return cors(200, { url, token })
    }

    let rows
    if (active === 'true') {
      rows = await sql`
        SELECT id, name, email, employee_code, job_title, hour_salary, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND active = TRUE
        ORDER BY name
      `
    } else if (active === 'false') {
      rows = await sql`
        SELECT id, name, email, employee_code, job_title, hour_salary, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID} AND active = FALSE
        ORDER BY name
      `
    } else {
      rows = await sql`
        SELECT id, name, email, employee_code, job_title, hour_salary, active, notes, created_at, updated_at
        FROM employees
        WHERE tenant_id = ${TENANT_ID}
        ORDER BY active DESC, name
      `
    }

    return cors(200, rows)
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function computeNextEmployeeCode({ sql, tenantId }) {
  const rows = await sql`
    SELECT employee_code
    FROM employees
    WHERE tenant_id = ${tenantId}
      AND employee_code IS NOT NULL
      AND employee_code ILIKE 'EMP%'
  `
  let maxN = 0
  for (const r of rows) {
    const code = String(r.employee_code || '')
    const m = code.match(/^EMP(\d+)$/i)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > maxN) maxN = n
  }
  const next = maxN + 1
  return `EMP${String(next).padStart(3, '0')}`
}

async function saveEmployee(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId

    const body = JSON.parse(event.body || '{}')
    const { id, name, email, hour_salary, active, notes, effective_date, apply_to_history, job_title } = body

    // ── Job title list management ─────────────────────────────────────────
    // Titles are managed in their own right, not as a side effect of saving an
    // employee, so they persist the moment they are created.
    if (body.action === 'createJobTitle') {
      const v = String(body.title_name || '').trim()
      if (!v) return cors(400, { error: 'title_name is required' })
      const existing = await sql`
        SELECT 1 FROM employee_job_titles
        WHERE tenant_id = ${TENANT_ID}::uuid AND lower(name) = lower(${v}) LIMIT 1
      `
      if (existing.length) return cors(409, { error: 'JOB_TITLE_EXISTS' })
      await sql`INSERT INTO employee_job_titles (tenant_id, name) VALUES (${TENANT_ID}::uuid, ${v})`
      return cors(200, { ok: true, name: v })
    }

    if (body.action === 'renameJobTitle') {
      const from = String(body.old_name || '').trim()
      const to = String(body.new_name || '').trim()
      if (!from || !to) return cors(400, { error: 'old_name and new_name are required' })
      if (from !== to) {
        const clash = await sql`
          SELECT 1 FROM employee_job_titles
          WHERE tenant_id = ${TENANT_ID}::uuid AND lower(name) = lower(${to}) LIMIT 1
        `
        if (clash.length) return cors(409, { error: 'JOB_TITLE_EXISTS' })
      }
      await sql`
        UPDATE employee_job_titles SET name = ${to}
        WHERE tenant_id = ${TENANT_ID}::uuid AND name = ${from}
      `
      // Carry the rename onto everyone holding it, otherwise their title would
      // point at a value no longer in the list.
      const moved = await sql`
        UPDATE employees SET job_title = ${to}
        WHERE tenant_id = ${TENANT_ID}::uuid AND job_title = ${from}
        RETURNING id
      `
      return cors(200, { ok: true, name: to, employees_updated: moved.length })
    }

    // Asked immediately before the delete confirmation, so the number shown is the
    // number at that moment — not one cached when the page loaded.
    if (body.action === 'jobTitleUsage') {
      const v = String(body.title_name || '').trim()
      if (!v) return cors(400, { error: 'title_name is required' })
      const [row] = await sql`
        SELECT COUNT(*)::int AS n FROM employees
        WHERE tenant_id = ${TENANT_ID}::uuid AND job_title = ${v}
      `
      return cors(200, { in_use: row?.n ?? 0 })
    }

    if (body.action === 'deleteJobTitle') {
      const v = String(body.title_name || '').trim()
      if (!v) return cors(400, { error: 'title_name is required' })
      // Clear it from anyone holding it rather than leaving a dangling value.
      const cleared = await sql`
        UPDATE employees SET job_title = NULL
        WHERE tenant_id = ${TENANT_ID}::uuid AND job_title = ${v}
        RETURNING id
      `
      await sql`
        DELETE FROM employee_job_titles
        WHERE tenant_id = ${TENANT_ID}::uuid AND name = ${v}
      `
      return cors(200, { ok: true, employees_cleared: cleared.length })
    }

    if (!id && (!name || !name.trim())) {
      return cors(400, { error: 'name is required for new employees' })
    }

    // Strict boolean coercion for apply_to_history
    const applyToHistory = 
      apply_to_history === true || 
      apply_to_history === 'true' || 
      apply_to_history === 1 || 
      apply_to_history === '1'

    if (id) {
      // UPDATING EXISTING EMPLOYEE
      const employee = await sql`
        SELECT * FROM employees WHERE id = ${id} AND tenant_id = ${TENANT_ID}
      `
      if (employee.length === 0) return cors(404, { error: 'Employee not found' })

      const current = employee[0]
      const updatedName = name !== undefined ? String(name).trim() : current.name
      const updatedEmail = email !== undefined ? (String(email).trim() || null) : current.email
      const updatedActive = active !== undefined ? active : current.active
      const updatedNotes = notes !== undefined ? (String(notes).trim() || null) : current.notes

      // Handle salary updates with history
let newSalaryNum = hour_salary !== undefined ? hour_salary : current.hour_salary
const salaryProvided = hour_salary !== undefined && hour_salary !== null

// Determine if we should update employees.hour_salary immediately
let shouldUpdateSalaryNow = false

if (salaryProvided) {
  if (applyToHistory) {
    // Applying to all history = effective immediately
    shouldUpdateSalaryNow = true
  } else if (effective_date) {
    // Check if effective date is today or in the past
    const effectiveDateObj = new Date(effective_date + 'T00:00:00Z')
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    shouldUpdateSalaryNow = effectiveDateObj <= today
  } else {
    // No specific date = from today = effective now
    shouldUpdateSalaryNow = true
  }
}

// A title typed into the "+ New" field is remembered for the tenant, so it is
// offered next time rather than having to be retyped per employee.
const jobTitle = String(job_title || '').trim() || null
if (jobTitle) await ensureJobTitle({ sql, tenantId: TENANT_ID, name: jobTitle })

// Update employee record
await sql`
  UPDATE employees
  SET
    name = ${updatedName},
    email = ${updatedEmail},
    job_title = ${jobTitle},
    hour_salary = CASE
      WHEN ${shouldUpdateSalaryNow && salaryProvided} THEN ${newSalaryNum}
      ELSE hour_salary
    END,
    active = ${updatedActive},
    notes = ${updatedNotes}
  WHERE id = ${id} AND tenant_id = ${TENANT_ID}
`

// Handle salary history updates - ALWAYS create history entry when salary is provided during edit
if (salaryProvided) {
  if (applyToHistory) {
    // Delete all previous history entries
    await sql`
      DELETE FROM salary_cost_history
      WHERE tenant_id = ${TENANT_ID}
        AND employee_id = ${id}
    `
    // Insert single entry backdated to beginning
    await sql`
      INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
      VALUES (
        ${TENANT_ID},
        ${id},
        ${newSalaryNum},
        (('1970-01-01'::date)::timestamp AT TIME ZONE 'America/New_York')
      )
    `
  } else {
    // Normal case: add new history entry (for both "from today" and "specific date")
    if (effective_date) {
      // Insert entry with specific date
      await sql`
        INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
        VALUES (
          ${TENANT_ID},
          ${id},
          ${newSalaryNum},
          ((${effective_date}::date)::timestamp AT TIME ZONE 'America/New_York')
        )
      `
    } else {
      // From today: add entry with current timestamp
      await sql`
        INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
        VALUES (${TENANT_ID}, ${id}, ${newSalaryNum}, NOW())
      `
    }
  }
}

return cors(200, { 
  ok: true, 
  updated: true, 
  employee: { id },
  applied_to_history: applyToHistory && salaryProvided
})
    } else {
      // CREATING NEW EMPLOYEE
      const generatedCode = await computeNextEmployeeCode({ sql, tenantId: TENANT_ID })

      const newJobTitle = String(job_title || '').trim() || null
      if (newJobTitle) await ensureJobTitle({ sql, tenantId: TENANT_ID, name: newJobTitle })

      const result = await sql`
        INSERT INTO employees (
          tenant_id, name, email, employee_code, hour_salary, active, notes, job_title
        )
        VALUES (
          ${TENANT_ID},
          ${String(name).trim()},
          ${String(email || '').trim() || null},
          ${generatedCode},
          ${hour_salary || null},
          ${active !== false},
          ${String(notes || '').trim() || null},
          ${newJobTitle}
        )
        RETURNING id, employee_code
      `

      const employeeId = result[0].id

      // Create initial salary history entry if salary provided
      if (hour_salary != null) {
        await sql`
          INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
          VALUES (${TENANT_ID}, ${employeeId}, ${hour_salary}, NOW())
        `
      }

      return cors(200, {
        ok: true,
        created: true,
        employee: {
          id: employeeId,
          employee_code: result[0].employee_code,
        }
      })
    }
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

async function deleteEmployee(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return cors(403, { error: authz.error })

    const TENANT_ID = authz.tenantId
    const params = new URLSearchParams(event.queryStringParameters || {})
    const id = params.get('id')
    if (!id) return cors(400, { error: 'id parameter is required' })

    await sql`
      UPDATE employees
      SET active = FALSE
      WHERE id = ${id} AND tenant_id = ${TENANT_ID}
    `
    return cors(200, { ok: true, deactivated: id })
  } catch (e) {
    console.error(e)
    return cors(500, { error: String(e?.message || e) })
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers':
        'content-type,authorization,x-tenant-id,x-active-tenant,x-employee-token',
    },
    body: JSON.stringify(body),
  }
}


