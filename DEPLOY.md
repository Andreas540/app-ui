# Deploy Workflow — Bizniz Optimizer

Rules for Claude Code. Follow these on every task that changes code or the database.

## Environments
| | Git branch | Netlify | Neon DB |
|---|---|---|---|
| **Staging** | `staging` | `staging--<site>.netlify.app` | `staging` branch |
| **Production** | `main` | app.biznizoptimizer.com | `production` branch (Neon's default) |

The Neon branch holding live data is named `production`, not `main`. The git
branch is `main`. Don't let the two names mislead you when copying a connection
string.

A Neon branch is a snapshot of its parent at the moment it is created, so a stale
branch holds a stale schema. The project also has a `development` branch from a
year ago and two Feb 2026 backups — all far behind the migrations and unusable as
staging. Create `staging` fresh from `production`, or reset an old branch from its
parent before using it.

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
Andreas runs all SQL himself in the Neon console. Claude writes the file and hands
it over; Claude does not run SQL.
- [ ] New migration = next number in `db/`, e.g. `db/79_<description>.sql`
- [ ] Write it to be safe to re-run (`IF NOT EXISTS`, `IF EXISTS`) and additive, so
      the old code still works against the new schema
- [ ] Andreas applies it to the Neon **staging** branch; Claude gives a SELECT to verify
- [ ] Claude adds the file to "Pending for production" at the bottom of this doc
- [ ] Runtime schema changes inside `.mjs` files (`ALTER TABLE ... IF NOT EXISTS` in
      functions or `bootstrap.mjs`) run by themselves when the code deploys. List them
      under "Pending" too, marked *runs with the code*, so they are not a surprise.

## 4. "deploy" — push to staging
Claude commits locally while working and pushes only when Andreas says **deploy**.
- [ ] `npm run build` passes
- [ ] `git push origin staging`
- [ ] Tell Andreas: what changed, which migrations are pending, what to test on the staging URL

## 5. "go live" — promote to production
One command. It pauses only when there is SQL to run.
- [ ] Open a PR `staging` → `main` (`gh pr create --base main --head staging`) listing
      the changes and the pending migrations
- [ ] **No pending SQL:** merge the PR
- [ ] **Pending SQL:** list the files in order and stop. Andreas runs them on the Neon
      **production** branch and replies "done". Then merge.
      Order matters: database first, code second. Additive migrations don't break
      the old code during the gap; new code against the old schema would.
- [ ] Netlify builds production from `main`
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
-- On STAGING only. Check the branch selector or use $STAGING_DATABASE_URL.
UPDATE tenant_payment_providers
SET secret_key = NULL, publishable_key = NULL, webhook_secret = NULL;
```

To test payments on staging, put Stripe's **test** keys in instead of NULL
(`pk_test_…` / `sk_test_…`, from the Stripe dashboard with Test mode on). Card
4242 4242 4242 4242 then works end to end and no money moves. The physical card
reader cannot be used in test mode; Stripe's simulated reader covers that, and is
separate setup.

The customer phone numbers and email addresses are still real. Treat the staging
database as production data under a different name: same care, same access.

**Scheduled functions do not run on staging.** Netlify fires them only on
published production deploys, so the seven hourly jobs in `netlify.toml` (product
costs, shipping costs, salaries, booking reminders, Stripe usage sync) are dormant
on a branch deploy. To exercise one, use **Run now** on the Netlify Functions page.
The upside is that staging cannot silently rewrite data in the background; the
downside is that those jobs reach production untested.

**Refreshing staging's data.** A branch never follows its parent forward. To pull
in current production data, use **Reset from parent** on the Neon `staging` branch.
Two things come with every reset:

1. The Stripe keys come back. Re-run the blanking UPDATE above.
2. Migrations applied to staging but not yet to production are discarded. Re-apply
   them from `db/` in order.

Reset only when a test needs current data. A month-old copy of the customers and
orders exercises a new feature just as well.

**Local `npm run dev` talks to production.** Every API call falls back to
`import.meta.env.DEV ? 'https://data-entry-beta.netlify.app' : ''`, repeated in
about 15 files. Local development therefore reads and writes the production
database today. Pointing it at staging means replacing that literal with a Vite
env var (`VITE_API_BASE`) across those files — worth doing, not yet done.

## Netlify environment variables

Scope these to the `staging` branch in Netlify, not to all contexts. Anything left
unset simply disables that feature on staging, which is usually what you want —
the code checks for the credentials and skips the call.

**Must be set**

| Variable | Note for staging |
|---|---|
| `DATABASE_URL` | the Neon **staging** branch, pooled connection |
| `JWT_SECRET` | generate a separate one — a production token must not unlock staging |
| `EMPLOYEE_TOKEN_SECRET` | separate; signs the employee time-entry links |
| `CUSTOMER_TOKEN_SECRET` | separate |
| `ORDER_PAGE_SECRET` | separate |
| `SITE_URL` | the staging URL, so generated links stay inside staging |
| `SUPER_ADMIN_EMAILS` | the same admins, or fewer |

**Leave unset on staging** — these reach real people or real money:

| Variable | What it does |
|---|---|
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | sends SMS to customer phone numbers. Missing any one of the three and the send is skipped. |
| `RESEND_API_KEY` | sends email to customer addresses |
| `STRIPE_SECRET_KEY` | the platform's own Stripe account, used to meter and bill tenants for SMS and AI usage. Not the per-tenant keys in the database. |
| `ANTHROPIC_API_KEY` | billable API calls |
| `SIMPLYBOOK_WEBHOOK_SECRET` | verifies inbound booking webhooks |
| `STRIPE_SMS_METER_EVENT_NAME` / `STRIPE_AI_METER_EVENT_NAME` | meter names for the above |

`URL` is set by Netlify itself. `TENANT_ID` appears in the code as a fallback and
should not be set.

To exercise SMS, email or AI on staging, set the matching test credentials
deliberately for that session rather than leaving production's in place.

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
