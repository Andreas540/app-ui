# Deploy Workflow — Bizniz Optimizer

Rules for Claude Code. Follow these on every task that changes code or the database.

## Environments
| | Git branch | Netlify | Neon DB |
|---|---|---|---|
| **Staging** | `staging` | `staging--<site>.netlify.app` | `staging` branch |
| **Production** | `main` | app.biznizoptimizer.com | `main` branch |

Local `.env` (gitignored, never committed) — see `.env.example`:
```
STAGING_DATABASE_URL=...
PROD_DATABASE_URL=...
```

## Hard rules
- **Never** commit or push directly to `main`.
- **Never** run SQL against `PROD_DATABASE_URL` without Andreas typing explicit approval in chat for that specific migration.
- **Never** commit `.env`, secrets or connection strings.
- If unsure which branch or DB you are on, stop and check before acting.

## 1. Start of task
- [ ] `git checkout staging && git pull`
- [ ] For larger work: `git checkout -b feature/<short-name>` from `staging`
- [ ] Confirm the current branch with `git branch --show-current`

## 2. While working
- [ ] Commit small, clear steps: `git commit -m "<area>: <what changed>"`
- [ ] Run `npm run build` (and tests if present) before pushing; fix errors first

## 3. Database migrations
- [ ] New migration = next number in `db/`, e.g. `db/79_<description>.sql`
- [ ] Write it to be safe to re-run where possible (`IF NOT EXISTS`, `IF EXISTS`)
- [ ] Apply to **staging only**:
      `psql "$STAGING_DATABASE_URL" -f db/79_<description>.sql`
- [ ] Verify (check tables/columns, run a quick SELECT) and report the result
- [ ] Add the file to the "Pending for production" list at the bottom of this doc

## 4. Push to staging
- [ ] Feature branch → merge into `staging` (or push `staging` directly for small changes)
- [ ] `git push origin staging`
- [ ] Tell Andreas: what changed, which migrations ran on staging, and what to test on the staging URL

## 5. Promote to production (only when Andreas says "go live")
- [ ] Open a PR `staging` → `main`: `gh pr create --base main --head staging`
      List the changes and the pending migrations in the PR body
- [ ] Before the merge, ask for approval and then apply each pending migration to prod in order:
      `psql "$PROD_DATABASE_URL" -f db/79_<description>.sql`
- [ ] Andreas merges the PR (or approves Claude merging it)
- [ ] Move the migrations from "Pending" to "Applied to production" below
- [ ] Sync: `git checkout staging && git merge main && git push`

## 6. If something breaks in production
- [ ] Netlify → Deploys → pick the last good deploy → **Publish deploy** (instant rollback of the code)
- [ ] DB changes don't roll back automatically: write a reverse migration, test it on staging, then apply it to prod with approval

---

## What staging is not

**A Neon branch of production carries live credentials and live customer data.**
Tenant Stripe keys are columns in the database, not environment variables
(`tenant_payment_providers.secret_key`). A staging database branched from
production can therefore charge real cards and create real payment links, and the
same data drives SMS and email to real customers. Before using a fresh staging
branch, blank those columns on it:

```sql
-- On STAGING only. Check the connection string first.
UPDATE tenant_payment_providers SET secret_key = NULL, publishable_key = NULL;
```

The customer phone numbers and email addresses are still real. Treat the staging
database as production data under a different name: same care, same access.

**Scheduled functions do not run on staging.** Netlify fires them only on
published production deploys, so the seven hourly jobs in `netlify.toml` (product
costs, shipping costs, salaries, booking reminders, Stripe usage sync) are dormant
on a branch deploy. To exercise one, use **Run now** on the Netlify Functions page.
The upside is that staging cannot silently rewrite data in the background; the
downside is that those jobs reach production untested.

**Local `npm run dev` talks to production.** Every API call falls back to
`import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''`, repeated in
about 15 files. Local development therefore reads and writes the production
database today. Pointing it at staging means replacing that literal with a Vite
env var (`VITE_API_BASE`) across those files — worth doing, not yet done.

## Netlify environment variables

The staging context needs its own values for everything the functions read. Scope
them in Netlify to the `staging` branch, not to all contexts:

| Variable | Note for staging |
|---|---|
| `DATABASE_URL` | the Neon **staging** branch, pooled connection |
| `JWT_SECRET` | generate a separate one — a prod token must not unlock staging |
| `EMPLOYEE_TOKEN_SECRET` | separate; signs the employee time-entry links |
| `CUSTOMER_TOKEN_SECRET` | separate |
| `ORDER_PAGE_SECRET` | separate |
| `SUPER_ADMIN_EMAILS` | the same admins, or fewer |
| `SITE_URL` | the staging URL, so generated links stay inside staging |
| `RESEND_API_KEY` | a test key, or leave empty to disable sending |

`URL` is set by Netlify itself.

## Schema dumps

`db/00_live_schema_dump.sql` is generated from **production**. Keep it that way —
it is the reference for what the live database contains. `npm run schema:check`
compares it against the migration files; see CLAUDE.md for the rule about
verifying behaviour-critical details against the live database rather than these
files.

---

## Migration log

**Pending for production:**
- (none)

**Applied to production:**
- Believed current through `db/78_break_duration_minutes.sql`.
- Verified against the live database on 2026-11-24: `db/75_breaks_outside_shift.sql`
  and `db/78_break_duration_minutes.sql`.
- There is no migration ledger in the database, so everything below 75 is inferred
  from the files rather than confirmed. CLAUDE.md explains why that matters and how
  to check a specific object. Building that ledger is Phase 0 of the tenant-isolation
  roadmap.

**Not migrations** (unnumbered on purpose, never run as part of a deploy):
- `db/audit_cross_tenant.sql` — read-only cross-tenant reference check
- `db/check_break_minutes_vs_rows.sql` — read-only break-total diagnostic
