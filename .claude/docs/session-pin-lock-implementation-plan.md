# Session PIN Lock — Implementation Plan

## Overview

Replace the single 90-minute auto-logout with a **two-stage session timeout**:

1. **Stage 1 — Idle Lock:** After N minutes of inactivity (tenant-configurable, default 15), the app "freezes": a full-screen overlay blocks the UI and requires a PIN to continue. All in-progress state (forms, drafts, current page) is preserved underneath.
2. **Stage 2 — Hard Logout:** After a longer interval, the session ends completely (JWT invalid, redirect to login). Sliding expiration: a successful PIN unlock refreshes the JWT and resets this clock.

**Key decisions (confirmed):**

| Decision | Choice |
|---|---|
| Hard-logout behavior after unlock | Sliding — unlock issues a fresh JWT, clock resets |
| Idle-lock timeout | Tenant-configurable, default 15 min |
| PIN feature toggle | Tenant admin enables/disables for the whole tenant (under **Tenant Admin → Users**, but applies to all users) |
| PIN length | Tenant admin chooses 4 or 6 digits |
| User PIN setup | On **App Settings** page; greyed out (with explanation tooltip) if tenant hasn't enabled the feature |
| User has no PIN when lock triggers | Overlay prompts them to set a PIN — **password required** to set it (see Security Notes) |
| PIN feature disabled for tenant | Behavior identical to today: single hard-logout timer |

**Out of scope:** Customer-facing magic-link portal (doorbell messaging pages) — no PIN lock there. SuperAdmin impersonation sessions are exempt from PIN lock (hard logout still applies).

---

## Security Requirements (non-negotiable)

These address the known weaknesses of PIN-based locks. Claude Code: do not skip or "simplify away" any of these.

1. **Server-side PIN verification only.** The overlay is UI; the gate is the API. PIN is verified by a Netlify function against a bcrypt hash. A client-side-only check is trivially bypassable via dev tools.
2. **Rate limiting, enforced server-side.** Max **5 failed attempts**, then the session is force-invalidated and the user must log in with their password. Track attempts in the DB (not in client state). Add a short per-attempt delay (e.g., 300 ms) server-side to slow scripted guessing.
3. **PIN is never a primary credential.** It only unlocks an *existing, valid, authenticated* session. The unlock endpoint requires a valid (non-expired) JWT *and* the correct PIN. No JWT → full login, no exceptions.
4. **Setting/changing a PIN requires the account password.** Both on the App Settings page and in the "set PIN at first lock" overlay flow. Otherwise, anyone at an unattended terminal could set the PIN themselves and own the session.
5. **Overlay must actually hide content.** Solid backdrop (or heavy blur on the app root) so screen content is unreadable behind the modal. While locked, pause all background polling/refetching that returns tenant data.
6. **PIN hashing:** bcrypt (same helper as passwords). Never log or return the PIN or hash.
7. **Forgot PIN escape hatch:** "Forgot PIN? Log in again" link on the overlay → clears session, redirects to password login. After password login, the user can reset their PIN in App Settings.
8. **Audit events (lightweight):** log `session_locked`, `session_unlocked`, `pin_failed_attempt`, `pin_lockout` with user_id, tenant_id, timestamp. Reuse the existing audit/logging pattern if one exists; otherwise a simple `session_events` table.

---

## Data Model

### Migration 1 — user PIN columns

```sql
ALTER TABLE users
  ADD COLUMN pin_hash TEXT,
  ADD COLUMN pin_set_at TIMESTAMPTZ,
  ADD COLUMN pin_failed_attempts INT NOT NULL DEFAULT 0,
  ADD COLUMN pin_locked_until TIMESTAMPTZ;
```

- `pin_hash` NULL = user has not set a PIN.
- `pin_locked_until`: set when attempt limit is hit; the unlock endpoint rejects until then even with a correct PIN (belt-and-suspenders alongside forced logout).

### Migration 2 — tenant settings

Follow the existing tenant-settings pattern (`getTenantConfig()` merging defaults). If tenant settings live in columns:

```sql
ALTER TABLE tenants
  ADD COLUMN pin_lock_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN pin_length SMALLINT NOT NULL DEFAULT 6 CHECK (pin_length IN (4, 6)),
  ADD COLUMN idle_lock_minutes SMALLINT NOT NULL DEFAULT 15 CHECK (idle_lock_minutes BETWEEN 5 AND 60);
```

If tenant settings live in a JSONB config blob instead, add the same three keys there with identical defaults/validation, and merge via `getTenantConfig()` defaults so existing tenants need no backfill.

**Hard-logout interval:** keep the existing mechanism/env value but raise the default (recommend **8 hours** JWT lifetime now that idle lock protects unattended screens). If JWT lifetime is currently hardcoded to 90 min, make it a config constant in this phase.

---

## API — Netlify Functions (ESM `.mjs`)

All endpoints go through `resolveAuthz()` as usual. New/changed endpoints:

### 1. `POST /session-unlock` (new: `session-unlock.mjs`)

Request: `{ pin: string }` + JWT in auth header.

Logic:
1. Validate JWT (must be valid and unexpired — expired JWT returns 401 → client shows full login).
2. Load user; if `pin_locked_until` is in the future → 423 Locked, client forces logout.
3. Compare bcrypt. On failure: increment `pin_failed_attempts`; if ≥ 5, set `pin_locked_until = now() + interval '15 minutes'` and return 423; else return 401 with `attempts_remaining`.
4. On success: reset `pin_failed_attempts` to 0, clear `pin_locked_until`, **issue a fresh JWT** (sliding expiration), log `session_unlocked`, return `{ token }`.

### 2. `POST /user-pin` (new: `user-pin.mjs`) — set/change/remove PIN

Request: `{ password: string, new_pin: string | null }` + JWT.

Logic:
1. Validate JWT, verify `password` against the user's password hash (403 on mismatch).
2. Validate `new_pin`: digits only, length must equal the tenant's `pin_length`.
3. `new_pin = null` → clear `pin_hash` (only allowed if tenant has `pin_lock_enabled = false`; if enabled, PIN removal is not allowed — change only).
4. Store bcrypt hash, set `pin_set_at`, reset attempt counters.

### 3. Tenant admin settings endpoint (extend existing)

Extend the existing tenant-settings PATCH handler (TenantAdmin role required) to accept `pin_lock_enabled`, `pin_length`, `idle_lock_minutes` with the same validation as the DB constraints.

**Edge case — pin_length change:** if the admin changes 4 ↔ 6, existing PINs of the old length remain valid for *unlocking* but the App Settings page shows a "your PIN doesn't match the new required length — please update" notice. Do not mass-invalidate PINs (that would lock everyone into the set-PIN flow simultaneously). Enforce new length only on set/change.

### 4. Auth/login payload (extend)

Include in the login response / bootstrap config: `pin_lock_enabled`, `pin_length`, `idle_lock_minutes`, and `user_has_pin: boolean` (derived from `pin_hash IS NOT NULL` — never send the hash). The client needs these to arm the idle timer and render the right overlay variant.

---

## Client (React/TypeScript)

### 1. Idle detection — `useIdleLock` hook

- Use `react-idle-timer` (or a small custom hook with `mousemove`/`keydown`/`touchstart`/`visibilitychange` listeners, throttled).
- Armed only when `pin_lock_enabled` is true and the user is authenticated. Disarmed entirely during SuperAdmin impersonation.
- Timeout = `idle_lock_minutes` from tenant config.
- **Multi-tab sync:** use `BroadcastChannel('session-lock')` (with a `localStorage` timestamp fallback). Activity in any tab resets all tabs' timers; a lock event locks all tabs; an unlock event (new JWT) unlocks all tabs and updates the stored token everywhere.

### 2. `LockOverlay` component

Rendered at the app root (above routing), full-screen, solid/blurred backdrop hiding all content. Three variants:

- **A — Unlock (user has PIN):** PIN input (auto-length from `pin_length`, numeric keypad on mobile via `inputmode="numeric"`), attempts-remaining message on failure, "Forgot PIN? Log in again" link. On 423 or 5th failure → clear session, redirect to login.
- **B — First-time setup (tenant enabled, user has no PIN):** explains the feature, asks for **account password + new PIN (twice)**, calls `/user-pin`, then unlocks. "Log in again instead" link as the escape hatch.
- **C — Session expired (JWT died while locked):** message + button to the login page. The overlay checks token expiry before submitting; an expired token switches variant A/B → C rather than showing a confusing 401.

While the overlay is up: set a global `isLocked` flag that pauses polling intervals / disables refetch-on-focus (check for existing query/polling utilities and gate them on this flag).

### 3. App Settings page — PIN section

- Tenant enabled: "Change PIN" / "Set PIN" flow (password + new PIN twice).
- Tenant disabled: section visible but greyed out with tooltip: "PIN lock is not enabled for your organization. Ask your administrator."

### 4. Tenant Admin → Users — PIN Lock settings card

General (all-users) settings card at the top of the Users section:

- Toggle: **Enable PIN lock** (with a one-line explanation of the two-stage behavior)
- Select: **PIN length** — 4 or 6 digits
- Select/number: **Lock after inactivity** — 5–60 min, default 15
- Helper text noting that users set their own PIN in App Settings, and users without a PIN will be prompted at first lock.

### 5. i18n

All new strings through react-i18next (EN/SV/ES), following existing key conventions.

---

## Flows (summary)

**Normal:** idle N min → all tabs lock → user enters PIN → `/session-unlock` → fresh JWT stored + broadcast → overlay dismissed, state intact, hard-logout clock reset.

**No PIN yet:** idle → overlay variant B → password + new PIN → `/user-pin` → unlocked.

**Wrong PIN ×5:** server sets lockout → client clears session → password login (which resets nothing about the PIN; correct PIN works again after `pin_locked_until` passes, or user changes PIN in settings).

**JWT expires while locked (e.g., overnight):** overlay variant C → full login. This *is* the hard logout.

**Tenant disables the feature:** timers disarm on next config fetch; App Settings section greys out; stored `pin_hash` values are kept (re-enabling restores everyone's PIN).

---

## Implementation Phases (for Claude Code)

**Phase 1 — Backend foundation**
Migrations 1 & 2 → `session-unlock.mjs` → `user-pin.mjs` → tenant settings PATCH extension → login payload extension → audit events. Unit-test rate limiting and lockout logic.

**Phase 2 — Lock overlay + idle detection**
`useIdleLock` hook → `LockOverlay` (variants A/B/C) → polling pause flag → multi-tab `BroadcastChannel` sync.

**Phase 3 — Settings UIs**
App Settings PIN section (incl. greyed-out state) → Tenant Admin Users card → i18n strings.

**Phase 4 — Hard-logout adjustment + polish**
Raise JWT lifetime default to 8h (config constant) → sliding refresh verified end-to-end → pin_length-change notice → QA checklist below.

## QA Checklist

- [ ] Overlay cannot be removed via dev tools to reach data (API calls still succeed only with valid JWT — expected — but verify no *new* data renders while locked and polling is paused)
- [ ] 5 wrong PINs → forced logout; correct PIN rejected until `pin_locked_until` passes
- [ ] Unlock returns fresh JWT; token stored and synced to all tabs
- [ ] Two tabs: activity in one resets the other; lock/unlock propagate
- [ ] Unsaved form data survives lock/unlock
- [ ] Expired JWT while locked → variant C, no 401 loop
- [ ] Setting PIN requires correct password (wrong password rejected server-side)
- [ ] Tenant toggle off → no lock, App Settings greyed out; toggle on → users without PIN get variant B at first lock
- [ ] pin_length 4↔6 change: old PIN still unlocks; settings page prompts update
- [ ] Impersonation session never PIN-locks
- [ ] Magic-link customer portal unaffected
- [ ] EN/SV/ES strings render
