// netlify/functions/scheduled-update-employee-salaries.mjs

export async function handler(event) {
  try {
    const { neon } = await import('@neondatabase/serverless')
    const { DATABASE_URL } = process.env

    if (!DATABASE_URL) {
      console.error('DATABASE_URL missing')
      return { statusCode: 500, body: 'DATABASE_URL missing' }
    }

    const sql = neon(DATABASE_URL)

    // Tenant-safe: for each employee, update with latest effective salary
    await sql`
      UPDATE public.employees e
      SET hour_salary = (
        SELECT sch.salary
        FROM public.salary_cost_history sch
        WHERE sch.tenant_id = e.tenant_id
          AND sch.employee_id = e.id
          AND sch.effective_from <= NOW()
        ORDER BY sch.effective_from DESC
        LIMIT 1
      )
      WHERE EXISTS (
        SELECT 1
        FROM public.salary_cost_history sch
        WHERE sch.tenant_id = e.tenant_id
          AND sch.employee_id = e.id
          AND sch.effective_from <= NOW()
      )
    `

    console.log('Employee salaries updated successfully (tenant-safe)')
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Employee salaries updated' }),
    }
  } catch (e) {
    console.error('Error updating employee salaries:', e)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(e?.message || e) }),
    }
  }
}