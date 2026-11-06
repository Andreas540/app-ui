#!/usr/bin/env bash
# Is db/00_live_schema_dump.sql still trustworthy?
#
#   npm run schema:check
#
# Compares the migration high-water mark recorded in the dump's header against the
# highest-numbered migration now in db/. Reads nothing but local files.
#
# This cannot tell you what is actually applied to the database — there is no
# migration ledger. It only catches the dump falling behind the repo, which is the
# failure that has already bitten us.

set -euo pipefail

DUMP="db/00_live_schema_dump.sql"

if [ ! -f "$DUMP" ]; then
  echo "MISSING: $DUMP — run: npm run schema:dump" >&2
  exit 1
fi

STAMPED="$(grep -oE 'Highest migration in db/ at generation time: [0-9]+' "$DUMP" | grep -oE '[0-9]+$' || true)"
GENERATED="$(grep -oE 'Generated: +[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]+ UTC' "$DUMP" | sed 's/Generated: *//' || true)"
HIGHEST="$(ls db/ | grep -oE '^[0-9]+' | sort -n | tail -1)"

if [ -z "$STAMPED" ]; then
  echo "STALE: $DUMP has no generation stamp, so it predates this procedure."
  echo "       Highest migration in db/ is $HIGHEST."
  echo "       Treat it as untrustworthy and run: npm run schema:dump"
  exit 1
fi

if [ "$STAMPED" -lt "$HIGHEST" ]; then
  echo "BEHIND: dump was generated at migration $STAMPED, db/ now has $HIGHEST."
  echo "        Generated $GENERATED"
  echo "        Run: npm run schema:dump"
  exit 1
fi

echo "OK: dump covers migrations through $STAMPED (generated $GENERATED)."
echo "    Still verify trigger bodies, constraints and column types against the"
echo "    live database before relying on them — see CLAUDE.md."
