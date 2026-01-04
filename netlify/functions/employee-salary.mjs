// netlify/functions/employee-salary.mjs

import { resolveAuthz } from './utils/auth.mjs'

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return cors(204, {});
  if (event.httpMethod === 'PUT') return updateSalary(event);
  return cors(405, { error: 'Method not allowed' });
}

async function updateSalary(event) {
  try {
    const { neon } = await import('@neondatabase/serverless');
    const { DATABASE_URL } = process.env;
    if (!DATABASE_URL) return cors(500, { error: 'DATABASE_URL missing' });

    const body = JSON.parse(event.body || '{}');
    const employeeId = (body.employee_id || '').trim();
    const effectiveDate = body.effective_date;

    // Strict boolean coercion for checkbox
    const rawApply = body.apply_to_history;
    const applyToHistory =
      rawApply === true || rawApply === 'true' || rawApply === 1 || rawApply === '1';

    let newSalaryNum = undefined;
    if (body.salary !== undefined) {
      const n = Number(body.salary);
      if (!Number.isFinite(n) || n < 0) return cors(400, { error: 'salary must be a number ≥ 0' });
      newSalaryNum = n;
    }

    if (!employeeId) return cors(400, { error: 'employee_id is required' });
    if (newSalaryNum === undefined) return cors(400, { error: 'salary is required' });

    const sql = neon(DATABASE_URL);

    const authz = await resolveAuthz({ sql, event });
    if (authz.error) return cors(403, { error: authz.error });

    const TENANT_ID = authz.tenantId;

    // Verify employee exists
    const current = await sql`
      SELECT hour_salary
      FROM employees
      WHERE tenant_id = ${TENANT_ID} AND id = ${employeeId}
      LIMIT 1
    `;
    if (current.length === 0) return cors(404, { error: 'Employee not found' });

    // Determine if we should update employees.hour_salary now
    let shouldUpdateEmployeeSalaryNow = false;
    
    if (applyToHistory) {
      // Applying to all history = effective immediately
      shouldUpdateEmployeeSalaryNow = true;
    } else if (effectiveDate) {
      // Check if effective date is today or in the past
      const effectiveDateObj = new Date(effectiveDate + 'T00:00:00Z');
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      shouldUpdateEmployeeSalaryNow = effectiveDateObj <= today;
    } else {
      // No specific date = effective now
      shouldUpdateEmployeeSalaryNow = true;
    }

    // Update employee record if needed
    if (shouldUpdateEmployeeSalaryNow) {
      await sql`
        UPDATE employees
        SET hour_salary = ${newSalaryNum}
        WHERE tenant_id = ${TENANT_ID} AND id = ${employeeId}
      `;
    }

    // Get updated employee data
    const updatedRows = await sql`
      SELECT id, name, hour_salary
      FROM employees
      WHERE tenant_id = ${TENANT_ID} AND id = ${employeeId}
    `;

    // Handle history updates - ALWAYS create history entry when this endpoint is called
    if (applyToHistory) {
      // Delete all previous history entries for this employee
      await sql`
        DELETE FROM salary_cost_history
        WHERE tenant_id = ${TENANT_ID}
          AND employee_id = ${employeeId}
      `;
      // Insert single entry backdated to beginning - applies to all time entries
      await sql`
        INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
        VALUES (
          ${TENANT_ID},
          ${employeeId},
          ${newSalaryNum},
          (('1970-01-01'::date)::timestamp AT TIME ZONE 'America/New_York')
        )
      `;
    } else {
      // Always create a new history entry (for both new employees and salary changes)
      if (effectiveDate) {
        // Insert entry with specific date
        await sql`
          INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
          VALUES (
            ${TENANT_ID},
            ${employeeId},
            ${newSalaryNum},
            ((${effectiveDate}::date)::timestamp AT TIME ZONE 'America/New_York')
          )
        `;
      } else {
        // Normal case: add new entry with current timestamp (valid from now)
        await sql`
          INSERT INTO salary_cost_history (tenant_id, employee_id, salary, effective_from)
          VALUES (${TENANT_ID}, ${employeeId}, ${newSalaryNum}, NOW())
        `;
      }
    }

    return cors(200, {
      ok: true,
      employee: updatedRows[0],
      applied_to_history: applyToHistory
    });
  } catch (e) {
    console.error(e);
    return cors(500, { error: String(e?.message || e) });
  }
}

function cors(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'PUT,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  };
}