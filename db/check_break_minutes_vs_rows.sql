-- Does a shift's stored break_minutes agree with its break rows? Read-only: one SELECT.
--
-- Deliberately unnumbered: a diagnostic, not a migration. Edit the tenant and the
-- dates at the bottom of the WHERE clauses to point it somewhere else.
--
-- WHY THIS EXISTS. Since db/75, break_minutes is DERIVED: calculate_time_entry_totals
-- recomputes it from time_entry_breaks on every write to the row. A number written
-- straight into the column therefore survives only until something next saves that
-- row — and one of the things that saves it is a salary change, which rewrites every
-- entry for that employee with no date or approved filter. This query finds rows in
-- that state before a pay rise does.
--
-- Ran 2026-11-24 against BLV JERSEY 18-20 Nov 2026, the one hand-adjusted set we
-- suspected: to_insert was 0 on every row. Those shifts each have a real 30 minute
-- break row behind them and were never at risk. The matching apply script was
-- deleted rather than left lying around.
--
-- Read the output as:
--   to_insert = 0   healthy; the break rows already account for the stored total
--   to_insert > 0   that many minutes are stored but unexplained by any break row,
--                   and will vanish on the next write. Fix by inserting a
--                   duration-only break row (db/78) for the difference.
--   to_insert < 0   the break rows exceed the stored total, so the stored number is
--                   already behind what the trigger would derive. Investigate.
--
-- hours_now vs hours_after is what the next write to the row would change. They
-- should match; a difference is the row telling you it is going to move.
--
-- Known artifact: a shift with no clock-out shows hours_now NULL and hours_after
-- 0.00. Postgres GREATEST ignores NULL, while the trigger's own guard sets
-- total_hours := NULL. Not a real difference.
--
-- salary_now vs salary_after can also differ because the recompute reads the rate
-- effective on work_date rather than the rate that was stored, so an edited salary
-- history shows up here. That is a decision to make, not a bug to fix.

WITH target AS (
  SELECT
    te.id,
    te.employee_id,
    te.work_date,
    te.start_time,
    te.end_time,
    te.break_minutes AS stored_minutes,
    te.total_hours   AS hours_now,
    te.salary        AS salary_now,
    te.approved
  FROM public.time_entries te
  WHERE te.tenant_id = '96d93771-0c98-4153-b590-3a215957f549'::uuid
    AND te.work_date IN ('2026-11-18', '2026-11-19', '2026-11-20')
),
-- Exactly the filter and the CASE in the live calculate_time_entry_totals (db/75
-- plus db/78), so child_minutes is what the trigger would derive today.
child AS (
  SELECT
    t.id,
    COALESCE(SUM(
      CASE
        WHEN b.duration_minutes IS NOT NULL THEN b.duration_minutes::numeric
        WHEN b.break_end >= b.break_start
          THEN EXTRACT(EPOCH FROM (b.break_end - b.break_start)) / 60.0
        ELSE EXTRACT(EPOCH FROM (b.break_end - b.break_start + INTERVAL '24 hours')) / 60.0
      END
    ), 0)::INTEGER AS child_minutes,
    COUNT(b.id) AS child_rows
  FROM target t
  LEFT JOIN public.time_entry_breaks b
    ON b.time_entry_id = t.id
   AND b.tenant_id = '96d93771-0c98-4153-b590-3a215957f549'::uuid
   AND (
     b.duration_minutes IS NOT NULL
     OR (
       b.break_end IS NOT NULL
       AND (t.start_time IS NULL OR b.break_start >= t.start_time)
     )
   )
  GROUP BY t.id
),
calc AS (
  SELECT
    t.*,
    c.child_minutes,
    c.child_rows,
    t.stored_minutes - c.child_minutes AS to_insert,
    CASE
      WHEN t.start_time IS NULL OR t.end_time IS NULL THEN NULL
      WHEN t.end_time >= t.start_time
        THEN EXTRACT(EPOCH FROM (t.end_time - t.start_time)) / 3600.0
      ELSE EXTRACT(EPOCH FROM (t.end_time - t.start_time + INTERVAL '24 hours')) / 3600.0
    END AS clocked_hours
  FROM target t
  JOIN child c ON c.id = t.id
)
SELECT
  calc.work_date,
  e.name AS employee,
  calc.approved,
  calc.stored_minutes,
  calc.child_minutes,
  calc.child_rows,
  calc.to_insert,
  ROUND(calc.hours_now, 2) AS hours_now,
  ROUND(GREATEST(calc.clocked_hours - (calc.stored_minutes / 60.0), 0), 2) AS hours_after,
  calc.salary_now,
  ROUND(
    GREATEST(calc.clocked_hours - (calc.stored_minutes / 60.0), 0) * rate.hour_salary,
    2
  ) AS salary_after
FROM calc
JOIN public.employees e
  ON e.id = calc.employee_id
 AND e.tenant_id = '96d93771-0c98-4153-b590-3a215957f549'::uuid
-- The same rate the trigger would pick: salary history for the work date, falling
-- back to the employee's current rate. The EST literal is the pre-existing one in
-- calculate_time_entry_totals, repeated here so this preview matches it.
LEFT JOIN LATERAL (
  SELECT COALESCE(
    (
      SELECT sch.salary
      FROM public.salary_cost_history sch
      WHERE sch.tenant_id = '96d93771-0c98-4153-b590-3a215957f549'::uuid
        AND sch.employee_id = calc.employee_id
        AND (sch.effective_from AT TIME ZONE 'America/New_York')::date
            <= (calc.work_date::timestamp AT TIME ZONE 'America/New_York')::date
      ORDER BY sch.effective_from DESC
      LIMIT 1
    ),
    e.hour_salary
  ) AS hour_salary
) rate ON TRUE
ORDER BY calc.work_date, e.name;
