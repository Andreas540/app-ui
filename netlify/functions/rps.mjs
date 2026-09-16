// netlify/functions/rps.mjs
import { neon } from '@neondatabase/serverless'
import { resolveAuthz } from './utils/auth.mjs'

export const handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') return resp(204, {})

  try {
    const url = new URL(
      event.rawUrl || `http://x${event.path}${event.rawQuery ? '?' + event.rawQuery : ''}`
    )
    const from   = url.searchParams.get('from') // YYYY-MM or YYYY, optional
    const to     = url.searchParams.get('to')   // YYYY-MM or YYYY, optional
    const period = url.searchParams.get('period') || 'month' // 'month' | 'year'
    const monthsParam = parseInt(url.searchParams.get('months') || '3', 10)
    const months = Number.isFinite(monthsParam) ? Math.max(1, Math.min(60, monthsParam)) : 3
    const yearsParam = parseInt(url.searchParams.get('years') || '3', 10)
    const years = Number.isFinite(yearsParam) ? Math.max(1, Math.min(20, yearsParam)) : 3

    const basis = url.searchParams.get('basis') || 'order' // 'order' | 'payment'

    const { DATABASE_URL } = process.env
    if (!DATABASE_URL) return resp(500, { error: 'DATABASE_URL missing' })

    const sql = neon(DATABASE_URL)

    // ✅ Multi-tenant source of truth (DB lookup via JWT -> user -> tenant)
    const authz = await resolveAuthz({ sql, event })
    if (authz.error) return resp(403, { error: authz.error })
    const TENANT_ID = authz.tenantId

    let rows

    // ── Payment-date mode: attribute order revenue to the date the order was paid ──
    if (basis === 'payment') {
      if (period === 'year') {
        if (from && to) {
          const fromY = parseInt(from, 10)
          const toY   = parseInt(to,   10)
          rows = await sql`
            WITH ord AS (
              SELECT o.id, MAX(p.payment_date) AS d
              FROM orders o
              JOIN payments p ON p.order_id = o.id AND p.tenant_id = ${TENANT_ID}
              WHERE o.tenant_id = ${TENANT_ID} AND o.order_date IS NOT NULL
                AND o.notes IS DISTINCT FROM 'Old tab'
              GROUP BY o.id
            ),
            rc AS (
              SELECT ord.d, SUM(oi.qty * COALESCE(oi.unit_price,0)) AS rev,
                SUM(oi.qty * (COALESCE(oi.product_cost,0)+COALESCE(oi.shipping_cost,0))) AS cogs
              FROM ord JOIN order_items oi ON oi.order_id=ord.id GROUP BY ord.d
            ),
            pa AS (
              SELECT ord.d, SUM(COALESCE(op.amount,0)) AS partner_amt
              FROM ord JOIN order_partners op ON op.order_id=ord.id GROUP BY ord.d
            ),
            cs AS (
              SELECT c.cost_date AS d,
                SUM(c.amount) FILTER (WHERE c.cost_category='Business recurring cost') AS biz_r,
                SUM(c.amount) FILTER (WHERE c.cost_category='Business non-recurring cost') AS biz_nr,
                SUM(c.amount) FILTER (WHERE c.cost_category='Private recurring cost') AS priv_r,
                SUM(c.amount) FILTER (WHERE c.cost_category='Private non-recurring cost') AS priv_nr
              FROM public.costs_all c WHERE c.tenant_id=${TENANT_ID} GROUP BY c.cost_date
            ),
            days AS (SELECT d FROM rc UNION SELECT d FROM cs),
            v AS (
              SELECT days.d,
                COALESCE(rc.rev,0) AS rev, COALESCE(rc.cogs,0) AS cogs, COALESCE(pa.partner_amt,0) AS pamt,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0) AS gp,
                COALESCE(cs.biz_r,0) AS biz_r, COALESCE(cs.biz_nr,0) AS biz_nr,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0) AS op,
                COALESCE(cs.priv_r,0) AS priv_r, COALESCE(cs.priv_nr,0) AS priv_nr,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0)-COALESCE(cs.priv_r,0)-COALESCE(cs.priv_nr,0) AS surplus
              FROM days
              LEFT JOIN rc ON rc.d=days.d LEFT JOIN pa ON pa.d=days.d LEFT JOIN cs ON cs.d=days.d
            )
            SELECT EXTRACT(YEAR FROM d)::text AS month, MIN(d)::text AS min_month_start,
              SUM(rev)::float8 AS revenue, SUM(gp)::float8 AS gross_profit,
              SUM(op)::float8 AS operating_profit, SUM(surplus)::float8 AS surplus
            FROM v
            WHERE EXTRACT(YEAR FROM d)::int BETWEEN ${fromY} AND ${toY}
            GROUP BY 1 ORDER BY 1 ASC
          `
        } else {
          rows = await sql`
            WITH ord AS (
              SELECT o.id, MAX(p.payment_date) AS d
              FROM orders o
              JOIN payments p ON p.order_id = o.id AND p.tenant_id = ${TENANT_ID}
              WHERE o.tenant_id = ${TENANT_ID} AND o.order_date IS NOT NULL
                AND o.notes IS DISTINCT FROM 'Old tab'
              GROUP BY o.id
            ),
            rc AS (
              SELECT ord.d, SUM(oi.qty * COALESCE(oi.unit_price,0)) AS rev,
                SUM(oi.qty * (COALESCE(oi.product_cost,0)+COALESCE(oi.shipping_cost,0))) AS cogs
              FROM ord JOIN order_items oi ON oi.order_id=ord.id GROUP BY ord.d
            ),
            pa AS (
              SELECT ord.d, SUM(COALESCE(op.amount,0)) AS partner_amt
              FROM ord JOIN order_partners op ON op.order_id=ord.id GROUP BY ord.d
            ),
            cs AS (
              SELECT c.cost_date AS d,
                SUM(c.amount) FILTER (WHERE c.cost_category='Business recurring cost') AS biz_r,
                SUM(c.amount) FILTER (WHERE c.cost_category='Business non-recurring cost') AS biz_nr,
                SUM(c.amount) FILTER (WHERE c.cost_category='Private recurring cost') AS priv_r,
                SUM(c.amount) FILTER (WHERE c.cost_category='Private non-recurring cost') AS priv_nr
              FROM public.costs_all c WHERE c.tenant_id=${TENANT_ID} GROUP BY c.cost_date
            ),
            days AS (SELECT d FROM rc UNION SELECT d FROM cs),
            v AS (
              SELECT days.d,
                COALESCE(rc.rev,0) AS rev, COALESCE(rc.cogs,0) AS cogs, COALESCE(pa.partner_amt,0) AS pamt,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0) AS gp,
                COALESCE(cs.biz_r,0) AS biz_r, COALESCE(cs.biz_nr,0) AS biz_nr,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0) AS op,
                COALESCE(cs.priv_r,0) AS priv_r, COALESCE(cs.priv_nr,0) AS priv_nr,
                COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0)-COALESCE(cs.priv_r,0)-COALESCE(cs.priv_nr,0) AS surplus
              FROM days
              LEFT JOIN rc ON rc.d=days.d LEFT JOIN pa ON pa.d=days.d LEFT JOIN cs ON cs.d=days.d
            ),
            yset AS (
              SELECT EXTRACT(YEAR FROM d)::int AS yr FROM v WHERE rev > 0 GROUP BY 1 ORDER BY 1 DESC LIMIT ${years}
            )
            SELECT ys.yr::text AS month, MIN(v.d)::text AS min_month_start,
              SUM(v.rev)::float8 AS revenue, SUM(v.gp)::float8 AS gross_profit,
              SUM(v.op)::float8 AS operating_profit, SUM(v.surplus)::float8 AS surplus
            FROM yset ys JOIN v ON EXTRACT(YEAR FROM v.d)::int=ys.yr
            GROUP BY ys.yr ORDER BY ys.yr ASC
          `
        }
        return resp(200, { rows })
      }

      // Monthly payment-date mode
      if (from && to) {
        const fromDate = `${from}-01`
        const toDate   = `${to}-01`
        rows = await sql`
          WITH ord AS (
            SELECT o.id, MAX(p.payment_date) AS d
            FROM orders o
            JOIN payments p ON p.order_id = o.id AND p.tenant_id = ${TENANT_ID}
            WHERE o.tenant_id = ${TENANT_ID} AND o.order_date IS NOT NULL
              AND o.notes IS DISTINCT FROM 'Old tab'
            GROUP BY o.id
          ),
          rc AS (
            SELECT ord.d, SUM(oi.qty * COALESCE(oi.unit_price,0)) AS rev,
              SUM(oi.qty * (COALESCE(oi.product_cost,0)+COALESCE(oi.shipping_cost,0))) AS cogs
            FROM ord JOIN order_items oi ON oi.order_id=ord.id GROUP BY ord.d
          ),
          pa AS (
            SELECT ord.d, SUM(COALESCE(op.amount,0)) AS partner_amt
            FROM ord JOIN order_partners op ON op.order_id=ord.id GROUP BY ord.d
          ),
          cs AS (
            SELECT c.cost_date AS d,
              SUM(c.amount) FILTER (WHERE c.cost_category='Business recurring cost') AS biz_r,
              SUM(c.amount) FILTER (WHERE c.cost_category='Business non-recurring cost') AS biz_nr,
              SUM(c.amount) FILTER (WHERE c.cost_category='Private recurring cost') AS priv_r,
              SUM(c.amount) FILTER (WHERE c.cost_category='Private non-recurring cost') AS priv_nr
            FROM public.costs_all c WHERE c.tenant_id=${TENANT_ID} GROUP BY c.cost_date
          ),
          days AS (SELECT d FROM rc UNION SELECT d FROM cs),
          v AS (
            SELECT days.d,
              COALESCE(rc.rev,0) AS rev, COALESCE(rc.cogs,0) AS cogs, COALESCE(pa.partner_amt,0) AS pamt,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0) AS gp,
              COALESCE(cs.biz_r,0) AS biz_r, COALESCE(cs.biz_nr,0) AS biz_nr,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0) AS op,
              COALESCE(cs.priv_r,0) AS priv_r, COALESCE(cs.priv_nr,0) AS priv_nr,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0)-COALESCE(cs.priv_r,0)-COALESCE(cs.priv_nr,0) AS surplus
            FROM days
            LEFT JOIN rc ON rc.d=days.d LEFT JOIN pa ON pa.d=days.d LEFT JOIN cs ON cs.d=days.d
          ),
          months AS (
            SELECT date_trunc('month',d)::date AS ms FROM v GROUP BY 1
          )
          SELECT TO_CHAR(m.ms,'YYYY-MM') AS month, m.ms AS month_start,
            SUM(v.rev)::float8 AS revenue, SUM(v.gp)::float8 AS gross_profit,
            SUM(v.op)::float8 AS operating_profit, SUM(v.surplus)::float8 AS surplus
          FROM months m JOIN v ON date_trunc('month',v.d)::date=m.ms
          WHERE m.ms >= ${fromDate}::date AND m.ms <= ${toDate}::date
          GROUP BY m.ms ORDER BY m.ms ASC
        `
      } else {
        rows = await sql`
          WITH ord AS (
            SELECT o.id, MAX(p.payment_date) AS d
            FROM orders o
            JOIN payments p ON p.order_id = o.id AND p.tenant_id = ${TENANT_ID}
            WHERE o.tenant_id = ${TENANT_ID} AND o.order_date IS NOT NULL
              AND o.notes IS DISTINCT FROM 'Old tab'
            GROUP BY o.id
          ),
          rc AS (
            SELECT ord.d, SUM(oi.qty * COALESCE(oi.unit_price,0)) AS rev,
              SUM(oi.qty * (COALESCE(oi.product_cost,0)+COALESCE(oi.shipping_cost,0))) AS cogs
            FROM ord JOIN order_items oi ON oi.order_id=ord.id GROUP BY ord.d
          ),
          pa AS (
            SELECT ord.d, SUM(COALESCE(op.amount,0)) AS partner_amt
            FROM ord JOIN order_partners op ON op.order_id=ord.id GROUP BY ord.d
          ),
          cs AS (
            SELECT c.cost_date AS d,
              SUM(c.amount) FILTER (WHERE c.cost_category='Business recurring cost') AS biz_r,
              SUM(c.amount) FILTER (WHERE c.cost_category='Business non-recurring cost') AS biz_nr,
              SUM(c.amount) FILTER (WHERE c.cost_category='Private recurring cost') AS priv_r,
              SUM(c.amount) FILTER (WHERE c.cost_category='Private non-recurring cost') AS priv_nr
            FROM public.costs_all c WHERE c.tenant_id=${TENANT_ID} GROUP BY c.cost_date
          ),
          days AS (SELECT d FROM rc UNION SELECT d FROM cs),
          v AS (
            SELECT days.d,
              COALESCE(rc.rev,0) AS rev, COALESCE(rc.cogs,0) AS cogs, COALESCE(pa.partner_amt,0) AS pamt,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0) AS gp,
              COALESCE(cs.biz_r,0) AS biz_r, COALESCE(cs.biz_nr,0) AS biz_nr,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0) AS op,
              COALESCE(cs.priv_r,0) AS priv_r, COALESCE(cs.priv_nr,0) AS priv_nr,
              COALESCE(rc.rev,0)-COALESCE(rc.cogs,0)-COALESCE(pa.partner_amt,0)-COALESCE(cs.biz_r,0)-COALESCE(cs.biz_nr,0)-COALESCE(cs.priv_r,0)-COALESCE(cs.priv_nr,0) AS surplus
            FROM days
            LEFT JOIN rc ON rc.d=days.d LEFT JOIN pa ON pa.d=days.d LEFT JOIN cs ON cs.d=days.d
          ),
          mset AS (
            SELECT date_trunc('month',d)::date AS ms FROM v WHERE rev>0 GROUP BY 1 ORDER BY 1 DESC LIMIT ${months}
          )
          SELECT TO_CHAR(m.ms,'YYYY-MM') AS month, m.ms AS month_start,
            SUM(v.rev)::float8 AS revenue, SUM(v.gp)::float8 AS gross_profit,
            SUM(v.op)::float8 AS operating_profit, SUM(v.surplus)::float8 AS surplus
          FROM mset m JOIN v ON date_trunc('month',v.d)::date=m.ms
          GROUP BY m.ms ORDER BY m.ms ASC
        `
      }
      return resp(200, { rows })
    }

    // ── Order-date mode (default): use pre-built view ──────────────────────────
    if (period === 'year') {
      if (from && to) {
        const fromY = parseInt(from, 10)
        const toY   = parseInt(to,   10)
        rows = await sql`
          SELECT
            EXTRACT(YEAR FROM v.month_start)::text        AS month,
            MIN(v.month_start)::text                      AS min_month_start,
            SUM(COALESCE(v.revenue_amount,    0))::float8 AS revenue,
            SUM(COALESCE(v.gross_profit,      0))::float8 AS gross_profit,
            SUM(COALESCE(v.operating_profit,  0))::float8 AS operating_profit,
            SUM(COALESCE(v.surplus,           0))::float8 AS surplus
          FROM public.revenue_profit_surplus_by_month v
          WHERE v.tenant_id = ${TENANT_ID}
            AND EXTRACT(YEAR FROM v.month_start)::int BETWEEN ${fromY} AND ${toY}
          GROUP BY 1
          ORDER BY 1 ASC
        `
      } else {
        rows = await sql`
          WITH yset AS (
            SELECT EXTRACT(YEAR FROM month_start)::int AS yr
            FROM public.revenue_profit_surplus_by_month
            WHERE tenant_id = ${TENANT_ID}
              AND revenue_amount IS NOT NULL AND revenue_amount != 0
            GROUP BY 1
            ORDER BY 1 DESC
            LIMIT ${years}
          )
          SELECT
            ys.yr::text                                    AS month,
            MIN(v.month_start)::text                       AS min_month_start,
            SUM(COALESCE(v.revenue_amount,    0))::float8  AS revenue,
            SUM(COALESCE(v.gross_profit,      0))::float8  AS gross_profit,
            SUM(COALESCE(v.operating_profit,  0))::float8  AS operating_profit,
            SUM(COALESCE(v.surplus,           0))::float8  AS surplus
          FROM yset ys
          JOIN public.revenue_profit_surplus_by_month v
            ON EXTRACT(YEAR FROM v.month_start)::int = ys.yr
           AND v.tenant_id = ${TENANT_ID}
          GROUP BY ys.yr
          ORDER BY ys.yr ASC
        `
      }
      return resp(200, { rows })
    }

    if (from && to) {
      // Date-range mode: return all months in [from, to] regardless of zero revenue
      const fromDate = `${from}-01`
      const toDate   = `${to}-01`
      rows = await sql`
        SELECT
          TO_CHAR(v.month_start, 'YYYY-MM')         AS month,
          v.month_start,
          COALESCE(v.revenue_amount, 0)::float8      AS revenue,
          COALESCE(v.gross_profit, 0)::float8        AS gross_profit,
          COALESCE(v.operating_profit, 0)::float8    AS operating_profit,
          COALESCE(v.surplus, 0)::float8             AS surplus
        FROM public.revenue_profit_surplus_by_month v
        WHERE v.tenant_id = ${TENANT_ID}
          AND v.month_start >= ${fromDate}::date
          AND v.month_start <= ${toDate}::date
        ORDER BY v.month_start ASC
      `
    } else {
      // Default mode: last N months that actually contain data
      rows = await sql`
        WITH mset AS (
          SELECT month_start
          FROM public.revenue_profit_surplus_by_month
          WHERE tenant_id = ${TENANT_ID}
            AND revenue_amount IS NOT NULL
            AND revenue_amount != 0
          ORDER BY month_start DESC
          LIMIT ${months}
        )
        SELECT
          TO_CHAR(v.month_start, 'YYYY-MM')         AS month,
          v.month_start,
          COALESCE(v.revenue_amount, 0)::float8      AS revenue,
          COALESCE(v.gross_profit, 0)::float8        AS gross_profit,
          COALESCE(v.operating_profit, 0)::float8    AS operating_profit,
          COALESCE(v.surplus, 0)::float8             AS surplus
        FROM public.revenue_profit_surplus_by_month v
        JOIN mset ON mset.month_start = v.month_start
        WHERE v.tenant_id = ${TENANT_ID}
        ORDER BY v.month_start ASC
      `
    }

    return resp(200, { rows })
  } catch (err) {
    return resp(500, { error: String(err?.message || err) })
  }
}

function resp(status, body) {
  return {
    statusCode: status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET,OPTIONS',
      'access-control-allow-headers': 'content-type,authorization,x-tenant-id',
    },
    body: JSON.stringify(body),
  }
}


