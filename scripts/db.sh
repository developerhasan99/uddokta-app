#!/bin/sh
# Local development Postgres, kept in .pgdata on port 5433 so it never touches a system install.
set -e
cd "$(dirname "$0")/.."
export PGPORT=5433
case "$1" in
  start)
    [ -d .pgdata ] || initdb -D .pgdata -U uddokta --auth=trust -E UTF8 >/dev/null
    pg_ctl -D .pgdata -o "-p 5433 -k /tmp" -l .pgdata/server.log -w start >/dev/null
    for name in uddokta uddokta_test; do
      psql -h /tmp -U uddokta -d postgres -tc "select 1 from pg_database where datname='$name'" | grep -q 1 \
        || createdb -h /tmp -U uddokta "$name"
    done
    echo "Postgres is running on port 5433"
    ;;
  stop) pg_ctl -D .pgdata stop ;;
  *) echo "usage: scripts/db.sh start|stop"; exit 1 ;;
esac
