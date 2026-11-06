# Project notes

## The schema files are intent, not state

`db/*.sql` records what we *meant* to apply. It does not reliably describe what the
live database actually contains. There is no migration ledger, so nothing in this repo
can confirm which migrations have been run.

Known gaps as of 2026-11-06:

- `db/00_live_schema_dump.sql` is real `pg_dump` output but was last regenerated on
  2026-06-23. It is ~17 migrations behind (54–70) and still shows the pre-migration-53
  trigger bodies with a hardcoded `'America/New_York'` — those were replaced by
  `db/53_tenant_timezone_cost_triggers.sql` in August 2026.
- `db/01_schema_historical_2026-03-25.sql` is a retired hand-written snapshot, ~60
  migrations stale. Do not read it as current.

**Rule: before asserting anything behaviour-critical about the database — trigger
bodies, function definitions, constraints, column types, defaults — verify against the
live database with a read-only introspection query. Do not conclude it from a file in
`db/`.**

This has produced real wrong answers. A trigger was described as still hardcoded to
`America/New_York` and a change was called high-risk on that basis, when the migration
fixing it had shipped two months before the dump was even committed.

Useful read-only checks:

```sql
-- A function's live body
SELECT proname, prosrc FROM pg_proc WHERE proname = 'after_shipping_cost_history_change';

-- Does a column exist, and what type is it really
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'shipping_cost_history';

-- Which triggers are actually attached
SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal;
```

## Procedure: check the dump before reading it

**Before using `db/00_live_schema_dump.sql` to answer anything, run:**

```
npm run schema:check
```

It compares the migration high-water mark stamped in the dump's header against the
highest-numbered migration now in `db/`. It reads only local files and takes no
arguments. Three outcomes:

- `OK` — the dump covers every migration in the repo. Still verify behaviour-critical
  details against the live database (see the rule above); `OK` means "not behind the
  repo", not "proven to match the database".
- `BEHIND` — migrations have been added since the dump was generated. Regenerate, or
  query the database directly, before drawing conclusions.
- `STALE` — the dump has no stamp, so it predates this procedure and cannot be dated.

Regenerate with (read-only against the database; overwrites the local file, which git
protects). Use Neon's **direct** connection string, not the pooled one — the script
refuses a `-pooler` host because `pg_dump` misbehaves through a connection pooler:

```
DATABASE_URL="postgresql://...direct-host.../neondb" npm run schema:dump
```

Pass it inline so the connection string never lands in a file. The script stamps the
output with the generation time and the migration high-water mark, which is what
`schema:check` reads on the next run.

This is a stopgap. The real fix is a migration ledger table in the database, so what is
*applied* can be checked rather than inferred from filenames — that is Phase 0 of the
tenant-isolation roadmap.

## Audit script

`db/audit_cross_tenant.sql` is a single read-only `SELECT` of 54 checks for rows that
reference another tenant's data. Deliberately unnumbered so it is never mistaken for a
migration. Nothing in the build runs `db/*.sql` — the build is only `tsc -b && vite build`.
