#!/bin/sh
# Copies the live database into the local development database (port 5433), replacing everything in it.
#   1. Put the live Postgres public URL in apps/api/.env.live as LIVE_DATABASE_URL=... (git ignores that file).
#   2. npm run db:pull-live
# Your current local database is saved to ~/uddokta-backups first. The live copy is deleted after loading, live
# sign-in sessions and email links are cleared, and the outbox is emptied, so nothing local can act as a live user.
set -e
cd "$(dirname "$0")/.."
ENV_FILE=apps/api/.env.live
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE. Add one line: LIVE_DATABASE_URL=<the live Postgres public URL>"; exit 1; }
LIVE_URL=$(grep '^LIVE_DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2-)
[ -n "$LIVE_URL" ] || { echo "$ENV_FILE has no LIVE_DATABASE_URL line."; exit 1; }
LOCAL_DB=uddokta
export PGPORT=5433

# pg_dump must be at least as new as the live server.
LIVE_MAJOR=$(psql "$LIVE_URL" -tAc "show server_version_num" | cut -c1-2)
TOOLS=/opt/homebrew/opt/postgresql@$LIVE_MAJOR/bin
[ -x "$TOOLS/pg_dump" ] || { echo "The live database runs Postgres $LIVE_MAJOR. Install its tools first: brew install postgresql@$LIVE_MAJOR"; exit 1; }

BACKUPS="$HOME/uddokta-backups"
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUPS" && chmod 700 "$BACKUPS"
echo "Saving the current local database to $BACKUPS/local-$STAMP.dump"
pg_dump -h /tmp -U uddokta -Fc -f "$BACKUPS/local-$STAMP.dump" "$LOCAL_DB"

DUMP="$BACKUPS/live-$STAMP.sql"
echo "Downloading the live database (Postgres $LIVE_MAJOR)…"
"$TOOLS/pg_dump" "$LIVE_URL" --no-owner --format=plain -f "$DUMP"
chmod 600 "$DUMP"

echo "Replacing the local database…"
dropdb -h /tmp -U uddokta --force "$LOCAL_DB"
createdb -h /tmp -U uddokta "$LOCAL_DB"
# Settings newer servers write that older ones do not know are dropped; grants to live-only roles are skipped.
grep -v '^SET transaction_timeout' "$DUMP" | psql -h /tmp -U uddokta -d "$LOCAL_DB" -q -v ON_ERROR_STOP=0 2>&1 | grep -v 'role "postgres" does not exist' || true
rm -f "$DUMP"

psql -h /tmp -U uddokta -d "$LOCAL_DB" -q -c "delete from sessions; delete from account_tokens; delete from outbox_emails; delete from login_failures;"
npm run db:migrate --silent
echo "Done. Local now holds a copy of live (sign in again with your live password). Previous local data: $BACKUPS/local-$STAMP.dump"
