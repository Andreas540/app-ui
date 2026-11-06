#!/usr/bin/env bash
# Regenerate db/00_live_schema_dump.sql from the live database and stamp it.
#
# Read-only against the database: --schema-only issues SELECTs against system
# catalogues. It overwrites the local dump file, which git protects.
#
#   npm run schema:dump
#
# DATABASE_URL must be Neon's DIRECT connection string, not the pooled one
# (no "-pooler" in the host) — pg_dump misbehaves through a connection pooler.
# Pass it inline so it never lands in a file:
#
#   DATABASE_URL="postgresql://...direct-host.../neondb" npm run schema:dump

set -euo pipefail

OUT="db/00_live_schema_dump.sql"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  echo "Use Neon's DIRECT connection string (no '-pooler' in the host):" >&2
  echo "  DATABASE_URL=\"postgresql://...\" npm run schema:dump" >&2
  exit 1
fi

if [[ "$DATABASE_URL" == *"-pooler"* ]]; then
  echo "Refusing to run: DATABASE_URL points at the Neon POOLER." >&2
  echo "pg_dump needs the direct connection string (host without '-pooler')." >&2
  exit 1
fi

# Highest-numbered migration present in the repo. Not proof of what is applied —
# there is no migration ledger — but it is what a later run compares against to
# notice the dump has fallen behind.
HIGHEST="$(ls db/ | grep -oE '^[0-9]+' | sort -n | tail -1)"

echo "Dumping schema (read-only)..."
pg_dump --schema-only --no-owner --no-privileges "$DATABASE_URL" > "$TMP"

if [ ! -s "$TMP" ]; then
  echo "pg_dump produced an empty file; leaving $OUT untouched." >&2
  exit 1
fi

{
  echo "-- ============================================================"
  echo "-- GENERATED FILE — do not edit by hand."
  echo "-- Regenerate with: npm run schema:dump"
  echo "--"
  echo "-- Generated:            $(date -u '+%Y-%m-%d %H:%M UTC')"
  echo "-- Highest migration in db/ at generation time: $HIGHEST"
  echo "--"
  echo "-- If db/ now contains a migration numbered above $HIGHEST, this dump is"
  echo "-- behind and must be regenerated before being trusted. Even when current,"
  echo "-- verify behaviour-critical things (trigger bodies, constraints, column"
  echo "-- types) against the live database — see CLAUDE.md."
  echo "-- ============================================================"
  echo
  cat "$TMP"
} > "$OUT"

echo "Wrote $OUT (migrations through $HIGHEST)."
echo "Review with: git diff --stat $OUT"
